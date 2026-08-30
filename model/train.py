"""Train the Vesper ship-mind on CPU with time-budgeted cosine schedule."""
import json, math, os, sys, time
import numpy as np
import torch
sys.path.insert(0, os.path.dirname(__file__))
from model_def import GPT, Config

torch.set_num_threads(2)
torch.manual_seed(7)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.environ.get("CORPUS_BUILD", os.path.join(ROOT, "corpus", "build"))
CKPT = os.environ.get("CKPT_DIR", os.path.join(ROOT, "model", "ckpt"))
os.makedirs(CKPT, exist_ok=True)
HOURS = float(os.environ.get("HOURS", "2.6"))
BATCH = 24

d = np.load(os.path.join(BUILD, "dataset.npz"))
flat, bounds, weights = d["flat_train"], d["bounds_train"], d["weights_train"]
val = torch.from_numpy(d["flat_val"].astype(np.int64))
n_samples = len(weights)
print(f"train tokens={len(flat)} val tokens={len(val)} samples={n_samples}", flush=True)

c = Config()
model = GPT(c)
print(f"params={model.num_params()}", flush=True)
opt = torch.optim.AdamW(model.parameters(), lr=1.5e-3, betas=(0.9, 0.95), weight_decay=0.1)

rng = np.random.default_rng(7)
# weighted sample order, reshuffled each epoch, concatenated into a stream
def epoch_stream():
    idx = np.repeat(np.arange(n_samples), weights)
    rng.shuffle(idx)
    parts = [flat[bounds[i]:bounds[i + 1]] for i in idx]
    return np.concatenate(parts).astype(np.int64)

stream = epoch_stream(); spos = 0
def get_batch():
    global stream, spos
    need = BATCH * (c.block_size + 1)
    if spos + need > len(stream):
        stream = epoch_stream(); spos = 0
    x = np.stack([stream[spos + i * (c.block_size + 1): spos + (i + 1) * (c.block_size + 1)]
                  for i in range(BATCH)])
    spos += need
    t = torch.from_numpy(x)
    return t[:, :-1].contiguous(), t[:, 1:].contiguous()

@torch.no_grad()
def val_loss():
    model.eval()
    losses = []
    B, T = 4, c.block_size
    for s in range(0, len(val) - (T + 1) * B, (T + 1) * B):
        x = torch.stack([val[s + i * (T + 1): s + i * (T + 1) + T] for i in range(B)])
        y = torch.stack([val[s + i * (T + 1) + 1: s + i * (T + 1) + T + 1] for i in range(B)])
        _, l = model(x, y)
        losses.append(l.item())
    model.train()
    return sum(losses) / max(1, len(losses))

# measure step time to fix the schedule
model.train()
t0 = time.time()
for _ in range(8):
    x, y = get_batch()
    _, loss = model(x, y)
    opt.zero_grad(); loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()
step_t = (time.time() - t0) / 8
TOTAL = max(int(os.environ.get("MIN_STEPS", "600")), int(HOURS * 3600 / step_t))
WARM = max(60, TOTAL // 50)
print(f"step_time={step_t:.2f}s total_steps={TOTAL} (~{TOTAL*BATCH*c.block_size/1e6:.0f}M tokens)", flush=True)

def lr_at(it):
    if it < WARM: return 1.5e-3 * it / WARM
    p = (it - WARM) / max(1, TOTAL - WARM)
    return 1e-4 + 0.5 * (1.5e-3 - 1e-4) * (1 + math.cos(math.pi * min(1.0, p)))

best = 1e9
t_start = time.time()
for it in range(TOTAL):
    for g in opt.param_groups: g["lr"] = lr_at(it)
    x, y = get_batch()
    _, loss = model(x, y)
    opt.zero_grad(); loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()
    if it % 50 == 0:
        el = time.time() - t_start
        print(f"it {it}/{TOTAL} loss {loss.item():.4f} lr {lr_at(it):.2e} elapsed {el/60:.1f}m", flush=True)
    if it % 250 == 0 or it == TOTAL - 1:
        vl = val_loss()
        print(f"it {it} VAL {vl:.4f}", flush=True)
        torch.save({"model": model.state_dict(), "it": it, "val": vl},
                   os.path.join(CKPT, "last.pt"))
        if vl < best:
            best = vl
            torch.save({"model": model.state_dict(), "it": it, "val": vl},
                       os.path.join(CKPT, "best.pt"))
print(f"done. best val {best:.4f}", flush=True)

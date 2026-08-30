"""Quantize checkpoint to int8, pack for JS, emit parity test vectors."""
import base64, json, os, struct, sys
import numpy as np
import torch
sys.path.insert(0, os.path.dirname(__file__))
from model_def import GPT, Config

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.environ.get("CORPUS_BUILD", os.path.join(ROOT, "corpus", "build"))
CKPT = os.environ.get("CKPT", os.path.join(ROOT, "model", "ckpt", "best.pt"))
OUTJS = os.path.join(ROOT, "game", "weights.js")
OUTVEC = os.path.join(ROOT, "model", "test_vectors.json")

c = Config()
model = GPT(c)
sd = torch.load(CKPT, map_location="cpu")
print("checkpoint it", sd.get("it"), "val", sd.get("val"))
model.load_state_dict(sd["model"])
model.eval()

buf = bytearray()
manifest = []

def align4():
    while len(buf) % 4: buf.append(0)

def add_f32(name, t):
    align4()
    off = len(buf)
    arr = t.detach().numpy().astype(np.float32)
    buf.extend(arr.tobytes())
    manifest.append({"name": name, "dtype": "f32", "shape": list(arr.shape), "off": off})

def add_i8(name, t):
    """Per-row int8 quantization; returns dequantized tensor for parity sim."""
    w = t.detach().numpy().astype(np.float32)
    rows = w.shape[0]
    flatcols = w.size // rows
    w2 = w.reshape(rows, flatcols)
    scale = np.abs(w2).max(axis=1) / 127.0
    scale[scale == 0] = 1e-8
    q = np.clip(np.round(w2 / scale[:, None]), -127, 127).astype(np.int8)
    off = len(buf)
    buf.extend(q.tobytes())
    align4()
    scale_off = len(buf)
    buf.extend(scale.astype(np.float32).tobytes())
    manifest.append({"name": name, "dtype": "i8", "shape": list(w.shape),
                     "off": off, "scaleOff": scale_off})
    return torch.from_numpy((q.astype(np.float32) * scale[:, None]).reshape(w.shape))

# quantize AND write dequantized values back into the model for exact parity sim
with torch.no_grad():
    model.tok_emb.weight.copy_(add_i8("tok_emb", model.tok_emb.weight))
    model.pos_emb.weight.copy_(add_i8("pos_emb", model.pos_emb.weight))
    for l, blk in enumerate(model.blocks):
        add_f32(f"b{l}.ln1.g", blk.ln1.weight); add_f32(f"b{l}.ln1.b", blk.ln1.bias)
        blk.attn.qkv.weight.copy_(add_i8(f"b{l}.qkv.w", blk.attn.qkv.weight))
        add_f32(f"b{l}.qkv.b", blk.attn.qkv.bias)
        blk.attn.proj.weight.copy_(add_i8(f"b{l}.proj.w", blk.attn.proj.weight))
        add_f32(f"b{l}.proj.b", blk.attn.proj.bias)
        add_f32(f"b{l}.ln2.g", blk.ln2.weight); add_f32(f"b{l}.ln2.b", blk.ln2.bias)
        blk.mlp.fc.weight.copy_(add_i8(f"b{l}.fc.w", blk.mlp.fc.weight))
        add_f32(f"b{l}.fc.b", blk.mlp.fc.bias)
        blk.mlp.proj.weight.copy_(add_i8(f"b{l}.mproj.w", blk.mlp.proj.weight))
        add_f32(f"b{l}.mproj.b", blk.mlp.proj.bias)
    add_f32("ln_f.g", model.ln_f.weight); add_f32("ln_f.b", model.ln_f.bias)

b64 = base64.b64encode(bytes(buf)).decode()
tok = json.load(open(os.path.join(BUILD, "tokenizer.json")))
config = {"vocab": c.vocab_size, "block": c.block_size, "nLayer": c.n_layer,
          "nHead": c.n_head, "nEmbd": c.n_embd}
with open(OUTJS, "w") as f:
    f.write("// Auto-generated: int8-quantized Vesper ship-mind weights\n")
    f.write("const MODEL_PACK = " + json.dumps({"config": config, "manifest": manifest}))
    f.write(";\nMODEL_PACK.b64 = \"" + b64 + "\";\n")
    f.write("const TOKENIZER = " + json.dumps(tok) + ";\n")
    f.write("if (typeof module !== 'undefined') module.exports = {MODEL_PACK, TOKENIZER};\n")
print(f"weights.js: {os.path.getsize(OUTJS)/1e6:.2f} MB, params quantized")

# parity vectors: run the (dequantized) model on a prompt, dump logits of last pos
model.eval()

# minimal python mirror of the JS/py tokenizer for the test prompt
SPECIALS = tok["specials"]; BB = tok["byte_base"]
import re as _re
mr = {tuple(m): i for i, m in enumerate(tok["merges"])}
mn = {tuple(m): BB + 256 + i for i, m in enumerate(tok["merges"])}
CHUNK_RE = _re.compile(r" ?[a-zA-Z']+| ?[0-9]|[^a-zA-Z0-9]")
def enc(text):
    out, pos = [], 0
    while pos < len(text):
        matched = False
        if text[pos] == "[":
            for i, sp in enumerate(SPECIALS):
                if text.startswith(sp, pos): out.append(i); pos += len(sp); matched = True; break
        if matched: continue
        m = CHUNK_RE.match(text, pos)
        chunk = m.group(0) if m else text[pos]
        toks = [BB + b for b in chunk.encode()]
        while len(toks) > 1:
            best, bi = None, -1
            for j in range(len(toks) - 1):
                r = mr.get((toks[j], toks[j + 1]))
                if r is not None and (best is None or r < best): best, bi = r, j
            if best is None: break
            toks = toks[:bi] + [mn[(toks[bi], toks[bi + 1])]] + toks[bi + 2:]
        out += toks; pos += len(chunk)
    return out

prompt = "[HEAR] Is anyone alive on this ship? [ECHO]"
ids = enc(prompt)
with torch.no_grad():
    logits, _ = model(torch.tensor([ids]))
last = logits[0, -1].numpy()
top = np.argsort(-last)[:10]
json.dump({"prompt": prompt, "ids": ids,
           "top_ids": top.tolist(), "top_logits": last[top].tolist(),
           "logit_sum": float(last.sum()), "logit_max": float(last.max())},
          open(OUTVEC, "w"))
print("test vectors written:", [int(i) for i in top[:5]])

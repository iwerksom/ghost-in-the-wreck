"""Validate corpus, augment, train BPE tokenizer, build token dataset."""
import json, os, re, random, sys, collections
import numpy as np

random.seed(7)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.environ.get("CORPUS_RAW", os.path.join(ROOT, "corpus", "raw"))
OUT = os.environ.get("CORPUS_BUILD", os.path.join(ROOT, "corpus", "build"))
os.makedirs(OUT, exist_ok=True)

AUTHORS = ["REYNE", "CHO", "OKAFOR", "VEGA", "KIT", "ECHO"]
SPECIALS = (
    ["[END]", "[HEAR]", "[ECHO]", "[SYS]"]
    + [f"[VOICE:{a}]" for a in AUTHORS]
    + [f"[LOG:{a}:D" for a in AUTHORS]
)
N_SPECIAL = len(SPECIALS)  # 16
BYTE_BASE = N_SPECIAL      # byte b -> id BYTE_BASE + b
VOCAB_SIZE = 1024
N_MERGES = VOCAB_SIZE - N_SPECIAL - 256

# ---------------- load & validate ----------------
LOG_RE = re.compile(r"^\[LOG:(REYNE|CHO|OKAFOR|VEGA|KIT|ECHO):D(\d{3})\]\s*\n([\s\S]+?)\s*\[END\]$")
VOICE_RE = re.compile(r"^\[VOICE:(REYNE|CHO|OKAFOR|VEGA|KIT|ECHO)\]\s*([\s\S]+?)\s*\[END\]$")
DLG_RE = re.compile(r"^\[HEAR\]\s*([\s\S]+?)\s*\[ECHO\]\s*([\s\S]+?)\s*\[END\]$")
ECHO_RE = re.compile(r"^\[ECHO\]\s*([\s\S]+?)\s*\[END\]$")
SYS_RE = re.compile(r"^\[SYS\]\s*([\s\S]+?)\s*\[END\]$")

def clean(t):
    t = t.replace("’", "'").replace("‘", "'")
    t = t.replace("“", '"').replace("”", '"')
    t = t.replace("—", ", ").replace("–", ", ").replace("…", "...")
    t = t.replace("\r", "")
    t = "".join(ch if 32 <= ord(ch) < 127 or ch == "\n" else " " for ch in t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r" ?\n ?", "\n", t)
    return t.strip()

samples = []  # (kind, author_or_None, canonical_text)
bad = collections.Counter()
for fn in sorted(os.listdir(RAW)):
    txt = open(os.path.join(RAW, fn)).read()
    # split on [END] so multi-paragraph samples stay intact
    blocks = []
    for chunk in txt.split("[END]"):
        chunk = chunk.strip()
        if chunk: blocks.append(chunk + " [END]" if not chunk.startswith("[LOG") else chunk + "\n[END]")
    for b in blocks:
        b = clean(b)
        m = LOG_RE.match(b)
        if m:
            a, day, body = m.group(1), m.group(2), clean(m.group(3))
            if not (1 <= int(day) <= 460): bad["day"] += 1; continue
            samples.append(("log", a, f"[LOG:{a}:D{day}]\n{body}\n[END]")); continue
        m = VOICE_RE.match(b)
        if m:
            a, body = m.group(1), clean(m.group(2)).replace("\n", " ")
            samples.append(("voice", a, f"[VOICE:{a}] {body} [END]")); continue
        m = DLG_RE.match(b)
        if m:
            h, e = clean(m.group(1)).replace("\n", " "), clean(m.group(2)).replace("\n", " ")
            samples.append(("dlg", None, f"[HEAR] {h} [ECHO] {e} [END]")); continue
        m = ECHO_RE.match(b)
        if m:
            samples.append(("mono", "ECHO", f"[ECHO] {clean(m.group(1))} [END]")); continue
        m = SYS_RE.match(b)
        if m:
            samples.append(("sys", None, f"[SYS] {clean(m.group(1))} [END]")); continue
        bad["unparsed"] += 1

print("parsed:", collections.Counter(k for k, _, _ in samples))
print("rejected:", dict(bad))

# dedupe exact
seen = set(); uniq = []
for s in samples:
    if s[2] not in seen:
        seen.add(s[2]); uniq.append(s)
samples = uniq

# ---------------- augmentation: derived voice lines ----------------
SENT_RE = re.compile(r"[^.!?]*[.!?]")
derived = collections.defaultdict(list)
for kind, a, t in samples:
    if kind == "log" and a in AUTHORS:
        body = t.split("\n", 1)[1].rsplit("\n", 1)[0]
        for s in SENT_RE.findall(body.replace("\n", " ")):
            s = s.strip()
            if 30 <= len(s) <= 140 and not s.startswith("Reyne out"):
                derived[a].append(f"[VOICE:{a}] {s} [END]")
    if kind == "mono":
        body = t[len("[ECHO] "):-len(" [END]")]
        for s in SENT_RE.findall(body):
            s = s.strip()
            if 30 <= len(s) <= 140:
                derived["ECHO"].append(f"[VOICE:ECHO] {s} [END]")
aug = []
for a, lines in derived.items():
    random.shuffle(lines)
    aug += [("dvoice", a, l) for l in lines[:700]]
print("derived voice lines:", {a: min(len(v), 700) for a, v in derived.items()})
samples += aug

# ---------------- BPE training ----------------
CHUNK_RE = re.compile(r" ?[a-zA-Z']+| ?[0-9]|[^a-zA-Z0-9]")

def chunks_of(text):
    return CHUNK_RE.findall(text)

# strip marker tokens out before BPE corpus stats (they are special tokens)
MARKER_RE = re.compile("|".join(re.escape(s) for s in SPECIALS))
bpe_text = []
for _, _, t in samples:
    bpe_text.append(MARKER_RE.sub(" ", t))
word_freq = collections.Counter()
for t in bpe_text:
    word_freq.update(chunks_of(t))
print("unique chunks:", len(word_freq))

# classic BPE over the chunk-frequency table, on byte ids
words = {w: [BYTE_BASE + b for b in w.encode("utf-8")] for w in word_freq}
merges = []  # list of (id1, id2) -> new id
next_id = BYTE_BASE + 256
for i in range(N_MERGES):
    pairs = collections.Counter()
    for w, f in word_freq.items():
        toks = words[w]
        for j in range(len(toks) - 1):
            pairs[(toks[j], toks[j + 1])] += f
    if not pairs: break
    (a, b), cnt = pairs.most_common(1)[0]
    if cnt < 3: break
    merges.append((a, b))
    for w in words:
        toks = words[w]; j = 0; out = []
        while j < len(toks):
            if j < len(toks) - 1 and toks[j] == a and toks[j + 1] == b:
                out.append(next_id); j += 2
            else:
                out.append(toks[j]); j += 1
        words[w] = out
    next_id += 1
print("merges trained:", len(merges))

merge_rank = {m: i for i, m in enumerate(merges)}
merge_new_id = {m: BYTE_BASE + 256 + i for i, m in enumerate(merges)}

def bpe_encode_chunk(chunk):
    toks = [BYTE_BASE + b for b in chunk.encode("utf-8")]
    while len(toks) > 1:
        best, bi = None, -1
        for j in range(len(toks) - 1):
            r = merge_rank.get((toks[j], toks[j + 1]))
            if r is not None and (best is None or r < best):
                best, bi = r, j
        if best is None: break
        toks = toks[:bi] + [merge_new_id[(toks[bi], toks[bi + 1])]] + toks[bi + 2:]
    return toks

enc_cache = {}
def encode(text):
    out = []
    pos = 0
    while pos < len(text):
        m = MARKER_RE.match(text, pos)
        if m:
            out.append(SPECIALS.index(m.group(0)))
            pos = m.end(); continue
        m = CHUNK_RE.match(text, pos)
        chunk = m.group(0) if m else text[pos]
        if chunk not in enc_cache:
            enc_cache[chunk] = bpe_encode_chunk(chunk)
        out += enc_cache[chunk]
        pos += len(chunk)
    return out

# id -> string table (for JS decode)
id2str = [""] * VOCAB_SIZE
for i, s in enumerate(SPECIALS): id2str[i] = s
for b in range(256): id2str[BYTE_BASE + b] = chr(b) if 32 <= b < 127 or b == 10 else ""
for (a, b), nid in merge_new_id.items():
    pass
# build merge strings iteratively (merges reference earlier ids)
for i, (a, b) in enumerate(merges):
    id2str[BYTE_BASE + 256 + i] = id2str[a] + id2str[b]

# ---------------- tokenize all samples ----------------
kind_weight = {"log": 1, "mono": 2, "dlg": 2, "voice": 2, "dvoice": 1, "sys": 1}
tokenized = []
for kind, a, t in samples:
    ids = encode(t + "\n\n")
    tokenized.append((kind, ids))
total_tokens = sum(len(ids) for _, ids in tokenized)
total_weighted = sum(len(ids) * kind_weight[k] for k, ids in tokenized)
print(f"samples={len(tokenized)} tokens={total_tokens} weighted_epoch_tokens={total_weighted}")
avg_chars = sum(len(t) for _, _, t in samples) / total_tokens
print(f"chars per token: {avg_chars:.2f}")

random.shuffle(tokenized)
n_val = max(50, len(tokenized) // 33)
val, train = tokenized[:n_val], tokenized[n_val:]

flat_train = np.concatenate([np.array(ids, dtype=np.uint16) for _, ids in train])
bounds_train = np.cumsum([0] + [len(ids) for _, ids in train]).astype(np.int64)
weights_train = np.array([kind_weight[k] for k, _ in train], dtype=np.int16)
flat_val = np.concatenate([np.array(ids, dtype=np.uint16) for _, ids in val])

np.savez(os.path.join(OUT, "dataset.npz"),
         flat_train=flat_train, bounds_train=bounds_train,
         weights_train=weights_train, flat_val=flat_val)
json.dump({"specials": SPECIALS, "merges": merges, "id2str": id2str,
           "vocab_size": VOCAB_SIZE, "byte_base": BYTE_BASE},
          open(os.path.join(OUT, "tokenizer.json"), "w"))
print("wrote dataset.npz and tokenizer.json")

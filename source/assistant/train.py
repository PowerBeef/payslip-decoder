"""Trains the assistant's question model and writes src/assistant-model.js.

Model (fastText style): each question becomes hashed features (words, word pairs, 3-5 letter chunks),
whose embeddings are averaged and fed to one linear layer with a softmax over the question types.
Weights are stored as 4-bit integers (two per byte) with one scale per row: half the size of 8 bits, same accuracy.

    python3 train.py            # sweeps sizes, prints accuracy, exports the chosen model
    python3 train.py --report   # also prints every test question the model gets wrong

Test sets: test_questions.tsv and test_final.tsv were used while writing the training frames, so they pick
the model size. test_blind.tsv was written after the last change to the frames and is never used to choose
anything: it is the honest estimate of how often a new question is understood.
"""
import base64
import json
import os
import subprocess
import sys
import time

import numpy as np
import scipy.sparse as sp

from features import features

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'src', 'assistant-model.js')


def load_tsv(path):
    rows = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            if not line or line.startswith('#'):
                continue
            intent, q = line.split('\t', 1)
            rows.append((intent, q))
    return rows


def matrix(rows, buckets):
    data, ind, ptr = [], [], [0]
    for _, q in rows:
        f = features(q, buckets)
        if not f:
            f = [0]
        ids, counts = np.unique(f, return_counts=True)
        vals = counts / counts.sum()
        ind.extend(ids.tolist()); data.extend(vals.tolist()); ptr.append(len(ind))
    return sp.csr_matrix((np.array(data, np.float32), np.array(ind), np.array(ptr)), shape=(len(rows), buckets))


def train(X, y, K, dim, epochs=14, lr=0.02, batch=64, seed=1, l2=1e-6):
    rng = np.random.default_rng(seed)
    B = X.shape[1]
    E = rng.uniform(-1.0 / dim, 1.0 / dim, (B, dim)).astype(np.float32)
    W = np.zeros((dim, K), np.float32)
    b = np.zeros(K, np.float32)
    params = [E, W, b]
    m = [np.zeros_like(p) for p in params]
    v = [np.zeros_like(p) for p in params]
    t = 0
    n = X.shape[0]
    Y = np.eye(K, dtype=np.float32)[y]
    for ep in range(epochs):
        order = rng.permutation(n)
        for s in range(0, n, batch):
            idx = order[s:s + batch]
            Xb = X[idx]
            h = Xb @ E
            z = h @ W + b
            z -= z.max(1, keepdims=True)
            P = np.exp(z); P /= P.sum(1, keepdims=True)
            G = (P - Y[idx]) / len(idx)
            grads = [Xb.T @ (G @ W.T) + l2 * E, h.T @ G + l2 * W, G.sum(0)]
            t += 1
            for i, (p, g) in enumerate(zip(params, grads)):
                m[i] = 0.9 * m[i] + 0.1 * g
                v[i] = 0.999 * v[i] + 0.001 * g * g
                p -= lr * (m[i] / (1 - 0.9 ** t)) / (np.sqrt(v[i] / (1 - 0.999 ** t)) + 1e-8)
    return E, W, b


BITS = 4
QMAX = 2 ** (BITS - 1) - 1  # values -7..7


def quantize(E):
    s = (np.abs(E).max(1) / QMAX).astype(np.float32)
    s[s == 0] = 1e-8
    q = np.clip(np.round(E / s[:, None]), -QMAX, QMAX).astype(np.int8)
    return q, s


def pack4(q):
    # two values per byte, each stored as value + 8 (low nibble first); read back in src/assistant.js
    u = (q.reshape(-1) + 8).astype(np.uint8)
    if u.size % 2:
        u = np.append(u, np.uint8(8))
    return (u[0::2] | (u[1::2] << 4)).astype(np.uint8)


def predict(X, E, W, b):
    z = (X @ E) @ W + b
    z -= z.max(1, keepdims=True)
    P = np.exp(z); P /= P.sum(1, keepdims=True)
    return P


def main():
    report = '--report' in sys.argv
    gen = subprocess.run([sys.executable, os.path.join(HERE, 'gen_data.py')], capture_output=True, text=True, check=True).stdout
    train_rows = [tuple(l.split('\t', 1)) for l in gen.splitlines() if l]
    test_rows = load_tsv(os.path.join(HERE, 'test_questions.tsv'))
    fin = os.path.join(HERE, 'test_final.tsv')
    if os.path.exists(fin):
        test_rows += load_tsv(fin)
    blind_path = os.path.join(HERE, 'test_blind.tsv')
    blind_rows = load_tsv(blind_path) if os.path.exists(blind_path) else []
    intents = sorted({i for i, _ in train_rows})
    K = len(intents); ix = {k: i for i, k in enumerate(intents)}
    missing = sorted({i for i, _ in test_rows} - set(intents))
    if missing:
        raise SystemExit('test intents not in training: ' + ', '.join(missing))
    ytr = np.array([ix[i] for i, _ in train_rows]); yte = np.array([ix[i] for i, _ in test_rows])
    print(f'{len(train_rows)} training questions, {len(test_rows)} hand-written test questions, {K} question types')
    results = []
    # small enough to sit in the page: at most about 160 KB of weights
    for buckets, dims in ((4096, (16, 24, 32)), (8192, (16,))):
        Xtr = matrix(train_rows, buckets); Xte = matrix(test_rows, buckets)
        for dim in dims:
            t0 = time.time()
            E, W, b = train(Xtr, ytr, K, dim)
            q, s = quantize(E)
            Eq = q.astype(np.float32) * s[:, None]
            acc = (predict(Xte, E, W, b).argmax(1) == yte).mean()
            accq = (predict(Xte, Eq, W, b).argmax(1) == yte).mean()
            size = buckets * dim * BITS // 8 + buckets * 4 + dim * K * 4
            results.append((buckets, dim, acc, accq, size, E, W, b, q, s))
            print(f'  buckets {buckets:5d} dim {dim:2d}: test accuracy {acc:.3f} (4-bit {accq:.3f})  {size / 1024:.0f} KB  {time.time() - t0:.0f}s')
    best = max(r[3] for r in results)
    # the smallest model within half a point of the best 4-bit accuracy (a few KB matter less than a right answer)
    pick = sorted([r for r in results if r[3] >= best - 0.005], key=lambda r: r[4])[0]
    buckets, dim, acc, accq, size, E, W, b, q, s = pick
    print(f'chosen: buckets {buckets}, dim {dim}, 4-bit test accuracy {accq:.3f}, {size / 1024:.0f} KB of weights')
    Xte = matrix(test_rows, buckets)
    Eq = q.astype(np.float32) * s[:, None]
    P = predict(Xte, Eq, W, b)
    if report:
        for (gold, qtext), p in zip(test_rows, P):
            k = int(p.argmax())
            if intents[k] != gold:
                print(f'  MISS {gold:14s} -> {intents[k]:14s} {p[k]:.2f}  {qtext}')
    if blind_rows:
        Xb = matrix(blind_rows, buckets); yb = np.array([ix[i] for i, _ in blind_rows])
        print(f'blind test (never used to choose): {(predict(Xb, Eq, W, b).argmax(1) == yb).mean():.3f} of {len(blind_rows)} (model alone, before the app\'s rules)')
    conf = P.max(1)
    right = P.argmax(1) == yte
    print(f'confidence when right: median {np.median(conf[right]):.2f}; when wrong: median {np.median(conf[~right]) if (~right).any() else 0:.2f}')
    b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    model = {'v': 2, 'bits': BITS, 'buckets': buckets, 'dim': dim, 'intents': intents, 'e': b64(pack4(q)), 's': b64(s), 'w': b64(W.astype(np.float32)), 'b': [round(float(x), 6) for x in b],
             'acc': round(float(accq), 4), 'trainedOn': len(train_rows)}
    js = ('/* Generated by source/assistant/train.py from gen_data.py; do not edit. The assistant\'s question model:\n'
          f'   {len(train_rows)} generated questions, {K} question types, hashed features ({buckets} buckets x {dim}), 4-bit weights.\n'
          f'   Accuracy on the {len(test_rows)} hand-written test questions: {accq:.1%}. */\n'
          '(globalThis.PD = globalThis.PD || {}).ASK_MODEL = ' + json.dumps(model, separators=(',', ':')) + ';\n')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(js)
    # predictions the JS side must reproduce (tests/assistant.mjs)
    with open(os.path.join(HERE, 'parity.json'), 'w', encoding='utf-8') as f:
        json.dump([{'q': qt, 'intent': intents[int(p.argmax())], 'p': round(float(p.max()), 4)} for (_, qt), p in zip(test_rows, P)], f, ensure_ascii=False)
    print(f'wrote {os.path.relpath(OUT, HERE)} ({len(js) / 1024:.0f} KB)')


if __name__ == '__main__':
    main()

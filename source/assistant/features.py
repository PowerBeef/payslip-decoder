"""Text normalisation and hashed features for the assistant's question model.

This must stay identical to normalize() and features() in src/assistant.js: the model is trained here and
runs there. tests/assistant.mjs checks that both sides give the same predictions.
"""
import unicodedata
import re

BUCKETS = 8192  # overwritten by train.py's choice and exported with the weights


def normalize(text):
    t = unicodedata.normalize('NFD', text.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    t = t.replace('œ', 'oe').replace('æ', 'ae').replace('ß', 'ss')
    t = re.sub(r'[^a-z0-9]+', ' ', t)
    return t.strip()


def tokens(text):
    return [w for w in normalize(text).split(' ') if w]


def fnv1a(s):
    h = 0x811C9DC5
    for ch in s.encode('ascii'):
        h ^= ch
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def feature_strings(text):
    toks = tokens(text)
    out = []
    for t in toks:
        out.append('w:' + t)
        if len(t) >= 2:
            w = '<' + t + '>'
            for n in (3, 4, 5):
                for i in range(0, len(w) - n + 1):
                    out.append('c:' + w[i:i + n])
    for a, b in zip(toks, toks[1:]):
        out.append('b:' + a + '_' + b)
    return out


def features(text, buckets):
    return [fnv1a(f) % buckets for f in feature_strings(text)]

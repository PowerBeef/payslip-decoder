// Encrypts an agreement pack (used by build.mjs for the real pack and by the tests for a made-up one).
// Format 2: the pack is encrypted once with a random key (AES-256-GCM). That key is then wrapped once per accepted
// spelling of "<employer word>|<city>", each wrap with a key derived by PBKDF2-SHA-256 from that spelling. All wraps
// share one salt, so the app derives one key per spelling it reads on a payslip and tries it on every wrap.
// A spelling given as { m, fit: true } is a fallback (a merged city's official name, which another workplace of the
// same employer may print too): its wrap is marked, and the app applies the pack only to a payslip whose hourly rates
// are on the pack's wage scales.
import { webcrypto as wc } from 'crypto';

const b64 = (u) => Buffer.from(u).toString('base64');

export async function encryptPack(obj, materials, iter) {
  materials = [].concat(materials);
  const salt = wc.getRandomValues(new Uint8Array(16)),
    iv = wc.getRandomValues(new Uint8Array(12));
  const cek = wc.getRandomValues(new Uint8Array(32));
  const content = await wc.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, content, new TextEncoder().encode(JSON.stringify(obj))));
  const slots = [];
  for (const x of materials) {
    const m = typeof x === 'string' ? x : x.m,
      fit = typeof x === 'object' && !!x.fit;
    const base = await wc.subtle.importKey('raw', new TextEncoder().encode(m), 'PBKDF2', false, ['deriveKey']);
    const kek = await wc.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    const siv = wc.getRandomValues(new Uint8Array(12));
    const slot = { iv: b64(siv), k: b64(new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv: siv }, kek, cek))) };
    if (fit) slot.fit = 1;
    slots.push(slot);
  }
  // the order of the wraps says nothing about which spelling is which
  for (let i = slots.length - 1; i > 0; i--) {
    const j = wc.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return { v: 2, iter, salt: b64(salt), iv: b64(iv), ct: b64(ct), slots };
}

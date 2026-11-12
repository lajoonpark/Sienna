// Placed brush strokes (brushstrokes.js save()/load()) as one binary blob, for the strokes baked at build
// time (other-optimizations branch, C1: scripts/bake-strokes.mjs writes app/strokes/shop.bin; the app reads
// it when its fingerprint matches the shop it built, so even the first start skips placing them).
//   blob = [u32 header length][header JSON][arrays, each 8-byte aligned]
//   header = { fingerprint, rng, layers: [{ count, taken: n, buffers: { name: n } }] }  (n = element counts)
export function packStrokes(fingerprint, state) {
  const parts = [];
  const header = { fingerprint, rng: state.rng, layers: [] };
  for (const l of state.layers) {
    const h = { count: l.count, taken: l.taken.length, buffers: {} };
    parts.push(l.taken);
    for (const [k, a] of Object.entries(l.buffers)) { h.buffers[k] = a.length; parts.push(a); }
    header.layers.push(h);
  }
  const head = new TextEncoder().encode(JSON.stringify(header));
  const pad = (n) => (n + 7) & ~7;
  let size = pad(4 + head.length);
  for (const p of parts) size += pad(p.byteLength);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, head.length, true);
  out.set(head, 4);
  let at = pad(4 + head.length);
  for (const p of parts) { out.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), at); at += pad(p.byteLength); }
  return out;
}

export function unpackStrokes(bytes) {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const n = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
  const pad = (x) => (x + 7) & ~7;
  let at = pad(4 + n);
  const take = (Type, len) => { const a = new Type(buf, at, len); at += pad(len * Type.BYTES_PER_ELEMENT); return a; };
  const layers = header.layers.map((h) => {
    const taken = take(Float64Array, h.taken);
    const buffers = {};
    for (const [k, len] of Object.entries(h.buffers)) buffers[k] = take(Float32Array, len);
    return { count: h.count, taken, buffers };
  });
  return { fingerprint: header.fingerprint, state: { rng: header.rng, layers } };
}

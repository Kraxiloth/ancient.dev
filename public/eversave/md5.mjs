// MD5 digest for an in-memory byte slice. The browser Web Crypto API does not expose MD5.
const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const constants = Uint32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);
const rotate = (value, count) => (value << count) | (value >>> (32 - count));

export function md5(bytes) {
  const length = bytes.length;
  const paddedLength = (length + 9 + 63) & ~63;
  const data = new Uint8Array(paddedLength);
  data.set(bytes);
  data[length] = 0x80;
  const view = new DataView(data.buffer);
  const bitLength = BigInt(length) * 8n;
  view.setUint32(paddedLength - 8, Number(bitLength & 0xffffffffn), true);
  view.setUint32(paddedLength - 4, Number(bitLength >> 32n & 0xffffffffn), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let offset = 0; offset < paddedLength; offset += 64) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g, shift;
      if (i < 16) { f = (b & c) | (~b & d); g = i; shift = shifts[i % 4]; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; shift = shifts[4 + i % 4]; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; shift = shifts[8 + i % 4]; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; shift = shifts[12 + i % 4]; }
      const next = (b + rotate((a + f + constants[i] + view.getUint32(offset + 4 * g, true)) >>> 0, shift)) >>> 0;
      a = d; d = c; c = b; b = next;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const digest = new Uint8Array(16);
  const output = new DataView(digest.buffer);
  [a0, b0, c0, d0].forEach((word, i) => output.setUint32(i * 4, word, true));
  return digest;
}

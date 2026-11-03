// A small PNG reader (no dependencies) for importing third-party sheets: greyscale, RGB, indexed (with tRNS
// transparency) and RGBA, 8-bit (and 1/2/4-bit indexed), all five row filters. Not interlaced.

import { inflateSync } from "node:zlib";

export interface Image { width: number; height: number; /** RGBA, width * height * 4 */ pixels: Uint8Array }

export function decodePng(buf: Buffer): Image {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let p = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette: Buffer | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString("ascii", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (kind === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === "PLTE") palette = data;
    else if (kind === "tRNS") trns = data;
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    p += 12 + len;
  }
  if (interlace) throw new Error("interlaced PNGs aren't supported");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`PNG colour type ${type} isn't supported`);
  if (depth !== 8 && !(type === 3 && [1, 2, 4].includes(depth))) throw new Error(`PNG bit depth ${depth} isn't supported for colour type ${type}`);
  const bpp = Math.max(1, (channels * depth) >> 3), stride = Math.ceil((width * channels * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat)), rows = new Uint8Array(stride * height);
  const paeth = (a: number, b: number, c: number) => { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i], a = i >= bpp ? rows[dst + i - bpp] : 0, b = y ? rows[dst - stride + i] : 0, c = y && i >= bpp ? rows[dst - stride + i - bpp] : 0;
      rows[dst + i] = (f === 0 ? x : f === 1 ? x + a : f === 2 ? x + b : f === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, c)) & 255;
    }
  }
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4, r = y * stride;
    if (type === 3) {
      const bit = x * depth, v = depth === 8 ? rows[r + x] : (rows[r + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      out[o] = palette![v * 3]; out[o + 1] = palette![v * 3 + 1]; out[o + 2] = palette![v * 3 + 2]; out[o + 3] = trns && v < trns.length ? trns[v] : 255;
    } else {
      const s = r + x * channels;
      const [R, G, B, A] = type === 0 ? [rows[s], rows[s], rows[s], 255] : type === 4 ? [rows[s], rows[s], rows[s], rows[s + 1]]
        : type === 2 ? [rows[s], rows[s + 1], rows[s + 2], 255] : [rows[s], rows[s + 1], rows[s + 2], rows[s + 3]];
      out[o] = R; out[o + 1] = G; out[o + 2] = B; out[o + 3] = A;
    }
  }
  return { width, height, pixels: out };
}

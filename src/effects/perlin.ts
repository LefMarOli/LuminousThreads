const perm = createxorperm(256);

function xorshift32(x: number): number {
  x *= 7;
  x &= 0xff;
  x = x ^ (x << 13);
  x = x ^ (x >> 17);
  x = x ^ (x << 5);
  return x;
}

function createxorperm(size: number): Uint8Array {
  const p = new Uint8Array(size * 2);
  for (let i = 0; i < p.length; ++i) {
    p[i] = xorshift32(i);
  }
  return p;
}

export function fractalPerlinNoise4d(
  x: number,
  y = 0,
  z = 0,
  w = 0,
  octaveCount = 4,
  persistence = 0.5,
  scaleFactor = 2,
  offset = 0.618,
): number {
  let noiseSum = perlinNoise4d(x, y, z, w);
  let maxValue = 1;
  const iSF = 1 / scaleFactor;
  let currentScaleFactor = scaleFactor;
  let currentPersistence = persistence;
  while (octaveCount > 1) {
    noiseSum +=
      perlinNoise4d(
        x * currentScaleFactor + offset,
        y * currentScaleFactor + offset,
        z * currentScaleFactor + offset,
        w * currentScaleFactor + offset,
      ) * currentPersistence;
    maxValue += currentPersistence;
    currentScaleFactor *= scaleFactor;
    currentPersistence *= persistence;
    offset *= iSF;
    octaveCount -= 1;
  }

  return noiseSum / maxValue;
}

export function perlinNoise4d(w: number, x = 0, y = 0, z = 0): number {
  let ww = Math.floor(w);
  const w0 = w - ww;
  const w1 = w0 - 1;
  ww &= 255;

  let xw = Math.floor(x);
  const x0 = x - xw;
  const x1 = x0 - 1;
  xw &= 255;

  let yw = Math.floor(y);
  const y0 = y - yw;
  const y1 = y0 - 1;
  yw &= 255;

  let zw = Math.floor(z);
  const z0 = z - zw;
  const z1 = z0 - 1;
  zw &= 255;

  const r0 = perm[ww] + xw;
  const r1 = perm[ww + 1] + xw;

  const r00 = perm[r0] + yw;
  const r10 = perm[r1] + yw;
  const r01 = perm[r0 + 1] + yw;
  const r11 = perm[r1 + 1] + yw;

  const r000 = perm[r00] + zw;
  const r100 = perm[r10] + zw;
  const r010 = perm[r01] + zw;
  const r110 = perm[r11] + zw;
  const r001 = perm[r00 + 1] + zw;
  const r101 = perm[r10 + 1] + zw;
  const r011 = perm[r01 + 1] + zw;
  const r111 = perm[r11 + 1] + zw;

  let a = perm[r000];
  let b = perm[r100];
  let c = perm[r010];
  let d = perm[r110];
  let e = perm[r001];
  let f = perm[r101];
  let g = perm[r011];
  let h = perm[r111];
  let i = perm[r000 + 1];
  let j = perm[r100 + 1];
  let k = perm[r010 + 1];
  let l = perm[r110 + 1];
  let m = perm[r001 + 1];
  let n = perm[r101 + 1];
  let o = perm[r011 + 1];
  let p = perm[r111 + 1];

  //prettier-ignore
  {
  switch    (a & 15) {
    case  0: a = ( w0 + x0 + y0 + z0); break;
    case  1: a = (-w0 + x0 + y0 + z0); break;
    case  2: a = ( w0 - x0 + y0 + z0); break;
    case  3: a = (-w0 - x0 + y0 + z0); break;
    case  4: a = ( w0 + x0 - y0 + z0); break;
    case  5: a = (-w0 + x0 - y0 + z0); break;
    case  6: a = ( w0 - x0 - y0 + z0); break;
    case  7: a = (-w0 - x0 - y0 + z0); break;
    case  8: a = ( w0 + x0 + y0 - z0); break;
    case  9: a = (-w0 + x0 + y0 - z0); break;
    case 10: a = ( w0 - x0 + y0 - z0); break;
    case 11: a = (-w0 - x0 + y0 - z0); break;
    case 12: a = ( w0 + x0 - y0 - z0); break;
    case 13: a = (-w0 + x0 - y0 - z0); break;
    case 14: a = ( w0 - x0 - y0 - z0); break;
    case 15: a = (-w0 - x0 - y0 - z0); break;
    default: a = 0; break;
  }
  switch    (b & 15) {
    case  0: b = ( w1 + x0 + y0 + z0); break;
    case  1: b = (-w1 + x0 + y0 + z0); break;
    case  2: b = ( w1 - x0 + y0 + z0); break;
    case  3: b = (-w1 - x0 + y0 + z0); break;
    case  4: b = ( w1 + x0 - y0 + z0); break;
    case  5: b = (-w1 + x0 - y0 + z0); break;
    case  6: b = ( w1 - x0 - y0 + z0); break;
    case  7: b = (-w1 - x0 - y0 + z0); break;
    case  8: b = ( w1 + x0 + y0 - z0); break;
    case  9: b = (-w1 + x0 + y0 - z0); break;
    case 10: b = ( w1 - x0 + y0 - z0); break;
    case 11: b = (-w1 - x0 + y0 - z0); break;
    case 12: b = ( w1 + x0 - y0 - z0); break;
    case 13: b = (-w1 + x0 - y0 - z0); break;
    case 14: b = ( w1 - x0 - y0 - z0); break;
    case 15: b = (-w1 - x0 - y0 - z0); break;
    default: b = 0; break;
  }
  switch    (c & 15) {
    case  0: c = ( w0 + x1 + y0 + z0); break;
    case  1: c = (-w0 + x1 + y0 + z0); break;
    case  2: c = ( w0 - x1 + y0 + z0); break;
    case  3: c = (-w0 - x1 + y0 + z0); break;
    case  4: c = ( w0 + x1 - y0 + z0); break;
    case  5: c = (-w0 + x1 - y0 + z0); break;
    case  6: c = ( w0 - x1 - y0 + z0); break;
    case  7: c = (-w0 - x1 - y0 + z0); break;
    case  8: c = ( w0 + x1 + y0 - z0); break;
    case  9: c = (-w0 + x1 + y0 - z0); break;
    case 10: c = ( w0 - x1 + y0 - z0); break;
    case 11: c = (-w0 - x1 + y0 - z0); break;
    case 12: c = ( w0 + x1 - y0 - z0); break;
    case 13: c = (-w0 + x1 - y0 - z0); break;
    case 14: c = ( w0 - x1 - y0 - z0); break;
    case 15: c = (-w0 - x1 - y0 - z0); break;
    default: c = 0; break;
  }
  switch    (d & 15) {
    case  0: d = ( w1 + x1 + y0 + z0); break;
    case  1: d = (-w1 + x1 + y0 + z0); break;
    case  2: d = ( w1 - x1 + y0 + z0); break;
    case  3: d = (-w1 - x1 + y0 + z0); break;
    case  4: d = ( w1 + x1 - y0 + z0); break;
    case  5: d = (-w1 + x1 - y0 + z0); break;
    case  6: d = ( w1 - x1 - y0 + z0); break;
    case  7: d = (-w1 - x1 - y0 + z0); break;
    case  8: d = ( w1 + x1 + y0 - z0); break;
    case  9: d = (-w1 + x1 + y0 - z0); break;
    case 10: d = ( w1 - x1 + y0 - z0); break;
    case 11: d = (-w1 - x1 + y0 - z0); break;
    case 12: d = ( w1 + x1 - y0 - z0); break;
    case 13: d = (-w1 + x1 - y0 - z0); break;
    case 14: d = ( w1 - x1 - y0 - z0); break;
    case 15: d = (-w1 - x1 - y0 - z0); break;
    default: d = 0; break;
  }
  switch    (e & 15) {
    case  0: e = ( w0 + x0 + y1 + z0); break;
    case  1: e = (-w0 + x0 + y1 + z0); break;
    case  2: e = ( w0 - x0 + y1 + z0); break;
    case  3: e = (-w0 - x0 + y1 + z0); break;
    case  4: e = ( w0 + x0 - y1 + z0); break;
    case  5: e = (-w0 + x0 - y1 + z0); break;
    case  6: e = ( w0 - x0 - y1 + z0); break;
    case  7: e = (-w0 - x0 - y1 + z0); break;
    case  8: e = ( w0 + x0 + y1 - z0); break;
    case  9: e = (-w0 + x0 + y1 - z0); break;
    case 10: e = ( w0 - x0 + y1 - z0); break;
    case 11: e = (-w0 - x0 + y1 - z0); break;
    case 12: e = ( w0 + x0 - y1 - z0); break;
    case 13: e = (-w0 + x0 - y1 - z0); break;
    case 14: e = ( w0 - x0 - y1 - z0); break;
    case 15: e = (-w0 - x0 - y1 - z0); break;
    default: e = 0; break;
  }
  switch    (f & 15) {
    case  0: f = ( w1 + x0 + y1 + z0); break;
    case  1: f = (-w1 + x0 + y1 + z0); break;
    case  2: f = ( w1 - x0 + y1 + z0); break;
    case  3: f = (-w1 - x0 + y1 + z0); break;
    case  4: f = ( w1 + x0 - y1 + z0); break;
    case  5: f = (-w1 + x0 - y1 + z0); break;
    case  6: f = ( w1 - x0 - y1 + z0); break;
    case  7: f = (-w1 - x0 - y1 + z0); break;
    case  8: f = ( w1 + x0 + y1 - z0); break;
    case  9: f = (-w1 + x0 + y1 - z0); break;
    case 10: f = ( w1 - x0 + y1 - z0); break;
    case 11: f = (-w1 - x0 + y1 - z0); break;
    case 12: f = ( w1 + x0 - y1 - z0); break;
    case 13: f = (-w1 + x0 - y1 - z0); break;
    case 14: f = ( w1 - x0 - y1 - z0); break;
    case 15: f = (-w1 - x0 - y1 - z0); break;
    default: f = 0; break;
  }
  switch    (g & 15) {
    case  0: g = ( w0 + x1 + y1 + z0); break;
    case  1: g = (-w0 + x1 + y1 + z0); break;
    case  2: g = ( w0 - x1 + y1 + z0); break;
    case  3: g = (-w0 - x1 + y1 + z0); break;
    case  4: g = ( w0 + x1 - y1 + z0); break;
    case  5: g = (-w0 + x1 - y1 + z0); break;
    case  6: g = ( w0 - x1 - y1 + z0); break;
    case  7: g = (-w0 - x1 - y1 + z0); break;
    case  8: g = ( w0 + x1 + y1 - z0); break;
    case  9: g = (-w0 + x1 + y1 - z0); break;
    case 10: g = ( w0 - x1 + y1 - z0); break;
    case 11: g = (-w0 - x1 + y1 - z0); break;
    case 12: g = ( w0 + x1 - y1 - z0); break;
    case 13: g = (-w0 + x1 - y1 - z0); break;
    case 14: g = ( w0 - x1 - y1 - z0); break;
    case 15: g = (-w0 - x1 - y1 - z0); break;
    default: g = 0; break;
  }
  switch    (h & 15) {
    case  0: h = ( w1 + x1 + y1 + z0); break;
    case  1: h = (-w1 + x1 + y1 + z0); break;
    case  2: h = ( w1 - x1 + y1 + z0); break;
    case  3: h = (-w1 - x1 + y1 + z0); break;
    case  4: h = ( w1 + x1 - y1 + z0); break;
    case  5: h = (-w1 + x1 - y1 + z0); break;
    case  6: h = ( w1 - x1 - y1 + z0); break;
    case  7: h = (-w1 - x1 - y1 + z0); break;
    case  8: h = ( w1 + x1 + y1 - z0); break;
    case  9: h = (-w1 + x1 + y1 - z0); break;
    case 10: h = ( w1 - x1 + y1 - z0); break;
    case 11: h = (-w1 - x1 + y1 - z0); break;
    case 12: h = ( w1 + x1 - y1 - z0); break;
    case 13: h = (-w1 + x1 - y1 - z0); break;
    case 14: h = ( w1 - x1 - y1 - z0); break;
    case 15: h = (-w1 - x1 - y1 - z0); break;
    default: h = 0; break;
  }
  switch    (i & 15) {
    case  0: i = ( w0 + x0 + y0 + z1); break;
    case  1: i = (-w0 + x0 + y0 + z1); break;
    case  2: i = ( w0 - x0 + y0 + z1); break;
    case  3: i = (-w0 - x0 + y0 + z1); break;
    case  4: i = ( w0 + x0 - y0 + z1); break;
    case  5: i = (-w0 + x0 - y0 + z1); break;
    case  6: i = ( w0 - x0 - y0 + z1); break;
    case  7: i = (-w0 - x0 - y0 + z1); break;
    case  8: i = ( w0 + x0 + y0 - z1); break;
    case  9: i = (-w0 + x0 + y0 - z1); break;
    case 10: i = ( w0 - x0 + y0 - z1); break;
    case 11: i = (-w0 - x0 + y0 - z1); break;
    case 12: i = ( w0 + x0 - y0 - z1); break;
    case 13: i = (-w0 + x0 - y0 - z1); break;
    case 14: i = ( w0 - x0 - y0 - z1); break;
    case 15: i = (-w0 - x0 - y0 - z1); break;
    default: i = 0; break;
  }
  switch    (j & 15) {
    case  0: j = ( w1 + x0 + y0 + z1); break;
    case  1: j = (-w1 + x0 + y0 + z1); break;
    case  2: j = ( w1 - x0 + y0 + z1); break;
    case  3: j = (-w1 - x0 + y0 + z1); break;
    case  4: j = ( w1 + x0 - y0 + z1); break;
    case  5: j = (-w1 + x0 - y0 + z1); break;
    case  6: j = ( w1 - x0 - y0 + z1); break;
    case  7: j = (-w1 - x0 - y0 + z1); break;
    case  8: j = ( w1 + x0 + y0 - z1); break;
    case  9: j = (-w1 + x0 + y0 - z1); break;
    case 10: j = ( w1 - x0 + y0 - z1); break;
    case 11: j = (-w1 - x0 + y0 - z1); break;
    case 12: j = ( w1 + x0 - y0 - z1); break;
    case 13: j = (-w1 + x0 - y0 - z1); break;
    case 14: j = ( w1 - x0 - y0 - z1); break;
    case 15: j = (-w1 - x0 - y0 - z1); break;
    default: j = 0; break;
  }
  switch    (k & 15) {
    case  0: k = ( w0 + x1 + y0 + z1); break;
    case  1: k = (-w0 + x1 + y0 + z1); break;
    case  2: k = ( w0 - x1 + y0 + z1); break;
    case  3: k = (-w0 - x1 + y0 + z1); break;
    case  4: k = ( w0 + x1 - y0 + z1); break;
    case  5: k = (-w0 + x1 - y0 + z1); break;
    case  6: k = ( w0 - x1 - y0 + z1); break;
    case  7: k = (-w0 - x1 - y0 + z1); break;
    case  8: k = ( w0 + x1 + y0 - z1); break;
    case  9: k = (-w0 + x1 + y0 - z1); break;
    case 10: k = ( w0 - x1 + y0 - z1); break;
    case 11: k = (-w0 - x1 + y0 - z1); break;
    case 12: k = ( w0 + x1 - y0 - z1); break;
    case 13: k = (-w0 + x1 - y0 - z1); break;
    case 14: k = ( w0 - x1 - y0 - z1); break;
    case 15: k = (-w0 - x1 - y0 - z1); break;
    default: k = 0; break;
  }
  switch    (l & 15) {
    case  0: l = ( w1 + x1 + y0 + z1); break;
    case  1: l = (-w1 + x1 + y0 + z1); break;
    case  2: l = ( w1 - x1 + y0 + z1); break;
    case  3: l = (-w1 - x1 + y0 + z1); break;
    case  4: l = ( w1 + x1 - y0 + z1); break;
    case  5: l = (-w1 + x1 - y0 + z1); break;
    case  6: l = ( w1 - x1 - y0 + z1); break;
    case  7: l = (-w1 - x1 - y0 + z1); break;
    case  8: l = ( w1 + x1 + y0 - z1); break;
    case  9: l = (-w1 + x1 + y0 - z1); break;
    case 10: l = ( w1 - x1 + y0 - z1); break;
    case 11: l = (-w1 - x1 + y0 - z1); break;
    case 12: l = ( w1 + x1 - y0 - z1); break;
    case 13: l = (-w1 + x1 - y0 - z1); break;
    case 14: l = ( w1 - x1 - y0 - z1); break;
    case 15: l = (-w1 - x1 - y0 - z1); break;
    default: l = 0; break;
  }
  switch    (m & 15) {
    case  0: m = ( w0 + x0 + y1 + z1); break;
    case  1: m = (-w0 + x0 + y1 + z1); break;
    case  2: m = ( w0 - x0 + y1 + z1); break;
    case  3: m = (-w0 - x0 + y1 + z1); break;
    case  4: m = ( w0 + x0 - y1 + z1); break;
    case  5: m = (-w0 + x0 - y1 + z1); break;
    case  6: m = ( w0 - x0 - y1 + z1); break;
    case  7: m = (-w0 - x0 - y1 + z1); break;
    case  8: m = ( w0 + x0 + y1 - z1); break;
    case  9: m = (-w0 + x0 + y1 - z1); break;
    case 10: m = ( w0 - x0 + y1 - z1); break;
    case 11: m = (-w0 - x0 + y1 - z1); break;
    case 12: m = ( w0 + x0 - y1 - z1); break;
    case 13: m = (-w0 + x0 - y1 - z1); break;
    case 14: m = ( w0 - x0 - y1 - z1); break;
    case 15: m = (-w0 - x0 - y1 - z1); break;
    default: m = 0; break;
  }
  switch    (n & 15) {
    case  0: n = ( w1 + x0 + y1 + z1); break;
    case  1: n = (-w1 + x0 + y1 + z1); break;
    case  2: n = ( w1 - x0 + y1 + z1); break;
    case  3: n = (-w1 - x0 + y1 + z1); break;
    case  4: n = ( w1 + x0 - y1 + z1); break;
    case  5: n = (-w1 + x0 - y1 + z1); break;
    case  6: n = ( w1 - x0 - y1 + z1); break;
    case  7: n = (-w1 - x0 - y1 + z1); break;
    case  8: n = ( w1 + x0 + y1 - z1); break;
    case  9: n = (-w1 + x0 + y1 - z1); break;
    case 10: n = ( w1 - x0 + y1 - z1); break;
    case 11: n = (-w1 - x0 + y1 - z1); break;
    case 12: n = ( w1 + x0 - y1 - z1); break;
    case 13: n = (-w1 + x0 - y1 - z1); break;
    case 14: n = ( w1 - x0 - y1 - z1); break;
    case 15: n = (-w1 - x0 - y1 - z1); break;
    default: n = 0; break;
  }
  switch    (o & 15) {
    case  0: o = ( w0 + x1 + y1 + z1); break;
    case  1: o = (-w0 + x1 + y1 + z1); break;
    case  2: o = ( w0 - x1 + y1 + z1); break;
    case  3: o = (-w0 - x1 + y1 + z1); break;
    case  4: o = ( w0 + x1 - y1 + z1); break;
    case  5: o = (-w0 + x1 - y1 + z1); break;
    case  6: o = ( w0 - x1 - y1 + z1); break;
    case  7: o = (-w0 - x1 - y1 + z1); break;
    case  8: o = ( w0 + x1 + y1 - z1); break;
    case  9: o = (-w0 + x1 + y1 - z1); break;
    case 10: o = ( w0 - x1 + y1 - z1); break;
    case 11: o = (-w0 - x1 + y1 - z1); break;
    case 12: o = ( w0 + x1 - y1 - z1); break;
    case 13: o = (-w0 + x1 - y1 - z1); break;
    case 14: o = ( w0 - x1 - y1 - z1); break;
    case 15: o = (-w0 - x1 - y1 - z1); break;
    default: o = 0; break;
  }
  switch    (p & 15) {
    case  0: p = ( w1 + x1 + y1 + z1); break;
    case  1: p = (-w1 + x1 + y1 + z1); break;
    case  2: p = ( w1 - x1 + y1 + z1); break;
    case  3: p = (-w1 - x1 + y1 + z1); break;
    case  4: p = ( w1 + x1 - y1 + z1); break;
    case  5: p = (-w1 + x1 - y1 + z1); break;
    case  6: p = ( w1 - x1 - y1 + z1); break;
    case  7: p = (-w1 - x1 - y1 + z1); break;
    case  8: p = ( w1 + x1 + y1 - z1); break;
    case  9: p = (-w1 + x1 + y1 - z1); break;
    case 10: p = ( w1 - x1 + y1 - z1); break;
    case 11: p = (-w1 - x1 + y1 - z1); break;
    case 12: p = ( w1 + x1 - y1 - z1); break;
    case 13: p = (-w1 + x1 - y1 - z1); break;
    case 14: p = ( w1 - x1 - y1 - z1); break;
    case 15: p = (-w1 - x1 - y1 - z1); break;
    default: p = 0; break;
  }

  w = fadeQuintic(w0);
  x = fadeQuintic(x0);
  y = fadeQuintic(y0);
  z = fadeQuintic(z0);

  const wx = w*x;
  const wy = w*y;
  const wz = w*z;
  const xy = x*y;
  const xz = x*z;
  const yz = y*z;
  const wxy = wx*y;
  const wxz = wx*z;
  const wyz = wy*z;
  const xyz = xy*z;
  const wxyz = w*xyz;

  const k00 = a;
  const k01 = (-a+b);
  const k02 = (-a  +c);
  const k03 = (-a      +e);
  const k04 = (-a              +i);
  const k05 = (-k01-c+d);
  const k06 = (-k01    -e+f);
  const k07 = (-k01            -i+j);
  const k08 = (-k02    -e  +g);
  const k09 = (-k02            -i  +k);
  const k10 = (-k03            -i      +m);
  const k11 = (-k05    +e-f-g+h);
  const k12 = (-k05            +i-j-k+l);
  const k13 = (-k06            +i-j    -m+n);
  const k14 = (-k08            +i  -k  -m  +o);
  const k15 = (-k11            -i+j+k-l+m-n-o+p);

  const result = k00     + k01*w   + k02*x   + k03*y   + k04*z
             + k05*wx  + k06*wy  + k07*wz  + k08*xy  + k09*xz  + k10*yz
             + k11*wxy + k12*wxz + k13*wyz + k14*xyz + k15*wxyz

  return result;
  }
  // Note: this originally also returned derivatives [result, dw, dx, dy, dz] via
  // unreachable dead code after the `return result` above. That tail returned a
  // different shape (number[]) than the live path (number), which TS can't type
  // both at once, so it's dropped here rather than left in as dead code that
  // doesn't typecheck. Nothing calls this function at all currently either way.
}

function fadeQuintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

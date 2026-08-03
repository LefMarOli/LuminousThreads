// Cubic smoothstep - eases in and out like a logistic sigmoid, but actually
// reaches its 0/1 endpoints at t=0/t=1 instead of only approaching them
// asymptotically. That means a caller can clamp its input progress to
// [0, 1] and get a genuine flat hold once it arrives, rather than an
// ever-slower creep that never quite gets there.
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

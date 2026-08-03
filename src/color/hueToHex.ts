// Inverse of hexToHue.ts - renders a hue (0-360) at full saturation/
// brightness as a "#rrggbb" string, for UI previews (controls panel color
// swatches) that want to show what a base hue actually looks like.
export function hueToHex(hue: number): string {
  const k = (n: number) => (n + hue / 60) % 6;
  const f = (n: number) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1));
  const toByte = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(f(5))}${toByte(f(3))}${toByte(f(1))}`;
}

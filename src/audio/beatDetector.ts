export class BeatDetector {
  threshold: number;
  cooldown: number;
  lastBeat: number;

  constructor(threshold = 0.45, cooldown = 200) {
    this.threshold = threshold;
    this.cooldown = cooldown;
    this.lastBeat = 0;
  }

  update(energyNorm: number): boolean {
    // Only differences between successive readings matter here, so
    // performance.now() (no p5 instance needed) works as well as p5's own
    // sketch-relative millis() would.
    const now = performance.now();

    if (energyNorm > this.threshold && now - this.lastBeat > this.cooldown) {
      this.lastBeat = now;
      return true;
    }
    return false;
  }
}

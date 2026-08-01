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
    let now = millis();

    if (energyNorm > this.threshold && now - this.lastBeat > this.cooldown) {
      this.lastBeat = now;
      return true;
    }
    return false;
  }
}

import type { Strand } from "../strand";
import { sigmoid } from "./sigmoid";
import { SimplexNoise } from "./perlin4d";

const TWO_PI = Math.PI * 2;
let z!: number;
let w!: number;
let R!: number;
let Simplex!: SimplexNoise;
const minWarpFactor = 1.0;
const warpDelay = 1 / 1000;
let warpFactor: number = 1;

export class PerlinNoise {
  #speedRadians: number;
  #angle: number;
  #warpProgress = 0;
  #fft: unknown;
  #noiseLevel = 10;
  #maxWarpFactor = 1.5;
  #noiseScaleX = 0.005;
  #noiseScaleY = 0.005;
  #speedMultiplier = 1;

  constructor(seed: number, loopTime: number, fft?: unknown) {
    Simplex = new SimplexNoise(seed ?? Math.random);

    this.#speedRadians = TWO_PI / (loopTime * 1000);
    this.#angle = 0;
    this.#fft = fft;
    R = loopTime / 25.0;
    z = 0;
    w = R;
  }

  setNoiseLevel(value: number): void {
    this.#noiseLevel = value;
  }

  setMaxWarpFactor(value: number): void {
    this.#maxWarpFactor = value;
  }

  setWaveFrequency(value: number): void {
    this.#noiseScaleX = value;
    this.#noiseScaleY = value;
  }

  // Multiplies #speedRadians below - a shared knob for how fast the noise
  // pattern itself evolves over time, independent of Wave Frequency's
  // spatial scale.
  setSpeedMultiplier(value: number): void {
    this.#speedMultiplier = value;
  }

  // The actual current rate the (az, aw) sample point is moving through the
  // noise domain - #speedMultiplier alone understates this during a gust,
  // since warpFactor scales the same rotating (z, w) vector up before it's
  // sampled (see noiseEffect below), making the domain move faster for the
  // same angular step. Polled every frame by sketch.ts's "Sync to Noise"
  // toggle so colorSpeedMultiplier (strand.ts) tracks gust bursts too, not
  // just the slider's base value.
  getCurrentSpeed(): number {
    return this.#speedMultiplier * warpFactor;
  }

  noiseStep(flag: "Increasing" | "Decreasing", deltaTime: number): void {
    // Scaling deltaTime itself (rather than gating #angle alone) freezes the
    // gust ramp too - without this, warpFactor kept animating az/aw (below)
    // via the noise domain's z/w axis even at Noise Speed 0, since gusts run
    // on their own timer independent of the angle's rotation.
    const scaledDeltaTime = deltaTime * this.#speedMultiplier;

    if (flag === "Increasing" && warpFactor < this.#maxWarpFactor) {
      const current = sigmoid(this.#warpProgress);
      this.#warpProgress += scaledDeltaTime * warpDelay;
      const next = sigmoid(this.#warpProgress);
      warpFactor += next - current;
    } else if (flag === "Decreasing" && warpFactor > minWarpFactor) {
      const current = sigmoid(this.#warpProgress);
      this.#warpProgress -= scaledDeltaTime * warpDelay;
      const next = sigmoid(this.#warpProgress);
      warpFactor -= current - next;
    }

    this.#angle += this.#speedRadians * scaledDeltaTime;
    this.#angle %= TWO_PI;
    z = R * Math.cos(this.#angle);
    w = R * Math.sin(this.#angle);
  }

  // Arrow function field, not a method - strandGrid.ts passes this around
  // as a bare callback (`strand.move([this.#perlinNoise.noiseEffect, ...])`),
  // detached from its receiver. A regular method would see `this` as
  // undefined once called that way; binding `this` lexically here keeps it
  // safe to pass around detached, now that it reads instance state
  // (#noiseLevel) instead of only module-level values.
  noiseEffect = (strand: Strand, index: number): number => {
    const point = strand.pointsArray[index];

    const x = point.x * this.#noiseScaleX;
    const y = point.y * this.#noiseScaleY;

    const az = z * warpFactor;
    const aw = w * warpFactor;

    const noiseValue = Simplex.noise4D(x, y, az, aw);
    return (this.#noiseLevel * noiseValue) / 2.0;
  };
}

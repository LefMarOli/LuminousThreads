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
  // spatial scale. Lets the "Sync to Noise" color-speed toggle in sketch.ts
  // mirror this rate onto colorSpeedMultiplier (strand.ts).
  setSpeedMultiplier(value: number): void {
    this.#speedMultiplier = value;
  }

  noiseStep(flag: "Increasing" | "Decreasing", deltaTime: number): void {
    if (flag === "Increasing" && warpFactor < this.#maxWarpFactor) {
      const current = sigmoid(this.#warpProgress);
      this.#warpProgress += deltaTime * warpDelay;
      const next = sigmoid(this.#warpProgress);
      warpFactor += next - current;
    } else if (flag === "Decreasing" && warpFactor > minWarpFactor) {
      const current = sigmoid(this.#warpProgress);
      this.#warpProgress -= deltaTime * warpDelay;
      const next = sigmoid(this.#warpProgress);
      warpFactor -= current - next;
    }

    this.#angle += this.#speedRadians * this.#speedMultiplier * deltaTime;
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

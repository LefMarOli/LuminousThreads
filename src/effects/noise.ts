import type { Strand } from "../strand";
import { smoothstep } from "./smoothstep";
import { SimplexNoise } from "./perlin4d";

const TWO_PI = Math.PI * 2;
let z!: number;
let w!: number;
let R!: number;
let Simplex!: SimplexNoise;
const minWarpFactor = 1.0;
let warpFactor: number = 1;

export class PerlinNoise {
  #speedRadians: number;
  #angle: number;
  // Normalized 0-1 progress through the gust ramp - 0 at rest (warpFactor
  // == minWarpFactor), 1 at full gust (warpFactor == #maxWarpFactor).
  // Clamped at both ends (see noiseStep below), so unlike the logistic
  // sigmoid this used to feed, warpFactor actually reaches its target and
  // holds there instead of forever creeping toward it.
  #warpProgress = 0;
  #fft: unknown;
  #noiseLevel = 10;
  #maxWarpFactor = 1.5;
  #noiseScaleX = 0.005;
  #noiseScaleY = 0.005;
  #speedMultiplier = 1;
  // Scales #warpProgress's per-frame increment in noiseStep below - how
  // quickly warpFactor ramps from minWarpFactor to #maxWarpFactor (and back)
  // once a gust starts, i.e. the gust's "acceleration". Was a fixed module
  // constant; now a live setter so it's tunable the same as the rest of
  // the gust system.
  #gustRampRate = 1 / 1000;

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

  setGustRampRate(value: number): void {
    this.#gustRampRate = value;
  }

  // Recomputes #speedRadians for a new noise-space loop period, independent
  // of the strand-side loopDuration (Strand's own entering/exiting cycle and
  // color speed) that this constructor originally shared it with.
  setLoopDuration(value: number): void {
    this.#speedRadians = TWO_PI / (value * 1000);
  }

  // Directly overrides R (the radius of the circular path the (z, w) sample
  // point travels along) - a live-tunable counterpart to the value the
  // constructor derives once from loopTime.
  setPathRadius(value: number): void {
    R = value;
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
    const rampDelta = scaledDeltaTime * this.#gustRampRate;

    this.#warpProgress =
      flag === "Increasing"
        ? Math.min(this.#warpProgress + rampDelta, 1)
        : Math.max(this.#warpProgress - rampDelta, 0);
    warpFactor =
      minWarpFactor +
      (this.#maxWarpFactor - minWarpFactor) * smoothstep(this.#warpProgress);

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

import { Point } from "./point";
import { Strand } from "./strand";
import { PerlinNoise } from "./effects/noise";
import { stiffnessEffect } from "./effects/stiffness";
import { mapCoefficients } from "./bezier/bezierCurve";
import { hexToHue } from "./color/hexToHue";

export const DEFAULT_BASE_START_HUE = hexToHue("#380ef3ff");
export const DEFAULT_BASE_END_HUE = hexToHue("#db680aff");

export class StrandGrid {
  numStrands: number;
  strands: Strand[];
  numPoints: number;
  #perlinNoise: PerlinNoise;
  #warpState: "Increasing" | "Decreasing" = "Decreasing";
  #warpProbability = 0.5;
  #warpIntervalId: ReturnType<typeof setInterval>;

  constructor(
    width: number,
    height: number,
    gapX = 20,
    baseStartHue = DEFAULT_BASE_START_HUE,
    baseEndHue = DEFAULT_BASE_END_HUE,
    margin = 10,
    numPoints = 30,
    interpolationPoints = 150,
    loopDuration = 50,
  ) {
    this.numStrands = Math.floor((width + 8 * gapX) / gapX);
    this.strands = Array(this.numStrands);

    const anchorY = height + margin;
    this.numPoints = numPoints;
    mapCoefficients(numPoints, interpolationPoints);
    const gapY = Math.ceil((anchorY - margin) / (this.numPoints - 1));
    const dataPoints: Point[] = Array(this.numPoints);
    for (let y = 0; y < this.numPoints; y++) {
      dataPoints[y] = new Point();
    }

    for (let row = 0; row < this.numStrands; row++) {
      const anchorX = -2 * margin + row * gapX;
      for (let column = 0; column < this.numPoints; column++) {
        dataPoints[column].x = anchorX;
        dataPoints[column].y = anchorY - column * gapY;
      }

      const amt = (row / this.numStrands) * 360;
      const startHue = (baseStartHue + amt) % 360;
      const endHue = (baseEndHue + amt) % 360;

      this.strands[row] = new Strand(
        dataPoints,
        interpolationPoints,
        startHue,
        endHue,
        loopDuration,
      );
    }

    this.#perlinNoise = new PerlinNoise(17, loopDuration);

    this.#warpIntervalId = setInterval(() => {
      if (Math.random() < this.#warpProbability) {
        this.#warpState = "Increasing";
        setTimeout(() => (this.#warpState = "Decreasing"), 3000);
      }
    }, 3 * 1000);
  }

  setNoiseLevel(value: number): void {
    this.#perlinNoise.setNoiseLevel(value);
  }

  setGustIntensity(value: number): void {
    this.#perlinNoise.setMaxWarpFactor(value);
  }

  setWaveFrequency(value: number): void {
    this.#perlinNoise.setWaveFrequency(value);
  }

  setNoiseSpeedMultiplier(value: number): void {
    this.#perlinNoise.setSpeedMultiplier(value);
  }

  setGustFrequency(value: number): void {
    this.#warpProbability = value;
  }

  // Per-strand CPU state update (mode/travel/hue) - the WebGL renderer
  // reads vertices/getVertexColor() directly, it doesn't call this itself.
  update(deltaTime: number): void {
    this.strands.forEach((strand) => strand.update(deltaTime));
  }

  move(deltaTime: number): void {
    this.#perlinNoise.noiseStep(this.#warpState, deltaTime);
    this.strands.forEach((strand) =>
      strand.move([this.#perlinNoise.noiseEffect, stiffnessEffect]),
    );
  }

  // Every window resize replaces the whole StrandGrid - without this, each
  // discarded instance's interval keeps firing forever and keeps its entire
  // strand/vertex graph alive via closure, leaking on every resize.
  destroy(): void {
    clearInterval(this.#warpIntervalId);
  }
}

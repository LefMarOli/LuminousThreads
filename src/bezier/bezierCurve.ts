import { Point } from "../point";
import { binomialCoefficient } from "./binomialCoefficients";

const coefficients: number[][] = [];

export function mapCoefficients(ctrlPoints: number, interPoints: number): void {
  const increment = 1 / (interPoints - 1);
  const n = ctrlPoints - 1;

  for (let index = 0; index < interPoints; index++) {
    const t = index * increment;
    const oneMinusT = 1 - t;
    coefficients[index] = new Array(n);
    for (let i = 0; i <= n; i++) {
      coefficients[index][i] =
        binomialCoefficient(n, i) * oneMinusT ** (n - i) * t ** i;
    }
  }
}

export class BezierCurve {
  #increment!: number;
  interpolationPoints: number;
  #controlPoints: Point[];
  vertices!: Point[];

  constructor(controlPoints: Point[], interpolationPoints: number) {
    if (controlPoints.length < 2)
      throw new Error("Need at least 2 points for a Bezier curve");

    if (interpolationPoints <= 2)
      throw new Error("Need at least 2 interpolation points.");

    this.#controlPoints = controlPoints;
    this.interpolationPoints = interpolationPoints;

    this.#_initVertexList();
    this.#_buildVertices();
  }

  #_initVertexList(): void {
    this.#increment = 1 / (this.interpolationPoints - 1);
    this.vertices = new Array(this.interpolationPoints);
    for (let index = 0; index < this.interpolationPoints; index++) {
      this.vertices[index] = new Point();
    }
  }

  updateControlPoints(controlPoints: Point[]): void {
    this.#controlPoints = controlPoints;
    this.#_buildVertices();
  }

  #_buildVertices(): void {
    let t;
    let coefficient;
    for (let index = 0; index < this.interpolationPoints; index++) {
      t = index * this.#increment;

      this.vertices[index].x = 0;
      this.vertices[index].y = 0;

      for (let i = 0; i <= this.#controlPoints.length - 1; i++) {
        coefficient = coefficients[index][i];
        this.vertices[index].x += coefficient * this.#controlPoints[i].x;
        this.vertices[index].y += coefficient * this.#controlPoints[i].y;
      }
    }
  }
}

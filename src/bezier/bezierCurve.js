const coefficients = new Array();

function mapCoefficients(ctrlPoints, interPoints) {
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

class BezierCurve {
  #increment;
  #interpolationPoints;
  #controlPoints;
  #vertices;

  constructor(controlPoints, interpolationPoints) {
    if (controlPoints.length < 2)
      throw new Error("Need at least 2 points for a Bezier curve");

    if (interpolationPoints <= 2)
      throw new Error("Need at least 2 interpolation points.");

    this.#controlPoints = controlPoints;
    this.#interpolationPoints = interpolationPoints;

    this.#_initVertexList();
    this.#_buildVertices();
  }

  #_initVertexList() {
    this.#increment = 1 / (this.#interpolationPoints - 1);
    this.#vertices = new Array(this.#interpolationPoints);
    for (let index = 0; index < this.#interpolationPoints; index++) {
      this.#vertices[index] = new Point();
    }
  }

  updateControlPoints(controlPoints) {
    if (controlPoints.length != this.#controlPoints.length)
      throw new Error("Amount of control points changed");

    this.#controlPoints = controlPoints;
    this.#_buildVertices();
  }

  #_buildVertices() {
    for (let index = 0; index < this.#interpolationPoints; index++) {
      const t = index * this.#increment;

      this.#vertices[index].x = 0;
      this.#vertices[index].y = 0;

      for (let i = 0; i <= this.#controlPoints.length - 1; i++) {
        const coefficient = coefficients[index][i];
        this.#vertices[index].x += coefficient * this.#controlPoints[i].x;
        this.#vertices[index].y += coefficient * this.#controlPoints[i].y;
      }
    }
  }

  getInterpolationPoints() {
    return this.#interpolationPoints;
  }

  getVertex(index) {
    if (index >= this.#interpolationPoints) throw new Error("Out of bounds");

    return this.#vertices[index];
  }
}

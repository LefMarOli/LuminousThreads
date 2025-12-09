class BezierCurve {
  #increment;
  #interpolationPoints;
  #controlPoints;
  #vertices;
  #n;

  constructor(controlPoints, interpolationPoints = 100) {
    if (controlPoints.length < 2)
      throw new Error("Need at least 2 points for a Bezier curve");

    if (interpolationPoints <= 2)
      throw new Error("Need at least 2 interpolation points.");

    if (controlPoints[0].length != 2) throw new Error("Supports only 2D");


    this.#_validateControlPoints(controlPoints);
    this.#controlPoints = controlPoints;
    this.#interpolationPoints = interpolationPoints;

    this.#_initVertexList();
    this.#_buildVertices();
  }

  #_initVertexList(){
    this.#n = this.#controlPoints.length - 1;
    this.#increment = 1 / (this.#interpolationPoints - 1);
    this.#vertices = new Array(this.#interpolationPoints);
    for (let index = 0; index < this.#interpolationPoints; index++) {
      this.#vertices[index] = new Array(2);
    }
  }

  updateControlPoints(controlPoints) {
    if (controlPoints.length != this.#controlPoints.length)
      throw new Error("Amount of control points changed");

    this.#_validateControlPoints(controlPoints);
    this.#controlPoints = controlPoints;
    this.#_buildVertices();
  }

  #_validateControlPoints(controlPoints) {
    controlPoints.forEach((p) => {
      if (p.length != 2)
        throw new Error("All control points need to have 2 dimensions");
    });
  }

  #_buildVertices() {
    for (let index = 0; index < this.#vertices.length; index++) {
      const t = index * this.#increment;
      const oneMinusT = 1 - t;

      this.#vertices[index][0] = 0;
      this.#vertices[index][1] = 0;

      for (let i = 0; i <= this.#n; i++) {
        const coefficient =
          binomialCoefficient(this.#n, i) * oneMinusT ** (this.#n - i) * t ** i;

        this.#vertices[index][0] += coefficient * this.#controlPoints[i][0];
        this.#vertices[index][1] += coefficient * this.#controlPoints[i][1];
      }
    }
  }

  interpolationPoints(){
    return this.#interpolationPoints
  }

  getVertex(index){
    if(index >= this.#interpolationPoints)
        throw new Error("Out of bounds");

    return this.#vertices[index];
  }
}

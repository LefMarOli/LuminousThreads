class Strand {
  #pointsArray;
  #initArray;
  #bezierCurve;
  #interpolationPoints;
  #startColor;
  #endColor;

  constructor(pointsArray, interpolationPoints, startColor, endColor) {
    this.#pointsArray = pointsArray.map((p) => new Point(p.x, p.y));
    this.#initArray = pointsArray.map((p) => new Point(p.x, p.y));
    this.#interpolationPoints = interpolationPoints;
    this.#bezierCurve = new BezierCurve(pointsArray, interpolationPoints);
    this.#startColor = startColor;
    this.#endColor = endColor;
  }

  draw() {
    push();
    noFill();
    strokeWeight(2);
    colorMode(HSB, 360, 100, 100);

    const newStartColor = color(
      (hue(this.#startColor) + frameCount) % 360,
      100,
      100
    );
    const newEndColor = color(
      (hue(this.#endColor) + frameCount) % 360,
      100,
      100
    );

    for (let index = 1; index < this.#interpolationPoints; index++) {
      const amt = map(index - 1, 0, this.#interpolationPoints, 0, 1);
      const gradColor = lerpColor(newStartColor, newEndColor, amt);
      stroke(gradColor);
      beginShape();
      const p1 = this.#bezierCurve.getVertex(index - 1);
      vertex(p1.x, p1.y);
      const p2 = this.#bezierCurve.getVertex(index);
      vertex(p2.x, p2.y);
      endShape();
      //ellipse(...this.#bezierCurve.getVertex(index), 5, 5)
    }

    //stroke(color("#4dafc0ff"));
    //this.#pointsArray.forEach((p) => ellipse(p[0], p[1], 10, 10));

    pop();
  }

  move(effects) {
    //Starts at 1 to ignore bottom anchor
    for (let index = 1; index < this.#pointsArray.length; index++) {
      effects.forEach((effect) => {
        this.#pointsArray[index].x += effect(this, index);
      });
    }

    this.#bezierCurve.updateControlPoints(this.#pointsArray);
  }

  getPointAt(index) {
    return this.#pointsArray[index];
  }

  getInitPosAt(index) {
    return this.#initArray[index];
  }
}

class Strand {
  #pointsArray;
  #initArray;
  #bezierCurve;
  #startColor;
  #endColor;

  constructor(pointsArray, startColor, endColor) {
    this.#pointsArray = pointsArray.map((row) => [...row]);
    this.#initArray = pointsArray.map((row) => [...row]);
    this.#bezierCurve = new BezierCurve(pointsArray);
    this.#startColor = startColor;
    this.#endColor = endColor;
  }

  draw() {
    push();
    noFill();
    strokeWeight(2);
    colorMode(HSB, 360, 100, 100);

    console.log(0.1 * frameCount);

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

    for (
      let index = 1;
      index < this.#bezierCurve.interpolationPoints();
      index++
    ) {
      const amt = map(
        index - 1,
        0,
        this.#bezierCurve.interpolationPoints(),
        0,
        1
      );
      const gradColor = lerpColor(newStartColor, newEndColor, amt);
      stroke(gradColor);
      beginShape();
      vertex(...this.#bezierCurve.getVertex(index - 1));
      vertex(...this.#bezierCurve.getVertex(index));
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
        this.#pointsArray[index][0] += effect(this, index);
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

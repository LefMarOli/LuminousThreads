class Strand {
  #pointsArray;
  #initArray;
  #bezierCurve;
  #interpolationPoints;
  #startHue;
  #endHue;
  #fadePerc = 0.25;
  #colorSpeed;

  constructor(
    pointsArray,
    interpolationPoints,
    startHue,
    endHue,
    loopDuration
  ) {
    this.#pointsArray = pointsArray.map((p) => new Point(p.x, p.y));
    this.#initArray = pointsArray.map((p) => new Point(p.x, p.y));
    this.#interpolationPoints = interpolationPoints;
    this.#bezierCurve = new BezierCurve(pointsArray, interpolationPoints);
    this.#startHue = startHue;
    this.#endHue = endHue;
    this.#colorSpeed = 360 / (loopDuration * 1000);
    colorMode(HSB, 360, 100, 100, 1);
  }

  draw() {
    push();
    noFill();
    strokeWeight(2);
    colorMode(HSB, 360, 100, 100, 1);
    strokeCap(SQUARE);

    this.#startHue += this.#colorSpeed * deltaTime;
    this.#startHue %= 360;
    this.#endHue += this.#colorSpeed * deltaTime;
    this.#endHue %= 360;

    for (let index = 1; index < this.#interpolationPoints; index++) {
      const heightPerc = (index - 1) / this.#interpolationPoints;

      let startColor;
      if (heightPerc < this.#fadePerc)
        startColor = color(this.#startHue, 100, 100, heightPerc / this.#fadePerc);
      else startColor = color(this.#startHue, 100, 100);

      let endColor;
      if (1 - heightPerc < this.#fadePerc)
        endColor = color(
          this.#endHue,
          100,
          100,
          (1 - heightPerc) / this.#fadePerc
        );
      else endColor = color(this.#endHue, 100, 100);

      const gradColor = lerpColor(startColor, endColor, heightPerc);
      stroke(gradColor);

      const p1 = this.#bezierCurve.getVertex(index - 1);
      const p2 = this.#bezierCurve.getVertex(index);
      line(p1.x, p1.y, p2.x, p2.y);
    }

    pop();
  }

  move(effects) {
    for (let index = 0; index < this.#pointsArray.length; index++) {
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

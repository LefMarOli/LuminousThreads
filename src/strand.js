class Strand {
  pointsArray;
  initArray;
  initX;
  #bezierCurve;
  #interpolationPoints;
  #startHue;
  #endHue;
  #fadePerc = 0.25;
  #colorSpeed;
  #minColorSpeed = 0.1;
  #mode = "NoShow"; //Normal, Entering, Exiting, NoShow
  #travelDirection = "Top"; //Top, Bottom
  #travelTrailSize = 20;
  #travelSpeed = 0.04;
  #travelPos;

  constructor(
    pointsArray,
    interpolationPoints,
    startHue,
    endHue,
    loopDuration
  ) {
    this.pointsArray = pointsArray.map((p) => new Point(p.x, p.y));
    this.initArray = pointsArray.map((p) => new Point(p.x, p.y));
    this.initX = pointsArray[0].x;
    this.#interpolationPoints = interpolationPoints;
    this.#bezierCurve = new BezierCurve(pointsArray, interpolationPoints);
    this.#startHue = startHue;
    this.#endHue = endHue;
    const n = Math.max(Math.floor(loopDuration * this.#minColorSpeed), 1);
    console.log(n);
    this.#colorSpeed = (360 * n) / (loopDuration * 1000);

    colorMode(HSB, 360, 100, 100, 1);
  }

  draw() {
    this.#switchMode();
    this.#updateTravel();
    this.#updateHue();

    if (this.#mode === "NoShow") return;

    push();
    noFill();
    strokeWeight(2);
    colorMode(HSB, 360, 100, 100, 1);
    strokeCap(SQUARE);

    for (let index = 1; index < this.#interpolationPoints; index++) {
      const heightPerc = (index - 1) / this.#interpolationPoints;
      let gradColor = this.#segmentColor(heightPerc);

      const p1 = this.#bezierCurve.vertices[index - 1];
      const p2 = this.#bezierCurve.vertices[index];

      gradColor = color(
        hue(gradColor),
        saturation(gradColor),
        brightness(gradColor) *
          this.#highlightFactor(p1, p2) *
          this.#segmentBrightness(index),
        alpha(gradColor)
      );

      stroke(gradColor);

      line(p1.x, p1.y, p2.x, p2.y);
    }

    pop();
  }

  #updateHue() {
    this.#startHue += this.#colorSpeed * deltaTime;
    this.#startHue %= 360;
    this.#endHue += this.#colorSpeed * deltaTime;
    this.#endHue %= 360;
  }

  #updateTravel() {
    if (this.#mode === "Normal" || this.#mode === "NoShow") return;

    if (this.#travelDirection === "Top") {
      this.#travelPos += this.#travelSpeed * deltaTime;
      if (this.#travelPos >= this.#interpolationPoints)
        this.#mode = this.#mode === "Entering" ? "Normal" : "NoShow";
    } else if (this.#travelDirection === "Bottom") {
      this.#travelPos -= this.#travelSpeed * deltaTime;
      if (this.#travelPos <= 0)
        this.#mode = this.#mode === "Entering" ? "Normal" : "NoShow";
    }
  }

  #segmentBrightness(index) {
    switch (this.#mode) {
      case "NoShow":
        return 0;
      case "Normal":
        return 1;
      case "Entering":
        let factor =
          this.#travelDirection === "Top"
            ? this.#travelPos - index
            : index - this.#travelPos;
        factor /= this.#travelTrailSize;
        return Math.min(Math.max(factor, 0), 1);
      case "Exiting":
        let exitFactor =
          this.#travelDirection === "Top"
            ? index - this.#travelPos
            : this.#travelPos - index;
        exitFactor /= this.#travelTrailSize;
        return Math.min(Math.max(exitFactor, 0), 1);
      default:
        return 1;
    }
  }

  #highlightFactor(p1, p2) {
    const middleX = (p1.x + p2.x) / 2.0;
    const fa = 1.0 / Math.pow(Math.abs(this.initX - middleX), 1 / 5);
    return fa;
  }

  #segmentColor(heightPerc) {
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

    return lerpColor(startColor, endColor, heightPerc);
  }

  #switchMode() {
    if (this.#mode === "Normal" && Math.random() < 0.001) {
      this.#mode = "Exiting";
      if (Math.random() > 0.5) {
        this.#travelDirection = "Top";
        this.#travelPos = 0;
      } else {
        this.#travelDirection = "Bottom";
        this.#travelPos = this.#interpolationPoints;
      }
    } else if (this.#mode === "NoShow" && Math.random() < 0.001) {
      this.#mode = "Entering";
      if (Math.random() > 0.5) {
        this.#travelDirection = "Top";
        this.#travelPos = 0;
      } else {
        this.#travelDirection = "Bottom";
        this.#travelPos = this.#interpolationPoints;
      }
    }
  }

  move(effects) {
    for (let index = 0; index < this.pointsArray.length; index++) {
      effects.forEach((effect) => {
        this.pointsArray[index].x += effect(this, index);
      });
    }

    this.#bezierCurve.updateControlPoints(this.pointsArray);
  }
}

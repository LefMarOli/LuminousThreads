class Strand {
  pointsArray;
  initArray;
  initX;
  #bezierCurve;
  #interpolationPoints;
  #startHue;
  #endHue;
  #fadePerc = 0.45;
  #colorSpeed;
  #minColorSpeed = 0.1;
  #mode = "NoShow"; //Normal, Entering, Exiting, NoShow
  #travelDirection = "Top"; //Top, Bottom
  #travelTrailSize = 40;
  #travelSpeed = 0.01;
  #travelPos;
  #peakProbability = 0.01;
  #enteringProbability = this.#peakProbability;
  #exitingProbability = 0;
  #loopDuration;
  #loopTimestamp = 0;
  #auraWidth = 2;
  #auraDecreaseFactor = 1 / this.#auraWidth;
  #gradient;

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
    this.#loopDuration = loopDuration * 1000;
    const n = Math.max(Math.floor(loopDuration * this.#minColorSpeed), 1);
    this.#colorSpeed = (360 * n) / (loopDuration * 1000);

    const travelSpeedFactor = (loopDuration * interpolationPoints) / (50 * 90);
    this.#travelSpeed =
      (loopDuration * interpolationPoints) / (travelSpeedFactor * 1000000);

    colorMode(HSB, 360, 100, 100, 1);
  }

  draw() {
    this.#switchMode();
    this.#updateTravel();
    this.#updateHue();

    if (this.#mode === "NoShow") return;

    push();
    //noFill();
    colorMode(HSB, 360, 100, 100, 1);
    strokeCap(SQUARE);
    //noStroke()
    strokeWeight(2);
    //beginShape(QUAD_STRIP);

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

      /*
      const diffX = Math.abs(p1.x - p2.x);
      const diffY = Math.abs(p1.y - p2.y);
      const theta = Math.atan(diffX / diffY);
      const offX = this.#auraWidth * Math.cos(theta);
      const offY = this.#auraWidth * Math.sin(theta);

      /*
      const middleX = Math.min(p1.x, p2.x) + diffX;
      const middleY = Math.min(p1.y, p2.y) + diffY;

      this.#gradient = drawingContext.createLinearGradient(
        middleX - offX,
        p1.x > p2.x ? middleY + offY : middleY - offY,
        middleX + offX,
        p1.x > p2.x ? middleY - offY : middleY + offY
      );

      this.#gradient.addColorStop(0, color(0, 0, 0, 0));
      this.#gradient.addColorStop(0.5, gradColor);
      this.#gradient.addColorStop(1, color(0, 0, 0, 0));

      drawingContext.fillStyle = this.#gradient;
      

      fill(gradColor);
      vertex(p1.x + offX, p1.x > p2.x ? p1.y - offY : p1.y + offY, 0);
      vertex(p1.x - offX, p1.x > p2.x ? p1.y + offY : p1.y - offY, 0);

      /*
      for (let a = 1; a < this.#auraWidth + 1; a++) {
        let auraColor = color(
          hue(gradColor),
          saturation(gradColor),
          brightness(gradColor) * (1 - a * this.#auraDecreaseFactor),
          alpha(gradColor)
        );
        stroke(auraColor);
        strokeWeight(a);
      }
        */

      stroke(gradColor);
      fill(gradColor);
      line(p1.x, p1.y, p2.x, p2.y);
    }

    //endShape();

    pop();
  }

  #updateHue() {
    this.#startHue += this.#colorSpeed * deltaTime;
    this.#startHue %= 360;
    this.#endHue += this.#colorSpeed * deltaTime;
    this.#endHue %= 360;
  }

  #updateTravel() {
    this.#loopTimestamp += deltaTime;
    this.#loopTimestamp %= this.#loopDuration;

    const animationProgress = this.#loopTimestamp / this.#loopDuration;
    this.#exitingProbability =
      this.#peakProbability * Math.sin(animationProgress * Math.PI);
    this.#enteringProbability =
      this.#peakProbability *
      Math.sin(animationProgress * Math.PI + Math.PI / 2);

    if (this.#mode === "Normal" || this.#mode === "NoShow") return;

    if (this.#travelDirection === "Top") {
      this.#travelPos += this.#travelSpeed * deltaTime;
      if (this.#travelPos >= this.#interpolationPoints + this.#travelTrailSize)
        this.#mode = this.#mode === "Entering" ? "Normal" : "NoShow";
    } else if (this.#travelDirection === "Bottom") {
      this.#travelPos -= this.#travelSpeed * deltaTime;
      if (this.#travelPos <= -this.#travelTrailSize)
        this.#mode = this.#mode === "Entering" ? "Normal" : "NoShow";
    }
  }

  #segmentBrightness(index) {
    switch (this.#mode) {
      case "NoShow":
        return 0;
      case "Normal":
        return 1;
      case "Entering": {
        let factor =
          this.#travelDirection === "Top"
            ? this.#travelPos - index
            : index - this.#travelPos;
        factor /= this.#travelTrailSize;
        return Math.min(Math.max(factor, 0), 1);
      }
      case "Exiting": {
        let factor =
          this.#travelDirection === "Top"
            ? index - this.#travelPos
            : this.#travelPos - index;
        factor /= this.#travelTrailSize;
        return Math.min(Math.max(factor, 0), 1);
      }
      default:
        return 1;
    }
  }

  #highlightFactor(p1, p2) {
    const middleX = (p1.x + p2.x) / 2.0;
    const fa = 1.0 / Math.pow(Math.abs(this.initX - middleX), 1 / 9);
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
    if (this.#mode === "Normal" && Math.random() < this.#exitingProbability) {
      this.#mode = "Exiting";
      if (Math.random() > 0.5) {
        this.#travelDirection = "Top";
        this.#travelPos = -this.#travelTrailSize;
      } else {
        this.#travelDirection = "Bottom";
        this.#travelPos = this.#interpolationPoints + this.#travelTrailSize;
      }
    } else if (
      this.#mode === "NoShow" &&
      Math.random() < this.#enteringProbability
    ) {
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

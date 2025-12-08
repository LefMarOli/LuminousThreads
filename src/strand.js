class Strand {
  #pointsArray;
  #initArray;
  #bezierCurve;

  constructor(pointsArray) {
    this.#pointsArray = pointsArray.map((row) => [...row]);
    this.#initArray = pointsArray.map((row) => [...row]);
    this.#bezierCurve = new BezierCurve(pointsArray);
  }

  draw() {
    push();
    noFill();
    strokeWeight(4);

    const startColor = color("#0ef380ff");
    const endColor = color("#db0a15ff");

    stroke(color("#2e0fb6ff"));
    beginShape();

    for (let index = 0; index < this.#bezierCurve.interpolationPoints(); index++) {
      const amt = map(index, 0, this.#bezierCurve.interpolationPoints(), 0, 1);
      const gradColor = lerpColor(startColor, endColor, amt);
      stroke(gradColor);
      curveVertex(...this.#bezierCurve.getVertex(index));
      //ellipse(...this.#bezierCurve.getVertex(index), 5, 5)
    }

    endShape();

    //stroke(color("#4dafc0ff"));
    //this.#pointsArray.forEach((p) => ellipse(p[0], p[1], 20, 20));

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

  getPointAt(index){
    return this.#pointsArray[index];
  }

  getInitPosAt(index){
    return this.#initArray[index];
  }
}

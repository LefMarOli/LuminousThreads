class Strand {
  constructor(p5bezier, pointsArray) {
    this.p5bezier = p5bezier;
    this.pointsArray = pointsArray.map((row) => [...row]);
    this.initArray = pointsArray.map((row) => [...row]);
  }

  draw() {
    push();
    noFill();
    stroke(color("#4dafc0ff"));
    strokeWeight(3);
    this.p5bezier.draw(this.pointsArray);

    this.pointsArray.forEach((p) => ellipse(p[0], p[1], 20, 20));
    pop();
  }

  move(effects) {
    //Starts at 1 to ignore bottom anchor
    for (let index = 1; index < this.pointsArray.length; index++) {
      const x = this.pointsArray[index][0];
      const y = this.pointsArray[index][1];
      const xinit = this.initArray[index][0];
      const yinit = this.initArray[index][1];
      effects.forEach((effect) => {
        this.pointsArray[index][0] += effect(x, y, xinit, yinit);
      });
    }
  }
}

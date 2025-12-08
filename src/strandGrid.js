class StrandGrid {
  constructor(width, height, gapX = 60, margin = 20, numPoints = 30) {

    this.numStrands = floor((width + 4 * margin) / gapX);
    this.strands = Array(this.numStrands);

    const anchorY = height - margin;
    this.numPoints = numPoints;
    const gapY = ceil((anchorY - margin) / (this.numPoints - 1));
    const dataPoints = Array(this.numPoints);
    for (let y = 0; y < this.numPoints; y++) {
      dataPoints[y] = Array(2);
    }

    for (let x = 0; x < this.numStrands; x++) {
      const anchorX = -2 * margin + x * gapX;
      for (let y = 0; y < this.numPoints; y++) {
        dataPoints[y][0] = anchorX;
        dataPoints[y][1] = anchorY - y * gapY;
      }

      this.strands[x] = new Strand(dataPoints);
    }
  }

  draw() {
    this.strands.forEach((strand) => strand.draw());
  }

  move() {
    this.strands.forEach((strand) => strand.move([noiseEffect, stiffnessEffect]));
  }
}

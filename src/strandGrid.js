class StrandGrid {
  constructor(width, height, gapX = 90, margin = 20, numPoints = 30) {
    colorMode(HSB, 360, 100, 100);
    this.startColor = color("#380ef3ff");
    this.endColor = color("#db680aff");

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

      const amt = map(x, 0, this.numStrands, 0, 360);

      const newStartColor = color((hue(this.startColor) + amt) % 360, 100, 100);
      const newEndColor = color((hue(this.endColor)) % 360, 100, 100);

      this.strands[x] = new Strand(dataPoints, newStartColor, newEndColor);
    }
  }

  draw() {
    this.strands.forEach((strand) => strand.draw());
  }

  move() {
    this.strands.forEach((strand) =>
      strand.move([noiseEffect, stiffnessEffect])
    );
  }
}

class StrandGrid {
  constructor(
    width,
    height,
    gapX = 90,
    margin = 20,
    numPoints = 30,
    interpolationPoints = 100
  ) {
    colorMode(HSB, 360, 100, 100);
    this.startColor = color("#380ef3ff");
    this.endColor = color("#db680aff");

    this.numStrands = floor((width + 4 * margin) / gapX);
    this.strands = Array(this.numStrands);

    const anchorY = height - margin;
    this.numPoints = numPoints;
    mapCoefficients(numPoints, interpolationPoints);
    const gapY = ceil((anchorY - margin) / (this.numPoints - 1));
    const dataPoints = Array(this.numPoints);
    for (let y = 0; y < this.numPoints; y++) {
      dataPoints[y] = new Point();
    }

    for (let row = 0; row < this.numStrands; row++) {
      const anchorX = -2 * margin + row * gapX;
      for (let column = 0; column < this.numPoints; column++) {
        dataPoints[column].x = anchorX;
        dataPoints[column].y = anchorY - column * gapY;
      }

      const amt = map(row, 0, this.numStrands, 0, 360);

      const newStartColor = color((hue(this.startColor) + amt) % 360, 100, 100);
      const newEndColor = color(hue(this.endColor) % 360, 100, 100);

      this.strands[row] = new Strand(
        dataPoints,
        interpolationPoints,
        newStartColor,
        newEndColor
      );
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

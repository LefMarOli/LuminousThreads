function noiseEffect(strand, index) {
  const noiseScaleX = 0.005;
  const noiseScaleY = 0.005;
  const nt = 0.01 * frameCount;
  const noiseLevel = 10;

  const point = strand.getPointAt(index)

  return noiseLevel * (noise(point[0] * noiseScaleX, point[1] * noiseScaleY, nt) - 0.5);
}

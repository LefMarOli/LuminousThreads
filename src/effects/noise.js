function noiseEffect(x, y, _xinit, _yinit) {
  const noiseScaleX = 0.005;
  const noiseScaleY = 0.005;
  const nt = 0.01 * frameCount;

  const noiseLevel = 10;
  return noiseLevel * (noise(x * noiseScaleX, y * noiseScaleY, nt) - 0.5);
}

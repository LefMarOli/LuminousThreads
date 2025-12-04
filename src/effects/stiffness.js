function stiffnessEffect(x, _y, xinit, _yinit) {
  const distance = abs(x - xinit);
  const sign = Math.sign(x - xinit);

  return -sign * distance * distance * 0.0001;
}

function stiffnessEffect(strand, index) {
  const x = strand.getPointAt(index).x;
  const xinit = strand.getInitPosAt(index).x;

  const distance = Math.abs(x - xinit);
  const sign = Math.sign(x - xinit);

  return -sign * distance * distance * 0.0001;
}

function stiffnessEffect(strand, index) {
  const x = strand.getPointAt(index)[0];
  const xinit = strand.getInitPosAt(index)[0];

  const distance = abs(x - xinit);
  const sign = Math.sign(x - xinit);

  return -sign * distance * distance * 0.0001;
}

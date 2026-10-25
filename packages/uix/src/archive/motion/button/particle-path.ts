export type ParticleGeometry = {
  centerX: number;
  centerY: number;
  insetHalfHeight: number;
  insetHalfWidth: number;
};

export function projectParticlePath(
  geometry: ParticleGeometry,
  angle: number,
  radius: number,
) {
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const rectangleScale = Math.max(Math.abs(cosine), Math.abs(sine));
  const projectedX = geometry.insetHalfWidth * cosine / rectangleScale;
  const projectedY = geometry.insetHalfHeight * sine / rectangleScale;
  const projectedLength = Math.hypot(projectedX, projectedY);
  const outwardX = projectedLength === 0 ? 0 : projectedX / projectedLength;
  const outwardY = projectedLength === 0 ? 0 : projectedY / projectedLength;
  const startX = geometry.centerX + projectedX;
  const startY = geometry.centerY + projectedY;

  return {
    endX: startX + outwardX * radius,
    endY: startY + outwardY * radius,
    outwardX,
    outwardY,
    startX,
    startY,
  };
}

export function particlePath(
  geometry: ParticleGeometry,
  angle: number,
  curvature: number,
  radius: number,
) {
  const { endX, endY, outwardX, outwardY, startX, startY } =
    projectParticlePath(geometry, angle, radius);
  const midpointX = (startX + endX) / 2;
  const midpointY = (startY + endY) / 2;
  const controlX = midpointX - outwardY * curvature;
  const controlY = midpointY + outwardX * curvature;
  return curvature === 0
    ? `M ${startX} ${startY} L ${endX} ${endY}`
    : `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
}

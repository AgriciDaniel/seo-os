import * as THREE from 'three';

const STAR_COLORS = [0xd4ccb8, 0xa8b8d8, 0xd4b870, 0xd97060];

/**
 * Build a two-layered star field for the cosmos theme.
 * Far layer: 2200 dim distant stars in a thin shell at radius 80-180.
 * Near layer: 380 brighter stars at radius 35-70.
 * All stars are static (no animation needed).
 */
export function buildStars(): THREE.Group {
  const group = new THREE.Group();

  const makeLayer = (count: number, rMin: number, rMax: number, size: number, opacity: number) => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = rMin + Math.random() * (rMax - rMin);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const col = new THREE.Color(STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      opacity,
      sizeAttenuation: true,
    });
    return new THREE.Points(geo, mat);
  };

  group.add(makeLayer(2200, 80, 180, 0.10, 0.5));
  group.add(makeLayer(380, 35, 70, 0.13, 0.6));

  return group;
}

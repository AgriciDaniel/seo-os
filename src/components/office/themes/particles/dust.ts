import * as THREE from 'three';

/**
 * Build a static dust-particle field — used as an ambient layer for the
 * datacenter and sunset themes. Particles are distributed in a torus-like
 * shell around the office (radius 20-80, height 0-30).
 *
 * Static (no per-frame animation). The dust just hangs in the air.
 *
 * @param color Particle color. Defaults to neutral cool gray.
 */
export function buildDust(color: number = 0xa8b8c8): THREE.Group {
  const group = new THREE.Group();
  const count = 800;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * 60;
    positions[i * 3] = Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.random() * 30;
    positions[i * 3 + 2] = Math.sin(theta) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size: 0.08,
    transparent: true,
    opacity: 0.4,
    sizeAttenuation: true,
  });
  group.add(new THREE.Points(geo, mat));
  return group;
}

import * as THREE from 'three';

const PLANKTON_COLORS = [0x10d8a8, 0x40e0d0, 0x80ffe0, 0x60c8f0, 0x40a8ff, 0x80f0c8];

export interface PlanktonPointsUserData {
  kind: 'planktonPoints';
  phases: Float32Array;
  drifts: Float32Array;
  baseOpacity: number;
}

export interface PlanktonMoteUserData {
  baseY: number;
  baseOp: number;
  phase: number;
  speed: number;
  driftAng: number;
  driftRad: number;
}

export interface PlanktonHaloUserData {
  parent: THREE.Mesh;
}

/**
 * Build the ocean theme's bioluminescent plankton layer.
 *
 * 600 small particle points distributed across the volume, biased
 * toward the seafloor (squared random distribution puts more particles
 * near y=0). Each particle drifts upward over time at its own speed
 * and resets to floor level on reaching y=30 — simulating rising
 * bubbles or upward currents.
 *
 * 22 larger glowing motes hover near the seafloor (y=0.5-5.5), each
 * with its own slow orbital drift and pulsing opacity. Each mote has
 * an additive halo that copies its position and tracks its opacity.
 *
 * Animation: in the parent component's animation loop:
 *   - For planktonPoints: shift each particle's Y by drifts[i] * deltaTime,
 *     wrap at y > 30 back to y = 0
 *   - For motes: bob Y via sin(time * speed + phase),
 *     orbit angle += time * 0.015, pulse opacity via sin
 *   - For halos: copy parent position, opacity = parent.opacity * 0.30
 */
export function buildPlankton(): THREE.Group {
  const group = new THREE.Group();

  const count = 600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const drifts = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 10 + Math.random() * 55;
    // Square the random number to bias particles toward the seafloor
    const rand = Math.random();
    const height = rand * rand * 22;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = height;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    const col = new THREE.Color(PLANKTON_COLORS[Math.floor(Math.random() * PLANKTON_COLORS.length)]);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
    phases[i] = Math.random() * Math.PI * 2;
    drifts[i] = 0.08 + Math.random() * 0.25;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  points.userData = {
    kind: 'planktonPoints',
    phases,
    drifts,
    baseOpacity: 0.75,
  } as PlanktonPointsUserData;
  group.add(points);

  // Larger glowing motes near the floor
  for (let i = 0; i < 22; i++) {
    const color = PLANKTON_COLORS[Math.floor(Math.random() * PLANKTON_COLORS.length)];
    const angle = Math.random() * Math.PI * 2;
    const radius = 15 + Math.random() * 40;
    const height = 0.5 + Math.random() * 5;
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mote.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    mote.userData = {
      baseY: height,
      baseOp: 0.85,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.7,
      driftAng: angle,
      driftRad: radius,
    } as PlanktonMoteUserData;
    group.add(mote);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 10, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.position.copy(mote.position);
    halo.userData = { parent: mote } as PlanktonHaloUserData;
    group.add(halo);
  }

  return group;
}

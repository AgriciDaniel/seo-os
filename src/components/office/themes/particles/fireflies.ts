import * as THREE from 'three';

export interface FireflyUserData {
  baseY: number;
  phase: number;
  speed: number;
}

export interface FireflyHaloUserData {
  parent: THREE.Mesh;
}

/**
 * Build the forest theme's ambient particles: glowing fireflies and a moon.
 *
 * 110 firefly point-meshes scattered around the platform at varied
 * altitudes (0.3 to 9.3) with per-instance bob speeds and phases. Each
 * firefly has a paired additive halo so it reads as a glow point, not a
 * hard pixel.
 *
 * A large moon disc sits at (-18, 20, -20) with two faded halo rings
 * to give the sky a focal point. The moon faces the office center.
 *
 * Animation: per-frame, each firefly bobs vertically with
 *   y = baseY + sin(time * speed + phase) * 0.5
 * and pulses opacity with
 *   opacity = 0.5 + 0.5 * sin(time * speed * 1.3 + phase)
 * Halos copy their parent's position and opacity * 0.25.
 */
export function buildFireflies(): THREE.Group {
  const group = new THREE.Group();

  for (let i = 0; i < 110; i++) {
    const fly = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffd980,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * 38;
    const height = 0.3 + Math.random() * 9;
    fly.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    fly.userData = {
      baseY: height,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.2,
    } as FireflyUserData;
    group.add(fly);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffd980,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.position.copy(fly.position);
    halo.userData = { parent: fly } as FireflyHaloUserData;
    group.add(halo);
  }

  // Moon as a sky focal point
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 32),
    new THREE.MeshBasicMaterial({
      color: 0xd8e0f0,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  moon.position.set(-18, 20, -20);
  moon.lookAt(0, 8, 0);
  group.add(moon);

  const moonHalo = new THREE.Mesh(
    new THREE.CircleGeometry(3.5, 32),
    new THREE.MeshBasicMaterial({
      color: 0xa8c0e0,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  moonHalo.position.copy(moon.position);
  moonHalo.lookAt(0, 8, 0);
  group.add(moonHalo);

  const moonHalo2 = new THREE.Mesh(
    new THREE.CircleGeometry(5, 32),
    new THREE.MeshBasicMaterial({
      color: 0x8aa8d0,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  moonHalo2.position.copy(moon.position);
  moonHalo2.lookAt(0, 8, 0);
  group.add(moonHalo2);

  return group;
}

import * as THREE from 'three';

/**
 * Build the forest theme's horizon: three depth-layered tree rings
 * around the office, plus low ground-mist bands at the treeline.
 *
 * Far ring (55 trees, radius 30-38): small fast-fading silhouettes
 * mostly absorbed by the scene fog.
 * Mid ring (48 trees, radius 22-27): the main treeline with trunks.
 * Near ring (12 trees, radius 18-20.5): larger, fewer, breaks the
 *   perfect ring pattern so the forest reads as natural rather than
 *   geometric.
 *
 * Ground mist: 24 + 20 translucent planes at low altitudes facing
 * inward, giving the treeline base a foggy, atmospheric foundation.
 *
 * All static (no animation).
 */
export function buildForestHorizon(): THREE.Group {
  const group = new THREE.Group();

  // Far ring
  for (let i = 0; i < 55; i++) {
    const angle = (i / 55) * Math.PI * 2 + Math.random() * 0.18;
    const radius = 30 + Math.random() * 8;
    const height = 3 + Math.random() * 3;
    const tree = new THREE.Mesh(
      new THREE.ConeGeometry(0.5 + Math.random() * 0.3, height, 5),
      new THREE.MeshBasicMaterial({ color: 0x0c1820 })
    );
    tree.position.set(Math.cos(angle) * radius, height / 2 - 0.5, Math.sin(angle) * radius);
    group.add(tree);
  }

  // Mid ring — main treeline with trunks
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2 + Math.random() * 0.15;
    const radius = 22 + Math.random() * 5;
    const height = 5 + Math.random() * 4;
    const tree = new THREE.Mesh(
      new THREE.ConeGeometry(0.7 + Math.random() * 0.4, height, 6),
      new THREE.MeshBasicMaterial({ color: 0x081410 })
    );
    tree.position.set(Math.cos(angle) * radius, height / 2 - 0.5, Math.sin(angle) * radius);
    group.add(tree);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.09, 0.7, 5),
      new THREE.MeshBasicMaterial({ color: 0x050a08 })
    );
    trunk.position.set(Math.cos(angle) * radius, -0.1, Math.sin(angle) * radius);
    group.add(trunk);
  }

  // Near ring — larger irregular trees
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
    const radius = 18 + Math.random() * 2.5;
    const height = 7 + Math.random() * 4;
    const tree = new THREE.Mesh(
      new THREE.ConeGeometry(0.95 + Math.random() * 0.3, height, 6),
      new THREE.MeshBasicMaterial({ color: 0x040a08 })
    );
    tree.position.set(Math.cos(angle) * radius, height / 2 - 0.5, Math.sin(angle) * radius);
    group.add(tree);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.14, 0.9, 6),
      new THREE.MeshBasicMaterial({ color: 0x030604 })
    );
    trunk.position.set(Math.cos(angle) * radius, -0.1, Math.sin(angle) * radius);
    group.add(trunk);
  }

  // Inner ground mist
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const radius = 21;
    const mist = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 1.2),
      new THREE.MeshBasicMaterial({
        color: 0x4a6878,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
      })
    );
    mist.position.set(Math.cos(angle) * radius, 0.4, Math.sin(angle) * radius);
    mist.lookAt(0, 0.4, 0);
    group.add(mist);
  }

  // Outer ground mist
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2 + 0.1;
    const radius = 27;
    const mist = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 1.0),
      new THREE.MeshBasicMaterial({
        color: 0x3a5a6a,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
      })
    );
    mist.position.set(Math.cos(angle) * radius, 0.8, Math.sin(angle) * radius);
    mist.lookAt(0, 0.8, 0);
    group.add(mist);
  }

  return group;
}

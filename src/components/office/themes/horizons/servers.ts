import * as THREE from 'three';

/**
 * Build the datacenter theme's horizon: 24 server racks arranged in a
 * ring around the office, each with 6 horizontal LED strips at varied
 * heights in green/blue/amber.
 *
 * Each rack is a tall box (1.6 x 5 x 0.9) rotated to face center. The
 * LED strips are individual emissive bars positioned just in front of
 * each rack's facing surface.
 *
 * Static — though the LEDs could be made to blink by adding userData
 * and animating opacity per frame if desired.
 */
export function buildServers(): THREE.Group {
  const group = new THREE.Group();

  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const radius = 20;

    const rack = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 5, 0.9),
      new THREE.MeshStandardMaterial({
        color: 0x0a1018,
        roughness: 0.7,
        metalness: 0.4,
      })
    );
    rack.position.set(Math.cos(angle) * radius, 2.5 - 0.1, Math.sin(angle) * radius);
    rack.lookAt(0, 2.5, 0);
    group.add(rack);

    for (let li = 0; li < 6; li++) {
      const color =
        Math.random() < 0.7
          ? 0x10b981
          : Math.random() < 0.5
            ? 0x3b82f6
            : 0xf59e0b;
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.04, 0.04),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.6 + Math.random() * 0.4,
        })
      );
      const ly = 0.6 + li * 0.6;
      led.position.set(
        Math.cos(angle) * (radius - 0.46),
        ly - 0.1,
        Math.sin(angle) * (radius - 0.46)
      );
      led.lookAt(0, ly - 0.1, 0);
      group.add(led);
    }
  }

  return group;
}

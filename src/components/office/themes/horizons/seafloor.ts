import * as THREE from 'three';

/**
 * Procedurally generate the caustics texture that simulates wavelight
 * patterns refracting through a water surface.
 *
 * 70 overlapping radial blobs in light-blue with cubic falloff, then
 * 30 thin curving streaks for refraction lines. The result is a wrap-
 * tiling texture suitable for scrolling across a large overhead plane.
 */
function makeCausticsTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(8,40,80,0)';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 70; i++) {
    const cx = Math.random() * 512;
    const cy = Math.random() * 512;
    const r = 12 + Math.random() * 30;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(190,235,255,0.35)');
    grad.addColorStop(0.3, 'rgba(140,220,255,0.18)');
    grad.addColorStop(0.7, 'rgba(80,180,230,0.05)');
    grad.addColorStop(1, 'rgba(40,120,180,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
  }

  ctx.strokeStyle = 'rgba(220,250,255,0.18)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 30; i++) {
    ctx.beginPath();
    let sx = Math.random() * 512;
    let sy = Math.random() * 512;
    ctx.moveTo(sx, sy);
    for (let j = 0; j < 6; j++) {
      sx += (Math.random() - 0.5) * 40;
      sy += (Math.random() - 0.5) * 40;
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export interface CausticsUserData {
  kind: 'caustics' | 'caustics2';
  texture: THREE.CanvasTexture;
}

export interface KelpUserData {
  phase: number;
  swaySpeed: number;
}

/**
 * Build the ocean theme's horizon: water surface caustics overhead,
 * coral/rock formations on the seafloor, kelp around the perimeter,
 * and volumetric haze rings to suggest water density.
 *
 * Surface caustics: two large flat planes at y=26 and y=28 with the
 * caustics texture at low opacity, additive blending. The texture
 * offset is animated per frame to suggest moving wavelight.
 *
 * Murky depth ring: large dark ring at y=-0.3 beyond radius 28 to
 * give the impression that visibility falls off into the abyss.
 *
 * Coral/rocks: 14 cluster formations of 3-5 squashed, deformed dark
 * spheres each, positioned around radius 18-25 on the seafloor.
 *
 * Kelp: 22 tall thin dark-green planes around the perimeter that
 * sway gently in animation.
 *
 * Volumetric haze: 4 horizontal rings at varied heights (y=4, 9, 14,
 * 19) with very low opacity to give the water its murky depth.
 *
 * Animation (handled by parent component):
 *   - For caustics: scroll texture.offset.x and .y over time
 *   - For kelp: rotation.z = sin(time * swaySpeed + phase) * 0.10
 */
export function buildSeafloor(): THREE.Group {
  const group = new THREE.Group();

  // Two caustic surface planes
  const caustics = makeCausticsTexture();
  caustics.repeat.set(3, 3);
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshBasicMaterial({
      map: caustics,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  surface.rotation.x = Math.PI / 2;
  surface.position.y = 28;
  surface.userData = { kind: 'caustics', texture: caustics } as CausticsUserData;
  group.add(surface);

  const caustics2 = makeCausticsTexture();
  caustics2.repeat.set(5, 5);
  const surface2 = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshBasicMaterial({
      map: caustics2,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  surface2.rotation.x = Math.PI / 2;
  surface2.position.y = 26;
  surface2.userData = { kind: 'caustics2', texture: caustics2 } as CausticsUserData;
  group.add(surface2);

  // Murky depth ring
  const murkyRing = new THREE.Mesh(
    new THREE.RingGeometry(28, 60, 48),
    new THREE.MeshBasicMaterial({
      color: 0x051028,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  murkyRing.rotation.x = -Math.PI / 2;
  murkyRing.position.y = -0.3;
  group.add(murkyRing);

  // Coral/rock formations
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
    const radius = 18 + Math.random() * 7;
    const clusterCount = 3 + Math.floor(Math.random() * 3);
    for (let c = 0; c < clusterCount; c++) {
      const dx = (Math.random() - 0.5) * 1.5;
      const dz = (Math.random() - 0.5) * 1.5;
      const size = 0.4 + Math.random() * 0.9;
      const rockGeo = new THREE.SphereGeometry(size, 10, 10);
      const rockPos = rockGeo.attributes.position;
      for (let rp = 0; rp < rockPos.count; rp++) {
        rockPos.setX(rp, rockPos.getX(rp) * (0.9 + Math.random() * 0.2));
        rockPos.setZ(rp, rockPos.getZ(rp) * (0.9 + Math.random() * 0.2));
      }
      rockPos.needsUpdate = true;
      rockGeo.computeVertexNormals();
      const rockColor =
        Math.random() < 0.7 ? 0x062038 : Math.random() < 0.5 ? 0x0a2848 : 0x083050;
      const rock = new THREE.Mesh(
        rockGeo,
        new THREE.MeshStandardMaterial({
          color: rockColor,
          roughness: 0.95,
          metalness: 0.05,
        })
      );
      rock.position.set(
        Math.cos(angle) * radius + dx,
        size * 0.4 - 0.5,
        Math.sin(angle) * radius + dz
      );
      rock.scale.y = 0.55;
      group.add(rock);
    }
  }

  // Kelp
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
    const radius = 22 + Math.random() * 8;
    const height = 4 + Math.random() * 7;
    const kelp = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, height),
      new THREE.MeshBasicMaterial({
        color: 0x083828,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    kelp.position.set(Math.cos(angle) * radius, height / 2 - 0.4, Math.sin(angle) * radius);
    kelp.lookAt(0, kelp.position.y, 0);
    kelp.userData = {
      phase: Math.random() * Math.PI * 2,
      swaySpeed: 0.25 + Math.random() * 0.4,
    } as KelpUserData;
    group.add(kelp);
  }

  // Volumetric haze rings
  for (let i = 0; i < 4; i++) {
    const fogR = new THREE.Mesh(
      new THREE.RingGeometry(8, 55, 32),
      new THREE.MeshBasicMaterial({
        color: 0x0a3868,
        transparent: true,
        opacity: 0.045,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    fogR.rotation.x = -Math.PI / 2;
    fogR.position.y = 4 + i * 5;
    group.add(fogR);
  }

  return group;
}

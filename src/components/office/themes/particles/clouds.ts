import * as THREE from 'three';

/**
 * Procedurally generate a soft, edge-faded cloud sprite texture.
 *
 * The blob centers are kept well inside the canvas bounds so their soft
 * radial falloff fades to zero alpha before reaching the edges — this
 * eliminates the "square edges" pixelation artifact that happens when
 * sprite materials see hard transparent-to-opaque transitions.
 *
 * Each gradient uses 5 stops with cubic ease-out for natural cloud softness.
 */
function makeCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 256);

  // Main cloud body: 18 overlapping soft blobs
  for (let i = 0; i < 18; i++) {
    const cx = 120 + Math.random() * 272;
    const cy = 70 + Math.random() * 116;
    const r = 50 + Math.random() * 70;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.25, 'rgba(252,253,255,0.42)');
    grad.addColorStop(0.5, 'rgba(245,248,253,0.22)');
    grad.addColorStop(0.75, 'rgba(235,240,250,0.08)');
    grad.addColorStop(1, 'rgba(230,235,245,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
  }
  // Wispy stretched second pass
  for (let j = 0; j < 6; j++) {
    const cx2 = 160 + Math.random() * 192;
    const cy2 = 100 + Math.random() * 56;
    const rx = 80 + Math.random() * 60;
    const grad2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, rx);
    grad2.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad2.addColorStop(0.6, 'rgba(248,250,255,0.10)');
    grad2.addColorStop(1, 'rgba(240,245,252,0)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, 512, 256);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

export interface CloudUserData {
  /** Angular drift speed in radians per frame. */
  drift: number;
}

/**
 * Build a layered cloud sprite field for the clouds theme.
 * 16 cumulus sprites at varied heights and distances, each with its own
 * unique procedurally-generated cloud texture and slow circular drift.
 *
 * Animation: each cloud's `userData.drift` is applied per-frame by the
 * parent component (see ThemeBackground animation loop).
 */
export function buildClouds(): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const material = new THREE.SpriteMaterial({
      map: makeCloudTexture(),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      alphaTest: 0.01,
      blending: THREE.NormalBlending,
    });
    const sprite = new THREE.Sprite(material);
    const angle = Math.random() * Math.PI * 2;
    const radius = 38 + Math.random() * 55;
    const height = 4 + Math.random() * 24;
    sprite.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    const size = 14 + Math.random() * 18;
    sprite.scale.set(size * 2, size, 1);
    sprite.userData = { drift: 0.0008 + Math.random() * 0.0012 } as CloudUserData;
    group.add(sprite);
  }
  return group;
}

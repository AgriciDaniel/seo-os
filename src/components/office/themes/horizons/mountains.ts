import * as THREE from 'three';

/**
 * Build the sunset theme's horizon: three layered mountain ranges
 * forming concentric jagged silhouettes around the office.
 *
 * Each range is a triangle-strip ring connecting peak points (varied
 * heights via sin/cos noise) to a flat ground plane.
 *
 * Far range (purple, radius 32, peak height 6): the most distant.
 * Mid range (maroon, radius 26, peak height 4): middle distance.
 * Near range (dark, radius 20, peak height 3): closest to the office.
 *
 * Static — these are pure silhouettes against the gradient sky.
 */
export function buildMountains(): THREE.Group {
  const group = new THREE.Group();

  const range = (
    rad: number,
    height: number,
    segments: number,
    color: number,
    jagged: number
  ) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const ang = (i / segments) * Math.PI * 2;
      const h =
        height *
        (0.5 +
          0.5 * Math.sin(i * jagged) * Math.cos(i * jagged * 0.7) +
          0.3 * Math.random());
      pts.push(new THREE.Vector3(Math.cos(ang) * rad, h - 0.1, Math.sin(ang) * rad));
    }
    const geo = new THREE.BufferGeometry();
    const verts: number[] = [];
    for (let i = 0; i < segments; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const b1 = new THREE.Vector3(p1.x, -0.1, p1.z);
      const b2 = new THREE.Vector3(p2.x, -0.1, p2.z);
      verts.push(b1.x, b1.y, b1.z, b2.x, b2.y, b2.z, p1.x, p1.y, p1.z);
      verts.push(b2.x, b2.y, b2.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    group.add(
      new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))
    );
  };

  range(32, 6, 60, 0x4a2845, 1.3); // far purple
  range(26, 4, 50, 0x6a3848, 1.7); // mid maroon
  range(20, 3, 40, 0x2a1a25, 2.1); // near dark

  return group;
}

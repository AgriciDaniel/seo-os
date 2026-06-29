'use client';

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { THEMES, type ThemeName } from './theme-config';
import { buildStars } from './particles/stars';
import { buildClouds, type CloudUserData } from './particles/clouds';
import {
  buildFireflies,
  type FireflyUserData,
  type FireflyHaloUserData,
} from './particles/fireflies';
import { buildDust } from './particles/dust';
import {
  buildPlankton,
  type PlanktonPointsUserData,
  type PlanktonMoteUserData,
  type PlanktonHaloUserData,
} from './particles/plankton';
import { buildForestHorizon } from './horizons/forest';
import { buildServers } from './horizons/servers';
import { buildMountains } from './horizons/mountains';
import {
  buildSeafloor,
  type CausticsUserData,
  type KelpUserData,
} from './horizons/seafloor';

interface ThemeBackgroundProps {
  /** Active theme name. Changing this rebuilds the scene's theme group. */
  theme: ThemeName;
}

type ThemeGroupKind =
  | 'stars'
  | 'clouds'
  | 'fireflies'
  | 'dust'
  | 'plankton'
  | 'seafloor'
  | 'other';

/**
 * Recursively dispose all geometry and material resources beneath an
 * Object3D. Materials with maps also dispose their textures.
 */
function disposeRecursive(obj: THREE.Object3D): void {
  obj.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const tex = (m as THREE.MeshBasicMaterial).map;
        if (tex) tex.dispose();
        m.dispose();
      }
    }
  });
}

/**
 * Renders the background ambience for the SEO Office scene: hemisphere
 * + directional lights, scene fog, particle layer, and horizon objects.
 *
 * Use this inside a `<Canvas>` from @react-three/fiber. The component
 * does not render any DOM — it adds Three.js objects to the parent scene
 * via useThree(). The CSS background gradient must be applied separately
 * to the Canvas container element (see useTheme hook for the gradient
 * string).
 *
 * @example
 * ```tsx
 * <Canvas>
 *   <ThemeBackground theme={theme} />
 *   <YourOfficeScene />
 * </Canvas>
 * ```
 */
export function ThemeBackground({ theme }: ThemeBackgroundProps) {
  const { scene } = useThree();
  const config = THEMES[theme];

  // Refs to the long-lived lights so we can mutate them on theme change
  // without re-adding to the scene each time. React 19 requires an explicit
  // initial value on useRef — `null` is the conventional sentinel.
  const hemiRef = useRef<THREE.HemisphereLight | null>(null);
  const keyRef = useRef<THREE.DirectionalLight | null>(null);
  const coolRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const themeGroupRef = useRef<THREE.Group | null>(null);

  // One-time setup: create lights and the theme group container,
  // add them to the scene. Cleanup removes them on unmount.
  useEffect(() => {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.5);
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(8, 18, 8);
    const cool = new THREE.DirectionalLight(0xffffff, 0.22);
    cool.position.set(-12, 6, -8);
    const ambient = new THREE.AmbientLight(0xffffff, 0.2);
    const group = new THREE.Group();
    group.name = 'theme-background-group';

    scene.add(hemi, key, cool, ambient, group);
    hemiRef.current = hemi;
    keyRef.current = key;
    coolRef.current = cool;
    ambientRef.current = ambient;
    themeGroupRef.current = group;

    return () => {
      // Tear down on unmount
      scene.remove(hemi, key, cool, ambient, group);
      disposeRecursive(group);
      // Reset fog so other scenes don't inherit it
      scene.fog = null;
    };
  }, [scene]);

  // Apply theme config whenever `theme` changes. Updates lights, fog,
  // and rebuilds the theme group's children. Three.js scene state is
  // mutable by design (it's not React state), so the immutability lint
  // doesn't apply to this R3F idiom — disabled below.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    const hemi = hemiRef.current;
    const key = keyRef.current;
    const cool = coolRef.current;
    const group = themeGroupRef.current;
    if (!hemi || !key || !cool || !group) return;

    hemi.color.setHex(config.hemiTop);
    hemi.groundColor.setHex(config.hemiBot);
    hemi.intensity = config.hemiInt;
    key.color.setHex(config.keyColor);
    key.intensity = config.keyInt;
    cool.color.setHex(config.coolColor);
    cool.intensity = config.coolInt;
    // eslint-disable-next-line react-hooks/immutability
    scene.fog = new THREE.Fog(config.fogColor, config.fogNear, config.fogFar);

    // Clear previous theme content
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      disposeRecursive(child);
    }

    // Particles
    let particles: THREE.Group | null = null;
    switch (config.particleType) {
      case 'stars':
        particles = buildStars();
        break;
      case 'clouds':
        particles = buildClouds();
        break;
      case 'fireflies':
        particles = buildFireflies();
        break;
      case 'dust':
        particles = buildDust(config.dustColor);
        break;
      case 'plankton':
        particles = buildPlankton();
        break;
      case 'none':
        particles = null;
        break;
    }
    if (particles) {
      particles.userData.kind = config.particleType as ThemeGroupKind;
      group.add(particles);
    }

    // Horizon
    let horizon: THREE.Group | null = null;
    switch (config.horizonType) {
      case 'forest':
        horizon = buildForestHorizon();
        break;
      case 'servers':
        horizon = buildServers();
        break;
      case 'mountains':
        horizon = buildMountains();
        break;
      case 'seafloor':
        horizon = buildSeafloor();
        horizon.userData.kind = 'seafloor';
        break;
      case 'none':
        horizon = null;
        break;
    }
    if (horizon) {
      group.add(horizon);
    }
  }, [config, scene]);

  // Per-frame animation for theme-specific particles and horizon elements.
  // Animation code in R3F mutates Three.js objects (positions, opacities,
  // texture offsets) every frame — this is the framework's intended pattern
  // and not a violation of React's immutability rules.
  useFrame((state, delta) => {
    /* eslint-disable react-hooks/immutability */
    const group = themeGroupRef.current;
    if (!group) return;
    const time = state.clock.elapsedTime;

    for (const child of group.children) {
      const kind = child.userData.kind as ThemeGroupKind | undefined;
      if (!kind) continue;

      if (kind === 'clouds') {
        // Slow circular drift
        for (const cloud of child.children) {
          const data = cloud.userData as CloudUserData;
          if (data.drift) {
            const angle = Math.atan2(cloud.position.z, cloud.position.x);
            const r = Math.sqrt(
              cloud.position.x * cloud.position.x + cloud.position.z * cloud.position.z
            );
            const newAngle = angle + data.drift;
            cloud.position.x = Math.cos(newAngle) * r;
            cloud.position.z = Math.sin(newAngle) * r;
          }
        }
      } else if (kind === 'fireflies') {
        for (const fly of child.children) {
          const data = fly.userData as Partial<FireflyUserData & FireflyHaloUserData>;
          if (data.baseY !== undefined && data.speed !== undefined && data.phase !== undefined) {
            const m = fly as THREE.Mesh;
            m.position.y = data.baseY + Math.sin(time * data.speed + data.phase) * 0.5;
            (m.material as THREE.MeshBasicMaterial).opacity =
              0.5 + 0.5 * Math.sin(time * data.speed * 1.3 + data.phase);
          } else if (data.parent) {
            const m = fly as THREE.Mesh;
            m.position.copy(data.parent.position);
            (m.material as THREE.MeshBasicMaterial).opacity =
              (data.parent.material as THREE.MeshBasicMaterial).opacity * 0.25;
          }
        }
      } else if (kind === 'plankton') {
        for (const node of child.children) {
          const data = node.userData as Partial<
            PlanktonPointsUserData & PlanktonMoteUserData & PlanktonHaloUserData
          >;
          if (data.kind === 'planktonPoints' && data.drifts) {
            const pts = node as THREE.Points;
            const pos = pts.geometry.attributes.position as THREE.BufferAttribute;
            for (let i = 0; i < pos.count; i++) {
              let y = pos.getY(i) + data.drifts[i] * delta;
              if (y > 30) y = 0;
              pos.setY(i, y);
            }
            pos.needsUpdate = true;
          } else if (
            data.baseY !== undefined &&
            data.speed !== undefined &&
            data.phase !== undefined &&
            data.driftAng !== undefined &&
            data.driftRad !== undefined &&
            data.baseOp !== undefined
          ) {
            const m = node as THREE.Mesh;
            m.position.y = data.baseY + Math.sin(time * data.speed + data.phase) * 0.5;
            const newAng = data.driftAng + time * 0.015;
            m.position.x = Math.cos(newAng) * data.driftRad;
            m.position.z = Math.sin(newAng) * data.driftRad;
            (m.material as THREE.MeshBasicMaterial).opacity =
              data.baseOp * (0.6 + 0.4 * Math.sin(time * data.speed * 1.5 + data.phase));
          } else if (data.parent) {
            const m = node as THREE.Mesh;
            m.position.copy(data.parent.position);
            (m.material as THREE.MeshBasicMaterial).opacity =
              (data.parent.material as THREE.MeshBasicMaterial).opacity * 0.3;
          }
        }
      } else if (kind === 'seafloor') {
        for (const node of child.children) {
          const data = node.userData as Partial<CausticsUserData & KelpUserData>;
          if ((data.kind === 'caustics' || data.kind === 'caustics2') && data.texture) {
            data.texture.offset.x = Math.sin(time * 0.08) * 0.15;
            data.texture.offset.y = time * 0.04;
          } else if (data.swaySpeed !== undefined && data.phase !== undefined) {
            node.rotation.z = Math.sin(time * data.swaySpeed + data.phase) * 0.1;
          }
        }
      }
    }
    /* eslint-enable react-hooks/immutability */
  });

  return null;
}

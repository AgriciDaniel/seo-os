"use client";

/**
 * BrainScene — content-only `<Brain>` component used by
 * `office/BrainChandelier.tsx` (the sky-brain hanging over the orchestrator).
 *
 * The file owns the brain rendering geometry, the lobe routing, and the
 * deterministic per-node placement. The consumer passes `{ nodes, edges }`
 * fetched from `/api/brain/graph?slug=...`.
 *
 * Canvas, lighting, and OrbitControls belong to the consumer — `<Brain>` is
 * content-only and renders into whatever scene contains it.
 */

import { Html } from "@react-three/drei";
import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

/* -------------------------------------------------------------------------- */
/* types                                                                       */
/* -------------------------------------------------------------------------- */

export interface BrainNode {
  id: string;
  title: string;
  type: string;
  status: string;
  confidence: string | null;
}

export interface BrainEdge {
  source: string;
  target: string;
  kind: "related" | "sources";
}

export type LobeKey = "frontal" | "parietal" | "temporal" | "occipital" | "cerebellum";

/* -------------------------------------------------------------------------- */
/* lobe palette                                                                */
/* -------------------------------------------------------------------------- */

export const LOBES: Record<LobeKey, { name: string; color: string }> = {
  frontal: { name: "Frontal — projects", color: "#D4537E" },
  parietal: { name: "Parietal — audits / flows", color: "#1D9E75" },
  temporal: { name: "Temporal — people / sources", color: "#BA7517" },
  occipital: { name: "Occipital — concepts", color: "#7F77DD" },
  cerebellum: { name: "Cerebellum — overlays", color: "#378ADD" },
};

const TYPE_TO_LOBE: Record<string, LobeKey> = {
  deliverable: "frontal",
  decision: "frontal",
  "keyword-strategy": "frontal",
  "page-brief": "frontal",
  audit: "parietal",
  flow: "parietal",
  entity: "temporal",
  stakeholder: "temporal",
  source: "temporal",
  concept: "occipital",
  question: "occipital",
  meta: "occipital",
  "business-type-overlay": "cerebellum",
};

export const SIZE_BY_CONFIDENCE: Record<string, number> = {
  high: 0.045,
  medium: 0.036,
  low: 0.029,
  seed: 0.024,
};

/* -------------------------------------------------------------------------- */
/* deterministic placement                                                     */
/* -------------------------------------------------------------------------- */

function hash(s: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
}

export function lobeFor(type: string): LobeKey {
  return TYPE_TO_LOBE[type] ?? "parietal";
}

export function positionForNote(id: string, lobe: LobeKey): THREE.Vector3 {
  const side: 1 | -1 = hash(id, 1) < 0.5 ? -1 : 1;
  const u = hash(id, 2) * 2 - 1;
  const v = hash(id, 3) * 2 - 1;
  const w = hash(id, 4) * 2 - 1;

  if (lobe === "cerebellum") {
    return new THREE.Vector3(u * 0.55, v * 0.3 - 0.52, w * 0.4 - 0.95);
  }

  let su = u, sv = v, sw = w;
  switch (lobe) {
    case "frontal":
      sw = 0.45 + Math.abs(w) * 0.5;
      break;
    case "parietal":
      sv = 0.25 + Math.abs(v) * 0.55;
      sw = w * 0.4;
      break;
    case "temporal":
      su = side * (0.6 + Math.abs(u) * 0.35);
      sv = -Math.abs(v) * 0.55;
      sw = w * 0.6;
      break;
    case "occipital":
      sw = -0.45 - Math.abs(w) * 0.5;
      break;
  }
  const len2 = su * su + sv * sv + sw * sw;
  if (len2 > 0.92) {
    const k = Math.sqrt(0.92 / len2);
    su *= k;
    sv *= k;
    sw *= k;
  }
  return new THREE.Vector3(su * 0.5 + side * 0.5, sv * 0.78, sw * 1.05);
}

/* -------------------------------------------------------------------------- */
/* geometry builders                                                           */
/* -------------------------------------------------------------------------- */

function makeHemisphere(side: 1 | -1): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 80, 80);
  geo.scale(0.58, 0.86, 1.18);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n =
      0.05 * Math.sin(x * 9 + side) * Math.cos(y * 7) * Math.sin(z * 8) +
      0.025 * Math.sin(x * 18) * Math.cos(z * 14) +
      0.015 * Math.cos(y * 22 + x * 10);
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    pos.setXYZ(i, x + (x / len) * n, y + (y / len) * n, z + (z / len) * n);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function makeCerebellum(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 48, 48);
  geo.scale(0.72, 0.42, 0.55);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 0.03 * Math.sin(x * 22) * Math.cos(y * 18) + 0.02 * Math.sin(z * 25);
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    pos.setXYZ(i, x + (x / len) * n, y + (y / len) * n, z + (z / len) * n);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function makeGlobeGrid(radius: number, lats = 8, lons = 16, segs = 72): Float32Array {
  const positions: number[] = [];

  for (let i = 1; i < lats; i++) {
    const phi = (i / lats) * Math.PI;
    const r = Math.sin(phi) * radius;
    const y = Math.cos(phi) * radius;
    for (let j = 0; j < segs; j++) {
      const t1 = (j / segs) * Math.PI * 2;
      const t2 = ((j + 1) / segs) * Math.PI * 2;
      positions.push(
        Math.cos(t1) * r, y, Math.sin(t1) * r,
        Math.cos(t2) * r, y, Math.sin(t2) * r,
      );
    }
  }

  for (let i = 0; i < lons; i++) {
    const theta = (i / lons) * Math.PI * 2;
    for (let j = 0; j < segs; j++) {
      const phi1 = (j / segs) * Math.PI;
      const phi2 = ((j + 1) / segs) * Math.PI;
      const r1 = Math.sin(phi1) * radius;
      const y1 = Math.cos(phi1) * radius;
      const r2 = Math.sin(phi2) * radius;
      const y2 = Math.cos(phi2) * radius;
      positions.push(
        Math.cos(theta) * r1, y1, Math.sin(theta) * r1,
        Math.cos(theta) * r2, y2, Math.sin(theta) * r2,
      );
    }
  }

  return new Float32Array(positions);
}

const HOLO_VERT = `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const HOLO_FRAG = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uCamPos;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 viewDir = normalize(uCamPos - vPosW);
    float ndotv = clamp(abs(dot(viewDir, vNormalW)), 0.0, 1.0);
    float fres = pow(1.0 - ndotv, 2.45);
    float scanY = fract((vPosW.y + 1.75) / 3.5 - uTime * 0.055);
    float band = smoothstep(0.0, 0.018, scanY) * (1.0 - smoothstep(0.045, 0.08, scanY));
    float lines = sin(vPosW.y * 118.0 - uTime * 1.2) * 0.035;
    vec3 col = uColor * (1.0 + band * 0.42) + vec3(lines);
    float alpha = (fres * 0.82 + 0.035) * uOpacity;
    gl_FragColor = vec4(col, alpha);
  }
`;

/* -------------------------------------------------------------------------- */
/* sub-components                                                              */
/* -------------------------------------------------------------------------- */

function Hemisphere({ side }: { side: 1 | -1 }) {
  const geo = useMemo(() => makeHemisphere(side), [side]);
  return (
    <>
      <mesh geometry={geo} position={[side * 0.5, 0, 0]}>
        <meshPhongMaterial
          color={0xf0a087}
          transparent
          opacity={0.18}
          shininess={30}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={geo} position={[side * 0.5, 0, 0]}>
        <meshBasicMaterial color={0xd4537e} wireframe transparent opacity={0.06} />
      </mesh>
    </>
  );
}

function Cerebellum() {
  const geo = useMemo(() => makeCerebellum(), []);
  return (
    <mesh geometry={geo} position={[0, -0.52, -0.95]}>
      <meshPhongMaterial
        color={0xf0a087}
        transparent
        opacity={0.22}
        shininess={30}
        depthWrite={false}
      />
    </mesh>
  );
}

function BrainStem() {
  return (
    <mesh position={[0, -0.78, -0.85]}>
      <cylinderGeometry args={[0.1, 0.13, 0.4, 20]} />
      <meshPhongMaterial color={0xf0a087} transparent opacity={0.25} depthWrite={false} />
    </mesh>
  );
}

function BrainGlobe({
  color = "#5fdfff",
  radius = 1.68,
  reducedMotion = false,
}: {
  color?: string;
  radius?: number;
  reducedMotion?: boolean;
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const shellMatRef = useRef<THREE.ShaderMaterial>(null);
  const gridPositions = useMemo(() => makeGlobeGrid(radius * 1.002), [radius]);
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uOpacity: { value: 0.58 },
      uCamPos: { value: new THREE.Vector3() },
    }),
    [color],
  );

  useFrame((state, delta) => {
    if (shellMatRef.current) {
      shellMatRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      shellMatRef.current.uniforms.uCamPos.value.copy(camera.position);
    }
    if (groupRef.current && !reducedMotion) {
      groupRef.current.rotation.y -= delta * 0.018;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh renderOrder={20}>
        <sphereGeometry args={[radius, 64, 64]} />
        <shaderMaterial
          ref={shellMatRef}
          uniforms={uniforms}
          vertexShader={HOLO_VERT}
          fragmentShader={HOLO_FRAG}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <lineSegments renderOrder={19}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[gridPositions, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </lineSegments>

      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={19}>
        <torusGeometry args={[radius * 1.003, 0.006, 6, 128]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function Edges({ positions }: { positions: Float32Array }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={0xffffff} transparent opacity={0.18} />
    </lineSegments>
  );
}

const truncate = (s: string, n: number) =>
  s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s;

function InteractiveNode({
  node,
  position,
  color,
  size,
  distanceFactor,
  onSelect,
}: {
  node: BrainNode;
  position: THREE.Vector3;
  color: string;
  size: number;
  /** drei `<Html>` distanceFactor — larger = labels stay bigger when the
   *  camera is further. Tuned per-consumer (right pane uses 4 for the
   *  unscaled brain; the chandelier passes ~10 for the scale-3 brain). */
  distanceFactor: number;
  onSelect: (n: BrainNode) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(node);
  };
  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  };
  const handleOut = () => {
    setHovered(false);
    document.body.style.cursor = "";
  };

  return (
    <group position={position}>
      <mesh
        onClick={handleClick}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        scale={hovered ? 1.7 : 1}
      >
        <sphereGeometry args={[size, 14, 14]} />
        <meshBasicMaterial color={hovered ? "#ffffff" : color} />
      </mesh>
      {hovered && (
        <mesh>
          <sphereGeometry args={[size * 2.4, 18, 18]} />
          <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
      <Html
        center
        distanceFactor={distanceFactor}
        position={[0, size + 0.04, 0]}
        zIndexRange={[10, 0]}
        style={{
          pointerEvents: "none",
          userSelect: "none",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-mono), ui-monospace, monospace",
          fontSize: hovered ? "13px" : "10px",
          fontWeight: hovered ? 600 : 400,
          letterSpacing: hovered ? "0.04em" : "0.02em",
          textTransform: hovered ? "uppercase" : "none",
          color: hovered ? "#FFC000" : "rgba(220,220,230,0.55)",
          textShadow:
            "0 0 8px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,1), 0 1px 0 rgba(0,0,0,1)",
          transition: "color 120ms, font-size 120ms, letter-spacing 120ms",
          transform: "translate(-50%, -100%)",
        }}
      >
        {truncate(node.title, hovered ? 80 : 16)}
      </Html>
    </group>
  );
}

function StaticNode({
  position,
  color,
  size,
}: {
  position: THREE.Vector3;
  color: string;
  size: number;
}) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 10, 10]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/* public component                                                            */
/* -------------------------------------------------------------------------- */

export interface BrainProps {
  nodes: BrainNode[];
  edges: BrainEdge[];
  /**
   * When true (Brain tab), nodes have hover halos, distance-scaled labels,
   * and a click handler. When false (sky-brain chandelier), nodes render as
   * static colored spheres only — no DOM labels, no event handlers. The
   * chandelier sits very far from the camera and per-node interactivity
   * would just be ten thousand tiny DOM nodes nobody can click.
   */
  interactive?: boolean;
  onSelectNode?: (node: BrainNode) => void;
  /** Label scaling for drei `<Html>`. Defaults to 4 (right-pane BrainGraph
   *  framing). The office chandelier sits at scale=3 and ~5 units from the
   *  focused camera, so it passes a larger value (~10) so labels stay
   *  readable. */
  labelDistanceFactor?: number;
  /** Wrap the knowledge graph in a holographic observatory globe. */
  globe?: boolean;
  globeColor?: string;
  reducedMotion?: boolean;
}

/**
 * Content-only brain. Renders into whatever Canvas contains it.
 *
 * Used by `BrainGraph` (interactive) and `office/BrainChandelier` (static).
 */
export function Brain({
  nodes,
  edges,
  interactive = false,
  onSelectNode,
  labelDistanceFactor = 4,
  globe = false,
  globeColor = "#5fdfff",
  reducedMotion = false,
}: BrainProps) {
  const placement = useMemo(() => {
    const m = new Map<string, { pos: THREE.Vector3; lobe: LobeKey }>();
    for (const n of nodes) {
      const lobe = lobeFor(n.type);
      m.set(n.id, { pos: positionForNote(n.id, lobe), lobe });
    }
    return m;
  }, [nodes]);

  const edgePositions = useMemo(() => {
    const segs: number[] = [];
    for (const e of edges) {
      const a = placement.get(e.source);
      const b = placement.get(e.target);
      if (!a || !b) continue;
      segs.push(a.pos.x, a.pos.y, a.pos.z, b.pos.x, b.pos.y, b.pos.z);
    }
    return new Float32Array(segs);
  }, [edges, placement]);

  return (
    <>
      {globe && (
        <BrainGlobe
          color={globeColor}
          reducedMotion={reducedMotion}
        />
      )}

      <Hemisphere side={-1} />
      <Hemisphere side={1} />
      <Cerebellum />
      <BrainStem />

      {edgePositions.length > 0 && <Edges positions={edgePositions} />}

      {nodes.map((n) => {
        const p = placement.get(n.id);
        if (!p) return null;
        const color = LOBES[p.lobe].color;
        const size = SIZE_BY_CONFIDENCE[n.confidence ?? "seed"] ?? 0.024;
        if (interactive && onSelectNode) {
          return (
            <InteractiveNode
              key={n.id}
              node={n}
              position={p.pos}
              color={color}
              size={size}
              distanceFactor={labelDistanceFactor}
              onSelect={onSelectNode}
            />
          );
        }
        return <StaticNode key={n.id} position={p.pos} color={color} size={size} />;
      })}
    </>
  );
}

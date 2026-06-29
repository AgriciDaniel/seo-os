"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CubicBezierCurve3, type Mesh, Vector3 } from "three";

interface BrainParticleProps {
  from: [number, number, number];
  brainCenter: [number, number, number];
  color: string;
  bornAt: number;
  durationMs?: number;
}

export function BrainParticle({
  from,
  brainCenter,
  color,
  bornAt,
  durationMs = 800,
}: BrainParticleProps) {
  const ref = useRef<Mesh>(null);
  const curve = useMemo(() => {
    const start = new Vector3(...from);
    const end = new Vector3(...brainCenter);
    const c1 = start.clone().lerp(end, 0.3).setY(start.y + 1.2);
    const c2 = start.clone().lerp(end, 0.7).setY(end.y - 0.2);
    return new CubicBezierCurve3(start, c1, c2, end);
  }, [from, brainCenter]);
  const tmp = useMemo(() => new Vector3(), []);

  useFrame(() => {
    if (!ref.current) return;
    const t = Math.min(1, (performance.now() - bornAt) / durationMs);
    curve.getPoint(t, tmp);
    ref.current.position.copy(tmp);
    // Grow-in over first 10%, hold, fade-out over final 20%.
    const grow = t < 0.1 ? t * 10 : 1;
    const fade = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
    const s = grow * fade;
    ref.current.scale.setScalar(s);
  });

  return (
    <mesh ref={ref} position={from}>
      <sphereGeometry args={[0.06, 12, 12]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

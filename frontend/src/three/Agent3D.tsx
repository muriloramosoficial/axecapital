import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Agent } from '../types';
import { STATE_COLOR } from '../lib/format';

/**
 * Low-poly but deliberately "grown-up" office worker. Animation is driven by
 * the agent's current activity/state coming from the engine.
 */
export function Agent3D({ agent, seat }: { agent: Agent; seat: [number, number, number] }) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const phase = useRef(Math.random() * 10);

  const skin = agent.avatar?.skin ?? '#d8a87f';
  const shirt = agent.avatar?.shirt ?? '#1f2937';
  const hair = agent.avatar?.hair ?? '#1b1b1f';
  const build = agent.avatar?.build ?? 1;
  const color = STATE_COLOR[agent.state] ?? '#64748b';

  useFrame((_, dt) => {
    phase.current += dt;
    const t = phase.current;
    const act = agent.activity;
    const busy = agent.state !== 'IDLE';

    if (torso.current) {
      const lean = act === 'TYPING' || agent.state === 'EXECUTING' ? 0.18 : act === 'WRITING' ? 0.26 : 0.07;
      torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, lean + Math.sin(t * 1.4) * 0.012, 0.08);
      torso.current.position.y = THREE.MathUtils.lerp(
        torso.current.position.y,
        act === 'STRETCH' ? 0.1 : 0,
        0.06,
      );
    }
    if (head.current) {
      const look = act === 'TALKING' ? Math.sin(t * 2.1) * 0.45 : act === 'WALKING' ? Math.sin(t) * 0.3 : Math.sin(t * 0.7) * 0.12;
      head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, look, 0.08);
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, act === 'WRITING' ? 0.35 : -0.05, 0.08);
    }
    const typing = act === 'TYPING' || agent.state === 'EXECUTING' || agent.state === 'SCANNING';
    if (armL.current && armR.current) {
      if (act === 'PHONE') {
        armR.current.rotation.x = THREE.MathUtils.lerp(armR.current.rotation.x, -2.1, 0.12);
        armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, -1.15, 0.1);
      } else if (act === 'COFFEE') {
        armR.current.rotation.x = THREE.MathUtils.lerp(armR.current.rotation.x, -1.5 + Math.sin(t * 1.1) * 0.25, 0.1);
        armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, -1.0, 0.1);
      } else if (act === 'POINTING') {
        armR.current.rotation.x = THREE.MathUtils.lerp(armR.current.rotation.x, -1.75, 0.15);
        armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, -1.05, 0.1);
      } else if (act === 'STRETCH') {
        armR.current.rotation.x = THREE.MathUtils.lerp(armR.current.rotation.x, -2.6, 0.08);
        armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, -2.6, 0.08);
      } else {
        const base = -1.15;
        const wiggle = typing ? Math.sin(t * 11) * 0.09 : Math.sin(t * 1.6) * 0.02;
        armR.current.rotation.x = THREE.MathUtils.lerp(armR.current.rotation.x, base + wiggle, 0.2);
        armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, base - wiggle, 0.2);
      }
    }
    if (halo.current) {
      const m = halo.current.material as THREE.MeshBasicMaterial;
      m.color.set(color);
      m.opacity = busy ? 0.5 + Math.sin(t * 4) * 0.25 : 0.18;
      halo.current.scale.setScalar(1 + (busy ? Math.sin(t * 4) * 0.04 : 0));
    }
    if (root.current) {
      root.current.position.y = seat[1] + (agent.activity === 'WALKING' ? Math.abs(Math.sin(t * 4)) * 0.05 : 0);
    }
  });

  return (
    <group ref={root} position={seat}>
      {/* state halo on the floor */}
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.56, 0]}>
        <ringGeometry args={[0.42, 0.56, 36]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>

      <group ref={torso}>
        {/* hips */}
        <mesh position={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.46 * build, 0.3, 0.36]} />
          <meshStandardMaterial color="#10151d" roughness={0.85} />
        </mesh>
        {/* chest */}
        <mesh position={[0, 0.16, 0]} castShadow>
          <capsuleGeometry args={[0.21 * build, 0.34, 4, 12]} />
          <meshStandardMaterial color={shirt} roughness={0.72} metalness={0.05} />
        </mesh>
        {/* collar */}
        <mesh position={[0, 0.38, 0.03]}>
          <cylinderGeometry args={[0.11, 0.14, 0.09, 12]} />
          <meshStandardMaterial color="#0b1016" roughness={0.9} />
        </mesh>

        <group ref={head} position={[0, 0.56, 0]}>
          <mesh castShadow>
            <capsuleGeometry args={[0.135, 0.1, 4, 14]} />
            <meshStandardMaterial color={skin} roughness={0.62} />
          </mesh>
          <mesh position={[0, 0.09, -0.01]}>
            <sphereGeometry args={[0.142, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
            <meshStandardMaterial color={hair} roughness={0.95} />
          </mesh>
          {/* screen glow on the face */}
          <mesh position={[0, -0.01, 0.13]}>
            <planeGeometry args={[0.2, 0.14]} />
            <meshBasicMaterial color="#8fd4ff" transparent opacity={0.09} />
          </mesh>
        </group>

        <group ref={armL} position={[-0.26 * build, 0.26, 0]}>
          <mesh position={[0, -0.02, 0.21]} castShadow>
            <capsuleGeometry args={[0.062, 0.36, 4, 8]} />
            <meshStandardMaterial color={shirt} roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.04, 0.42]}>
            <sphereGeometry args={[0.062, 10, 8]} />
            <meshStandardMaterial color={skin} roughness={0.6} />
          </mesh>
        </group>
        <group ref={armR} position={[0.26 * build, 0.26, 0]}>
          <mesh position={[0, -0.02, 0.21]} castShadow>
            <capsuleGeometry args={[0.062, 0.36, 4, 8]} />
            <meshStandardMaterial color={shirt} roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.04, 0.42]}>
            <sphereGeometry args={[0.062, 10, 8]} />
            <meshStandardMaterial color={skin} roughness={0.6} />
          </mesh>
        </group>
      </group>

      {/* legs under the desk */}
      <mesh position={[0, -0.42, 0.22]} rotation={[-1.25, 0, 0]}>
        <boxGeometry args={[0.4 * build, 0.5, 0.22]} />
        <meshStandardMaterial color="#0d1219" roughness={0.9} />
      </mesh>
    </group>
  );
}

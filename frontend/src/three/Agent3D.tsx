import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Agent } from '../types';
import { STATE_COLOR } from '../lib/format';

/**
 * Business-formal office worker, low-poly but deliberately "grown-up":
 * tailored jacket with lapels, dress shirt, tie, lanyard badge and a headset
 * for the execution desk. Animation is driven by the agent's current
 * activity/state coming from the engine.
 */

const SUITS = ['#2a3545', '#39414c', '#222b3a', '#414a57', '#2f3b4a', '#4a4f58'];
const TIES = ['#1e5f74', '#7c2d3a', '#2f6b4d', '#3b4a93', '#8a5a1f', '#52306b'];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function Agent3D({ agent, seat }: { agent: Agent; seat: [number, number, number] }) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const phase = useRef(Math.random() * 10);

  const skin = agent.avatar?.skin ?? '#d8a87f';
  const hair = agent.avatar?.hair ?? '#2b2420';
  const build = agent.avatar?.build ?? 1;
  const color = STATE_COLOR[agent.state] ?? '#64748b';

  const look = useMemo(() => {
    const h = hash(agent.id + (agent.name ?? ''));
    return {
      suit: SUITS[h % SUITS.length],
      tie: TIES[(h >> 3) % TIES.length],
      shirt: ['#f3f6fa', '#e8eef7', '#dbe6f3', '#f5f1e8'][(h >> 6) % 4],
      headset: agent.role === 'TRADER' || agent.role === 'MARKET_SCOUT',
      longHair: (h >> 9) % 3 === 0,
      glasses: (h >> 11) % 3 === 0,
    };
  }, [agent.id, agent.name, agent.role]);

  useFrame((_, dt) => {
    phase.current += dt;
    const t = phase.current;
    const act = agent.activity;
    const busy = agent.state !== 'IDLE';

    if (torso.current) {
      const lean = act === 'TYPING' || agent.state === 'EXECUTING' ? 0.18 : act === 'WRITING' ? 0.26 : 0.07;
      torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, lean + Math.sin(t * 1.4) * 0.012, 0.08);
      torso.current.position.y = THREE.MathUtils.lerp(torso.current.position.y, act === 'STRETCH' ? 0.1 : 0, 0.06);
    }
    if (head.current) {
      const gaze =
        act === 'TALKING' ? Math.sin(t * 2.1) * 0.45 : act === 'WALKING' ? Math.sin(t) * 0.3 : Math.sin(t * 0.7) * 0.12;
      head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, gaze, 0.08);
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
      m.opacity = busy ? 0.55 + Math.sin(t * 4) * 0.22 : 0.22;
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
        <ringGeometry args={[0.44, 0.58, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>

      <group ref={torso}>
        {/* trousers / hips */}
        <mesh position={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.46 * build, 0.3, 0.36]} />
          <meshStandardMaterial color="#2c333d" roughness={0.88} />
        </mesh>

        {/* dress shirt base */}
        <mesh position={[0, 0.17, 0.02]}>
          <capsuleGeometry args={[0.195 * build, 0.34, 4, 12]} />
          <meshStandardMaterial color={look.shirt} roughness={0.68} />
        </mesh>
        {/* tailored jacket (slightly wider shell, open at the front) */}
        <mesh position={[0, 0.16, -0.015]} castShadow>
          <capsuleGeometry args={[0.225 * build, 0.34, 4, 14]} />
          <meshStandardMaterial color={look.suit} roughness={0.74} metalness={0.04} />
        </mesh>
        {/* lapels */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.075 * build, 0.27, 0.185]} rotation={[0.08, 0, s * 0.42]}>
            <planeGeometry args={[0.075, 0.26]} />
            <meshStandardMaterial color={look.suit} roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {/* tie */}
        <mesh position={[0, 0.2, 0.2]} rotation={[0.06, 0, 0]}>
          <planeGeometry args={[0.05, 0.3]} />
          <meshStandardMaterial color={look.tie} roughness={0.55} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.355, 0.205]}>
          <boxGeometry args={[0.055, 0.05, 0.02]} />
          <meshStandardMaterial color={look.tie} roughness={0.5} />
        </mesh>
        {/* shirt collar */}
        <mesh position={[0, 0.39, 0.03]}>
          <cylinderGeometry args={[0.105, 0.135, 0.075, 14]} />
          <meshStandardMaterial color={look.shirt} roughness={0.6} />
        </mesh>
        {/* lanyard + badge */}
        <mesh position={[0, 0.3, 0.18]} rotation={[0.1, 0, 0]}>
          <planeGeometry args={[0.16, 0.012]} />
          <meshStandardMaterial color="#1e293b" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0.045, 0.1, 0.2]} rotation={[0.1, 0, 0.06]}>
          <planeGeometry args={[0.085, 0.055]} />
          <meshStandardMaterial color="#fdfefe" emissive={color} emissiveIntensity={0.25} roughness={0.5} />
        </mesh>

        <group ref={head} position={[0, 0.58, 0]}>
          <mesh castShadow>
            <capsuleGeometry args={[0.135, 0.1, 4, 16]} />
            <meshStandardMaterial color={skin} roughness={0.58} />
          </mesh>
          {/* ears */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.135, -0.005, 0]}>
              <sphereGeometry args={[0.032, 8, 8]} />
              <meshStandardMaterial color={skin} roughness={0.6} />
            </mesh>
          ))}
          {/* hair */}
          <mesh position={[0, 0.085, -0.008]}>
            <sphereGeometry args={[0.145, 18, 14, 0, Math.PI * 2, 0, Math.PI / 1.95]} />
            <meshStandardMaterial color={hair} roughness={0.92} />
          </mesh>
          {look.longHair && (
            <mesh position={[0, -0.02, -0.075]}>
              <capsuleGeometry args={[0.1, 0.16, 4, 12]} />
              <meshStandardMaterial color={hair} roughness={0.92} />
            </mesh>
          )}
          {/* eyes */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.052, 0.012, 0.125]}>
              <sphereGeometry args={[0.016, 8, 8]} />
              <meshStandardMaterial color="#20262e" roughness={0.3} />
            </mesh>
          ))}
          {look.glasses && (
            <group position={[0, 0.012, 0.128]}>
              {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 0.052, 0, 0]}>
                  <torusGeometry args={[0.033, 0.005, 6, 16]} />
                  <meshStandardMaterial color="#2b3440" metalness={0.6} roughness={0.3} />
                </mesh>
              ))}
              <mesh>
                <boxGeometry args={[0.04, 0.005, 0.005]} />
                <meshStandardMaterial color="#2b3440" metalness={0.6} roughness={0.3} />
              </mesh>
            </group>
          )}
          {look.headset && (
            <group>
              <mesh position={[0, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
                <torusGeometry args={[0.135, 0.011, 6, 20, Math.PI]} />
                <meshStandardMaterial color="#222a34" roughness={0.5} />
              </mesh>
              <mesh position={[-0.138, 0.0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.038, 0.038, 0.03, 12]} />
                <meshStandardMaterial color="#222a34" roughness={0.5} />
              </mesh>
              <mesh position={[-0.1, -0.055, 0.075]} rotation={[0, 0, 0.5]}>
                <boxGeometry args={[0.1, 0.012, 0.012]} />
                <meshStandardMaterial color="#222a34" roughness={0.5} />
              </mesh>
            </group>
          )}
          {/* soft screen glow on the face */}
          <mesh position={[0, -0.01, 0.133]}>
            <planeGeometry args={[0.2, 0.14]} />
            <meshBasicMaterial color="#cfe6ff" transparent opacity={0.07} />
          </mesh>
        </group>

        {[armL, armR].map((ref, i) => {
          const s = i === 0 ? -1 : 1;
          return (
            <group key={i} ref={ref} position={[s * 0.265 * build, 0.26, 0]}>
              {/* sleeve */}
              <mesh position={[0, -0.02, 0.2]} castShadow>
                <capsuleGeometry args={[0.065, 0.34, 4, 10]} />
                <meshStandardMaterial color={look.suit} roughness={0.78} />
              </mesh>
              {/* shirt cuff */}
              <mesh position={[0, -0.035, 0.375]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.052, 0.052, 0.035, 10]} />
                <meshStandardMaterial color={look.shirt} roughness={0.6} />
              </mesh>
              {/* hand */}
              <mesh position={[0, -0.04, 0.425]}>
                <sphereGeometry args={[0.058, 10, 8]} />
                <meshStandardMaterial color={skin} roughness={0.58} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* legs + shoes under the desk */}
      <mesh position={[0, -0.42, 0.22]} rotation={[-1.25, 0, 0]}>
        <boxGeometry args={[0.4 * build, 0.5, 0.22]} />
        <meshStandardMaterial color="#2c333d" roughness={0.9} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.1, -0.66, 0.44]} rotation={[-0.25, 0, 0]}>
          <boxGeometry args={[0.13, 0.08, 0.26]} />
          <meshStandardMaterial color="#14181f" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

import { useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Agent, Desk } from '../types';
import { getScreen, type ScreenKind } from './screens';
import { Agent3D } from './Agent3D';
import { STATE_COLOR } from '../lib/format';

const money = (v: number) => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`;
import { useStore } from '../state/store';

const DESK_H = 0.74;

function screenPlan(desk: Desk, agent?: Agent): { kind: ScreenKind; symbol?: string }[] {
  const sym = agent?.symbol ?? 'EURUSD';
  const role = agent?.role;
  const plan: { kind: ScreenKind; symbol?: string }[] = [];
  if (desk.sector === 'EXECUTION' || role === 'TRADER') {
    plan.push({ kind: 'EXEC' }, { kind: 'CHART', symbol: sym }, { kind: 'DOM', symbol: sym }, { kind: 'CHART', symbol: 'XAUUSD' }, { kind: 'RISK' }, { kind: 'WATCHLIST' });
  } else if (role === 'RISK_MANAGER' || desk.id === 'risk-1') {
    plan.push({ kind: 'RISK' }, { kind: 'EXEC' }, { kind: 'WATCHLIST' }, { kind: 'CHART', symbol: 'DXY' });
  } else if (role === 'PORTFOLIO_MANAGER' || desk.id === 'risk-2') {
    plan.push({ kind: 'EXEC' }, { kind: 'WATCHLIST' }, { kind: 'RISK' }, { kind: 'CHART', symbol: 'US500' });
  } else if (role === 'QUANT_ANALYST' || desk.id === 'research-2') {
    plan.push({ kind: 'QUANT' }, { kind: 'TERMINAL' }, { kind: 'CHART', symbol: sym }, { kind: 'WATCHLIST' });
  } else if (role === 'MACRO_ANALYST' || role === 'NEWS_ANALYST' || desk.sector === 'NEWSROOM' || desk.id === 'research-3') {
    plan.push({ kind: 'NEWS' }, { kind: 'CHART', symbol: 'DXY' }, { kind: 'WATCHLIST' }, { kind: 'CHART', symbol: 'US10Y' });
  } else if (role === 'TECHNICAL_ANALYST' || desk.id === 'research-1') {
    plan.push({ kind: 'CHART', symbol: sym }, { kind: 'CHART', symbol: 'GBPUSD' }, { kind: 'TERMINAL' }, { kind: 'DOM', symbol: sym });
  } else {
    plan.push({ kind: 'CHART', symbol: sym }, { kind: 'DOM', symbol: sym }, { kind: 'WATCHLIST' }, { kind: 'NEWS' });
  }
  return plan.slice(0, desk.monitors);
}

function monitorLayout(n: number, width: number) {
  const out: { pos: [number, number, number]; rotY: number; w: number; h: number }[] = [];
  const bottomCount = n > 4 ? Math.ceil(n / 2) : n;
  const topCount = n - bottomCount;
  const w = Math.min(0.78, (width - 0.3) / bottomCount);
  const h = w * 0.58;
  for (let i = 0; i < bottomCount; i++) {
    const x = (i - (bottomCount - 1) / 2) * (w + 0.06);
    out.push({ pos: [x, DESK_H + 0.3 + h / 2, -0.45 + Math.abs(x) * 0.06], rotY: -x * 0.22, w, h });
  }
  for (let i = 0; i < topCount; i++) {
    const x = (i - (topCount - 1) / 2) * (w + 0.06);
    out.push({ pos: [x, DESK_H + 0.36 + h * 1.6, -0.52], rotY: -x * 0.18, w, h });
  }
  return out;
}

function Monitor({
  pos,
  rotY,
  w,
  h,
  kind,
  symbol,
  live,
}: {
  pos: [number, number, number];
  rotY: number;
  w: number;
  h: number;
  kind: ScreenKind;
  symbol?: string;
  live: boolean;
}) {
  const texture = useMemo(() => getScreen(kind, symbol), [kind, symbol]);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    if (!mat.current) return;
    const flicker = live ? 1 + Math.sin(s.clock.elapsedTime * 14 + pos[0] * 9) * 0.03 : 0.25;
    mat.current.emissiveIntensity = THREE.MathUtils.lerp(mat.current.emissiveIntensity, 0.95 * flicker, 0.2);
  });
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      {/* bezel */}
      <mesh castShadow>
        <boxGeometry args={[w + 0.035, h + 0.035, 0.022]} />
        <meshStandardMaterial color="#0a0d12" roughness={0.45} metalness={0.5} />
      </mesh>
      {/* screen */}
      <mesh position={[0, 0, 0.013]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          ref={mat}
          map={texture}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={0.9}
          toneMapped={false}
          roughness={0.28}
        />
      </mesh>
      {/* stand */}
      <mesh position={[0, -h / 2 - 0.13, -0.02]}>
        <cylinderGeometry args={[0.016, 0.02, 0.26, 10]} />
        <meshStandardMaterial color="#1b232e" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh position={[0, -h / 2 - 0.26, -0.02]}>
        <boxGeometry args={[0.2, 0.012, 0.14]} />
        <meshStandardMaterial color="#141a22" metalness={0.7} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Chair({ occupied }: { occupied: boolean }) {
  return (
    <group position={[0, 0, 0.95]} rotation={[0, occupied ? 0 : 0.5, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.52, 0.07, 0.5]} />
        <meshStandardMaterial color="#12171f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.76, 0.24]} rotation={[0.16, 0, 0]} castShadow>
        <boxGeometry args={[0.5, 0.58, 0.07]} />
        <meshStandardMaterial color="#141a23" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.42, 10]} />
        <meshStandardMaterial color="#20262f" metalness={0.8} roughness={0.3} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.24, 0.04, Math.sin(a) * 0.24]} rotation={[0, -a, 0]}>
            <boxGeometry args={[0.3, 0.035, 0.05]} />
            <meshStandardMaterial color="#1a1f27" metalness={0.6} roughness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

export function Desk3D({ desk, agent, onSelect }: { desk: Desk; agent?: Agent; onSelect: (id: string) => void }) {
  const plan = useMemo(() => screenPlan(desk, agent), [desk, agent?.role, agent?.symbol]);
  const monitors = useMemo(() => monitorLayout(plan.length, desk.width), [plan.length, desk.width]);
  const strip = useRef<THREE.MeshBasicMaterial>(null);
  const focus = useStore((s) => s.focus);
  const color = agent ? STATE_COLOR[agent.state] ?? '#64748b' : '#223042';
  const focused = focus?.deskId === desk.id;

  useFrame((s) => {
    if (strip.current) {
      strip.current.color.set(color);
      strip.current.opacity = agent && agent.state !== 'IDLE' ? 0.55 + Math.sin(s.clock.elapsedTime * 3.4) * 0.3 : 0.2;
    }
  });

  return (
    <group position={[desk.x, 0, desk.z]} rotation={[0, desk.rot, 0]} onClick={() => agent && onSelect(agent.id)}>
      {/* desktop */}
      <mesh position={[0, DESK_H, 0]} castShadow receiveShadow>
        <boxGeometry args={[desk.width, 0.055, desk.depth]} />
        <meshStandardMaterial color="#10141b" roughness={0.42} metalness={0.25} />
      </mesh>
      {/* desk edge light strip */}
      <mesh position={[0, DESK_H - 0.04, desk.depth / 2 + 0.001]}>
        <planeGeometry args={[desk.width * 0.96, 0.018]} />
        <meshBasicMaterial ref={strip} color={color} transparent opacity={0.3} toneMapped={false} />
      </mesh>
      {/* modesty panel + legs */}
      <mesh position={[0, 0.38, -desk.depth / 2 + 0.06]}>
        <boxGeometry args={[desk.width * 0.98, 0.66, 0.03]} />
        <meshStandardMaterial color="#0b0f15" roughness={0.9} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * desk.width) / 2 - s * 0.1, 0.37, 0]}>
          <boxGeometry args={[0.07, 0.72, desk.depth * 0.92]} />
          <meshStandardMaterial color="#161c25" metalness={0.65} roughness={0.42} />
        </mesh>
      ))}

      {monitors.map((m, i) => (
        <Monitor key={i} {...m} kind={plan[i].kind} symbol={plan[i].symbol} live={!!agent} />
      ))}

      {/* keyboard + mouse + mug + phone + papers */}
      <mesh position={[0, DESK_H + 0.035, 0.18]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.46, 0.016, 0.15]} />
        <meshStandardMaterial color="#0c1016" roughness={0.6} />
      </mesh>
      <mesh position={[0, DESK_H + 0.045, 0.18]}>
        <planeGeometry args={[0.44, 0.13]} />
        <meshBasicMaterial color="#1b4b6b" transparent opacity={0.35} toneMapped={false} />
      </mesh>
      <mesh position={[0.34, DESK_H + 0.04, 0.2]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshStandardMaterial color="#121821" roughness={0.5} />
      </mesh>
      <mesh position={[-desk.width / 2 + 0.26, DESK_H + 0.08, 0.14]}>
        <cylinderGeometry args={[0.045, 0.04, 0.1, 12]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
      </mesh>
      <mesh position={[desk.width / 2 - 0.28, DESK_H + 0.05, -0.1]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[0.18, 0.05, 0.22]} />
        <meshStandardMaterial color="#0e131a" roughness={0.7} />
      </mesh>
      <mesh position={[-desk.width / 2 + 0.55, DESK_H + 0.032, 0.26]} rotation={[-Math.PI / 2, 0, 0.3]}>
        <planeGeometry args={[0.21, 0.29]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.95} />
      </mesh>

      <Chair occupied={!!agent} />
      {agent && <Agent3D agent={agent} seat={[0, 1.05, 0.78]} />}

      {focused && <pointLight position={[0, 1.9, 0.4]} intensity={6} distance={5} color="#8ec7ff" />}

      <Html
        position={[0, DESK_H + 1.42, desk.depth / 2]}
        center
        distanceFactor={11}
        zIndexRange={[20, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          className="min-w-[132px] whitespace-nowrap rounded-[4px] border px-2 py-[3px] backdrop-blur-sm"
          style={{
            borderColor: `${color}55`,
            background: 'rgba(5,8,13,0.82)',
            boxShadow: focused ? `0 0 18px ${color}66` : 'none',
          }}
        >
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>
            {agent ? `${agent.name} · ${agent.symbol ?? desk.label}` : `${desk.label} · vacant`}
            {agent && <span className="ml-2 text-slate-400">{agent.state}</span>}
          </div>
          {agent && (
            <div className="flex items-center justify-between gap-2 font-mono text-[9px] leading-tight">
              {agent.openSymbol ? (
                <span style={{ color: agent.openPnl >= 0 ? '#4ade80' : '#f05252' }}>
                  ● LIVE {agent.openSymbol} {money(agent.openPnl)}
                </span>
              ) : (
                <span className="text-slate-500">no open entry</span>
              )}
              <span
                className="rounded px-1"
                style={{
                  color: (agent.daily?.realized ?? 0) >= 0 ? '#86efac' : '#fca5a5',
                  background: (agent.daily?.realized ?? 0) >= 0 ? 'rgba(74,222,128,0.12)' : 'rgba(240,82,82,0.14)',
                }}
                title="Realised result of the day for this agent"
              >
                DAY {money(agent.daily?.realized ?? 0)} · {agent.daily?.trades ?? 0}t
              </span>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

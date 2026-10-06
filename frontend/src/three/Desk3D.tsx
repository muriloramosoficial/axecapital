import { useMemo, useRef } from 'react';
import { Billboard } from '@react-three/drei';
import { Text } from './SceneText';
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
  if (desk.sector === 'LAB' || role === 'BACKTEST_ANALYST' || role === 'STRATEGY_DEVELOPER') {
    plan.push({ kind: 'BACKTEST' }, { kind: 'CHART', symbol: sym }, { kind: 'EQUITY' }, { kind: 'OPTIMIZER' }, { kind: 'TERMINAL' });
  } else if (desk.sector === 'EXECUTION' || role === 'TRADER') {
    // o gráfico do ativo operado fica sempre no monitor central da mesa
    plan.push({ kind: 'DOM', symbol: sym }, { kind: 'CHART', symbol: sym }, { kind: 'EXEC' }, { kind: 'CHART', symbol: 'XAUUSD' }, { kind: 'RISK' }, { kind: 'WATCHLIST' });
  } else if (role === 'RISK_MANAGER' || desk.id === 'risk-1') {
    plan.push({ kind: 'RISK' }, { kind: 'CHART', symbol: sym }, { kind: 'EXEC' }, { kind: 'HEATMAP' });
  } else if (role === 'PORTFOLIO_MANAGER' || desk.id === 'risk-2') {
    plan.push({ kind: 'EXEC' }, { kind: 'CHART', symbol: sym }, { kind: 'HEATMAP' }, { kind: 'RISK' });
  } else if (role === 'QUANT_ANALYST' || desk.id === 'research-2') {
    plan.push({ kind: 'QUANT' }, { kind: 'CHART', symbol: sym }, { kind: 'TERMINAL' }, { kind: 'HEATMAP' });
  } else if (role === 'MACRO_ANALYST' || role === 'NEWS_ANALYST' || desk.sector === 'NEWSROOM' || desk.id === 'research-3') {
    plan.push({ kind: 'NEWSWIRE' }, { kind: 'CHART', symbol: sym }, { kind: 'BRIEFING' }, { kind: 'NEWSPAGE' });
  } else if (role === 'TECHNICAL_ANALYST' || desk.id === 'research-1') {
    plan.push({ kind: 'DOM', symbol: sym }, { kind: 'CHART', symbol: sym }, { kind: 'CHART', symbol: 'GBPUSD' }, { kind: 'TERMINAL' });
  } else {
    plan.push({ kind: 'WATCHLIST' }, { kind: 'CHART', symbol: sym }, { kind: 'DOM', symbol: sym }, { kind: 'NEWSWIRE' });
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
        <boxGeometry args={[w + 0.03, h + 0.03, 0.02]} />
        <meshStandardMaterial color="#20262e" roughness={0.38} metalness={0.5} />
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
        <meshStandardMaterial color="#b8bfc7" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, -h / 2 - 0.26, -0.02]}>
        <boxGeometry args={[0.22, 0.014, 0.15]} />
        <meshStandardMaterial color="#aab2bb" metalness={0.8} roughness={0.35} />
      </mesh>
    </group>
  );
}

function Chair({ occupied }: { occupied: boolean }) {
  return (
    <group position={[0, 0, 0.95]} rotation={[0, occupied ? Math.PI : Math.PI + 0.5, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.52, 0.08, 0.5]} />
        <meshStandardMaterial color="#39414d" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.76, 0.24]} rotation={[0.16, 0, 0]} castShadow>
        <boxGeometry args={[0.5, 0.6, 0.07]} />
        <meshStandardMaterial color="#424b58" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.42, 10]} />
        <meshStandardMaterial color="#c2c8d0" metalness={0.85} roughness={0.28} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.24, 0.04, Math.sin(a) * 0.24]} rotation={[0, -a, 0]}>
            <boxGeometry args={[0.3, 0.035, 0.05]} />
            <meshStandardMaterial color="#9aa2ac" metalness={0.7} roughness={0.42} />
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
  const color = agent ? STATE_COLOR[agent.state] ?? '#64748b' : '#94a3b8';
  const spotlightId = useStore((s) => s.spotlight?.agentId);
  const selectedId = useStore((s) => s.selectedAgentId);
  const focused = focus?.deskId === desk.id;
  const highlighted = focused || (!!agent && (agent.id === spotlightId || agent.id === selectedId));
  const firstName = (agent?.name ?? '').split(' ')[0] || desk.label;

  useFrame((s) => {
    if (strip.current) {
      strip.current.color.set(color);
      strip.current.opacity = agent && agent.state !== 'IDLE' ? 0.55 + Math.sin(s.clock.elapsedTime * 3.4) * 0.3 : 0.2;
    }
  });

    const plateLabel = agent ? firstName : desk.label;
  const plateName = agent?.symbol ? `${plateLabel} · ${agent.symbol}` : plateLabel;
  const plateRaw = agent ? (agent.openSymbol ? agent.openPnl ?? 0 : agent.daily?.realized ?? 0) : 0;
  const plateValue = agent && (agent.openSymbol || plateRaw !== 0) ? `${agent.openSymbol ? '● ' : ''}${money(plateRaw)}` : '';
  const plateTone = plateRaw >= 0 ? '#5eead4' : '#fda4af';
  const plateW = Math.max(0.95, 0.12 + plateName.length * 0.056 + (plateValue ? plateValue.length * 0.055 : 0));

  return (
    <group position={[desk.x, 0, desk.z]} rotation={[0, desk.rot, 0]} onClick={() => agent && onSelect(agent.id)}>
      {/* desktop */}
      <mesh position={[0, DESK_H, 0]} castShadow receiveShadow>
        <boxGeometry args={[desk.width, 0.058, desk.depth]} />
        <meshStandardMaterial color="#d9cdb8" roughness={0.55} metalness={0.05} />
      </mesh>
      {/* desk edge light strip */}
      <mesh position={[0, DESK_H - 0.04, desk.depth / 2 + 0.001]}>
        <planeGeometry args={[desk.width * 0.96, 0.024]} />
        <meshBasicMaterial ref={strip} color={color} transparent opacity={0.3} toneMapped={false} />
      </mesh>
      {/* modesty panel + legs */}
      <mesh position={[0, 0.38, -desk.depth / 2 + 0.06]}>
        <boxGeometry args={[desk.width * 0.98, 0.66, 0.03]} />
        <meshStandardMaterial color="#eceef1" roughness={0.8} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * desk.width) / 2 - s * 0.1, 0.37, 0]}>
          <boxGeometry args={[0.07, 0.72, desk.depth * 0.92]} />
          <meshStandardMaterial color="#b4bbc4" metalness={0.72} roughness={0.36} />
        </mesh>
      ))}

      {monitors.map((m, i) => (
        <Monitor key={i} {...m} kind={plan[i].kind} symbol={plan[i].symbol} live={!!agent} />
      ))}

      {/* keyboard + mouse + mug + phone + papers */}
      <mesh position={[0, DESK_H + 0.035, 0.18]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.46, 0.016, 0.15]} />
        <meshStandardMaterial color="#2a2f37" roughness={0.55} />
      </mesh>
      <mesh position={[0, DESK_H + 0.045, 0.18]}>
        <planeGeometry args={[0.44, 0.13]} />
        <meshBasicMaterial color="#8fb6cf" transparent opacity={0.45} toneMapped={false} />
      </mesh>
      <mesh position={[0.34, DESK_H + 0.04, 0.2]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshStandardMaterial color="#39404a" roughness={0.45} />
      </mesh>
      <mesh position={[-desk.width / 2 + 0.26, DESK_H + 0.08, 0.14]}>
        <cylinderGeometry args={[0.045, 0.04, 0.1, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.45} />
      </mesh>
      <mesh position={[desk.width / 2 - 0.28, DESK_H + 0.05, -0.1]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[0.18, 0.05, 0.22]} />
        <meshStandardMaterial color="#303742" roughness={0.6} />
      </mesh>
      <mesh position={[-desk.width / 2 + 0.55, DESK_H + 0.032, 0.26]} rotation={[-Math.PI / 2, 0, 0.3]}>
        <planeGeometry args={[0.21, 0.29]} />
        <meshStandardMaterial color="#fbfcfd" roughness={0.95} />
      </mesh>

      <Chair occupied={!!agent} />
      {/* rotação de 180°: o agente encara os monitores (que ficam em -Z local) */}
      {agent && (
        <group rotation={[0, Math.PI, 0]}>
          <Agent3D agent={agent} seat={[0, 1.05, -0.78]} />
        </group>
      )}

      {highlighted && <pointLight position={[0, 1.9, 0.4]} intensity={7} distance={5.5} color="#cfe6ff" />}

      {/* Plaquinha do agente — texto 3D (antes era um <Html>, que flutuava
          por cima da cena, piscava nos cortes de câmera e custava DOM). */}
      <Billboard position={[0, DESK_H + 1.34, desk.depth / 2]}>
        <mesh>
          <planeGeometry args={[plateW, 0.2]} />
          <meshBasicMaterial color="#0d141d" transparent opacity={0.82} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[-plateW / 2 + 0.085, 0, 0.004]}>
          <circleGeometry args={[0.032, 12]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <Text
          position={[-plateW / 2 + 0.145, 0, 0.005]}
          anchorX="left"
          anchorY="middle"
          fontSize={0.1}
          color="#e8eef6"
          outlineWidth={0.004}
          outlineColor="#05080d"
          bold
        >
          {plateName}
        </Text>
        {plateValue && (
          <Text
            position={[plateW / 2 - 0.07, 0, 0.005]}
            anchorX="right"
            anchorY="middle"
            fontSize={0.095}
            color={plateTone}
            outlineWidth={0.004}
            outlineColor="#05080d"
            bold
          >
            {plateValue}
          </Text>
        )}
      </Billboard>
    </group>
  );
}

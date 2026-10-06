import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial, Text } from '@react-three/drei';
import * as THREE from 'three';
import { getScreen } from './screens';
import { useStore } from '../state/store';
import { TradingViewScreen } from './TradingViewScreen';

const FLOOR_W = 46;
const FLOOR_D = 38;
const WALL_H = 6.2;
const BACK_Z = -15;

function WallScreen({
  position,
  size,
  kind,
  symbol,
}: {
  position: [number, number, number];
  size: [number, number];
  kind: any;
  symbol?: string;
}) {
  const tex = useMemo(() => getScreen(kind, symbol), [kind, symbol]);
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[size[0] + 0.07, size[1] + 0.07, 0.07]} />
        <meshStandardMaterial color="#070a0f" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <planeGeometry args={size} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.85} toneMapped={false} />
      </mesh>
    </group>
  );
}

function CityWindow({ x, z, rotY, w = 7 }: { x: number; z: number; rotY: number; w?: number }) {
  return (
    <group position={[x, 3.1, z]} rotation={[0, rotY, 0]}>
      <mesh>
        <planeGeometry args={[w, 3.4]} />
        <meshBasicMaterial color="#0a1726" toneMapped={false} />
      </mesh>
      {Array.from({ length: 26 }).map((_, i) => {
        const bx = (Math.random() - 0.5) * w * 0.92;
        const bh = 0.5 + Math.random() * 2.3;
        return (
          <mesh key={i} position={[bx, -1.7 + bh / 2, 0.02]}>
            <planeGeometry args={[0.28 + Math.random() * 0.3, bh]} />
            <meshBasicMaterial color={new THREE.Color().setHSL(0.58, 0.5, 0.06 + Math.random() * 0.08)} toneMapped={false} />
          </mesh>
        );
      })}
      {Array.from({ length: 60 }).map((_, i) => (
        <mesh key={`l${i}`} position={[(Math.random() - 0.5) * w * 0.9, -1.6 + Math.random() * 2, 0.03]}>
          <planeGeometry args={[0.05, 0.04]} />
          <meshBasicMaterial color={Math.random() > 0.3 ? '#ffd9a0' : '#9ad4ff'} toneMapped={false} />
        </mesh>
      ))}
      {/* frame */}
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[w + 0.2, 3.6, 0.08]} />
        <meshStandardMaterial color="#0c1119" roughness={0.6} metalness={0.5} wireframe />
      </mesh>
    </group>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.22, 0.17, 0.44, 12]} />
        <meshStandardMaterial color="#121821" roughness={0.9} />
      </mesh>
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.16, 0.72, Math.sin(a) * 0.16]} rotation={[Math.cos(a) * 0.5, a, Math.sin(a) * 0.5]}>
            <coneGeometry args={[0.1, 0.72, 5]} />
            <meshStandardMaterial color="#1d4432" roughness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

function WallClock({ position, rotation }: { position: [number, number, number]; rotation: [number, number, number] }) {
  const hand = useRef<THREE.Mesh>(null);
  const min = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const t = useStore.getState().simNow;
    if (hand.current) hand.current.rotation.z = -((t / 60000) % 60) * (Math.PI / 30);
    if (min.current) min.current.rotation.z = -((t / 3600000) % 12) * (Math.PI / 6);
  });
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <cylinderGeometry args={[0.34, 0.34, 0.05, 28]} />
        <meshStandardMaterial color="#0d1117" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 28]} />
        <meshBasicMaterial color="#0a0f16" />
      </mesh>
      <mesh ref={hand} position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.02, 0.5]} />
        <meshBasicMaterial color="#6ee7b7" toneMapped={false} />
      </mesh>
      <mesh ref={min} position={[0, 0.045, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.03, 0.34]} />
        <meshBasicMaterial color="#94a3b8" toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Office() {
  const tvEnabled = useStore((s) => s.tvEnabled);
  const watchlist = useStore((s) => s.watchlist);
  const focus = useStore((s) => s.focus);
  const agents = useStore((s) => s.agents);
  const focusSymbol = useMemo(() => {
    const a = agents.find((x) => x.id === focus?.agentId);
    return a?.symbol ?? watchlist[0] ?? 'EURUSD';
  }, [focus?.agentId, agents, watchlist]);

  const wallScreens = useMemo(() => {
    const syms = [...(watchlist.length ? watchlist : ['EURUSD', 'GBPUSD', 'USDJPY']), 'DXY', 'US10Y', 'VIX'];
    const left = [
      { kind: 'CHART', symbol: syms[0] },
      { kind: 'CHART', symbol: syms[1] },
      { kind: 'CHART', symbol: syms[2] },
      { kind: 'NEWS' },
    ];
    const right = [
      { kind: 'CHART', symbol: syms[3] ?? 'DXY' },
      { kind: 'CHART', symbol: syms[4] ?? 'US10Y' },
      { kind: 'WATCHLIST' },
      { kind: 'RISK' },
    ];
    return { left, right };
  }, [watchlist]);

  return (
    <group>
      {/* ───────────────────────────── floor ───────────────────────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2]} receiveShadow>
        <planeGeometry args={[FLOOR_W, FLOOR_D]} />
        <MeshReflectorMaterial
          blur={[300, 90]}
          resolution={512}
          mixBlur={1}
          mixStrength={26}
          roughness={0.92}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.3}
          color="#070a0f"
          metalness={0.55}
          mirror={0.35}
        />
      </mesh>

      {/* carpet strips to break up the floor */}
      {[-11, 11].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, 1]}>
          <planeGeometry args={[9.5, 24]} />
          <meshStandardMaterial color="#0a0e14" roughness={1} />
        </mesh>
      ))}

      {/* ───────────────────────────── walls ───────────────────────────── */}
      <mesh position={[0, WALL_H / 2, BACK_Z]} receiveShadow>
        <planeGeometry args={[FLOOR_W, WALL_H]} />
        <meshStandardMaterial color="#080b11" roughness={0.95} />
      </mesh>
      <mesh position={[0, WALL_H / 2, 21]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[FLOOR_W, WALL_H]} />
        <meshStandardMaterial color="#070a0f" roughness={0.95} />
      </mesh>
      <mesh position={[-FLOOR_W / 2, WALL_H / 2, 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[FLOOR_D, WALL_H]} />
        <meshStandardMaterial color="#080b11" roughness={0.95} />
      </mesh>
      <mesh position={[FLOOR_W / 2, WALL_H / 2, 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[FLOOR_D, WALL_H]} />
        <meshStandardMaterial color="#080b11" roughness={0.95} />
      </mesh>
      {/* ceiling */}
      <mesh position={[0, WALL_H, 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[FLOOR_W, FLOOR_D]} />
        <meshStandardMaterial color="#05070b" roughness={1} />
      </mesh>
      {/* ceiling light strips */}
      {[-13, -6, 1, 8, 15].map((z) => (
        <group key={z}>
          {[-13, 0, 13].map((x) => (
            <mesh key={x} position={[x, WALL_H - 0.12, z]}>
              <boxGeometry args={[9, 0.07, 0.22]} />
              <meshBasicMaterial color="#2b4257" toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}

      {/* windows along the side walls */}
      {[-6, 2, 10].map((z) => (
        <CityWindow key={`l${z}`} x={-FLOOR_W / 2 + 0.08} z={z} rotY={Math.PI / 2} />
      ))}
      {[-6, 2, 10].map((z) => (
        <CityWindow key={`r${z}`} x={FLOOR_W / 2 - 0.08} z={z} rotY={-Math.PI / 2} />
      ))}

      {/* ─────────────────── MARKET INTELLIGENCE video wall ─────────────────── */}
      <group position={[0, 0, BACK_Z + 0.12]}>
        <mesh position={[0, 3.3, -0.02]}>
          <boxGeometry args={[26, 5.4, 0.12]} />
          <meshStandardMaterial color="#060910" roughness={0.6} metalness={0.4} />
        </mesh>
        <Text position={[0, 5.72, 0.2]} fontSize={0.42} letterSpacing={0.36} color="#7dd3fc" anchorX="center" font={undefined}>
          MARKET INTELLIGENCE
        </Text>
        <Text position={[0, 0.62, 0.2]} fontSize={0.2} letterSpacing={0.3} color="#334155" anchorX="center">
          AXE CAPITAL · AUTONOMOUS FX DESK · SIMULATION ENVIRONMENT
        </Text>

        {/* left cluster */}
        {wallScreens.left.map((s, i) => (
          <WallScreen
            key={`L${i}`}
            position={[-8.6 + (i % 2) * 3.3, 4.35 - Math.floor(i / 2) * 2.0, 0.12]}
            size={[3.1, 1.85]}
            kind={s.kind}
            symbol={(s as any).symbol}
          />
        ))}
        {/* right cluster */}
        {wallScreens.right.map((s, i) => (
          <WallScreen
            key={`R${i}`}
            position={[5.3 + (i % 2) * 3.3, 4.35 - Math.floor(i / 2) * 2.0, 0.12]}
            size={[3.1, 1.85]}
            kind={s.kind}
            symbol={(s as any).symbol}
          />
        ))}

        {/* centre: real TradingView advanced chart */}
        {tvEnabled ? (
          <TradingViewScreen position={[-1.65, 3.4, 0.16]} symbol={focusSymbol} width={1180} height={760} scale={0.0049} />
        ) : (
          <WallScreen position={[-1.65, 3.4, 0.12]} size={[5.8, 3.7]} kind="CHART" symbol={focusSymbol} />
        )}
      </group>

      {/* sector signage */}
      {[
        { t: 'RESEARCH', x: -17.6, z: 3.4, rot: Math.PI / 2 },
        { t: 'NEWS ROOM', x: -17.6, z: -5.6, rot: Math.PI / 2 },
        { t: 'RISK & PORTFOLIO', x: 17.6, z: 3.4, rot: -Math.PI / 2 },
        { t: 'EXECUTION', x: 0, z: 11.6, rot: 0 },
      ].map((s) => (
        <group key={s.t}>
          <Text position={[s.x, 0.03, s.z]} rotation={[-Math.PI / 2, 0, -s.rot]} fontSize={0.34} letterSpacing={0.34} color="#16293a" anchorX="center">
            {s.t}
          </Text>
          <Text position={[s.x, 2.9, s.z]} rotation={[0, s.rot, 0]} fontSize={0.22} letterSpacing={0.3} color="#2b4a63" anchorX="center">
            {s.t}
          </Text>
        </group>
      ))}

      {/* whiteboard */}
      <group position={[-22.7, 2.6, 3.4]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[4.2, 2.1]} />
          <meshStandardMaterial color="#0e141c" roughness={0.8} />
        </mesh>
        {Array.from({ length: 9 }).map((_, i) => (
          <mesh key={i} position={[-1.6 + (i % 3) * 1.4, 0.6 - Math.floor(i / 3) * 0.6, 0.01]}>
            <planeGeometry args={[1.0 + Math.random() * 0.2, 0.05]} />
            <meshBasicMaterial color={i % 4 === 0 ? '#4ade80' : '#2b4a63'} toneMapped={false} />
          </mesh>
        ))}
      </group>

      {/* water cooler */}
      <group position={[-19.6, 0, 7.5]}>
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[0.45, 1.1, 0.45]} />
          <meshStandardMaterial color="#111822" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.4, 0]}>
          <cylinderGeometry args={[0.22, 0.25, 0.6, 14]} />
          <meshPhysicalMaterial color="#7fd4ff" transparent opacity={0.4} roughness={0.1} transmission={0.7} />
        </mesh>
      </group>

      {/* decor */}
      <Plant position={[-20, 0, -10]} />
      <Plant position={[20, 0, -10]} />
      <Plant position={[-20, 0, 12]} />
      <Plant position={[20, 0, 12]} />
      <WallClock position={[-22.6, 4.4, -6]} rotation={[0, 0, Math.PI / 2]} />
      <WallClock position={[22.6, 4.4, -6]} rotation={[0, 0, -Math.PI / 2]} />

      {/* glass partition behind execution island */}
      <mesh position={[0, 1.6, 14]}>
        <boxGeometry args={[30, 3.2, 0.06]} />
        <meshPhysicalMaterial color="#9fd8ff" transparent opacity={0.06} roughness={0.08} metalness={0} transmission={0.6} />
      </mesh>

      {/* printer / credenza */}
      <group position={[18.5, 0, 1]}>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[1.6, 0.9, 0.8]} />
          <meshStandardMaterial color="#0e131b" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <boxGeometry args={[1.2, 0.2, 0.7]} />
          <meshStandardMaterial color="#141a23" roughness={0.6} />
        </mesh>
      </group>

      {/* floor branding */}
      <Text position={[0, 0.02, 13.6]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.72} letterSpacing={0.5} color="#111b26" anchorX="center">
        AXE CAPITAL
      </Text>
    </group>
  );
}

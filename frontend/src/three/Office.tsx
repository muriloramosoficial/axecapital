import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial, Text } from '@react-three/drei';
import * as THREE from 'three';
import { getScreen } from './screens';
import { useStore } from '../state/store';
import { BrandWall } from './BrandWall';

const FLOOR_W = 46;
const FLOOR_D = 38;
const WALL_H = 6.2;
const BACK_Z = -15;

function WallScreen({
  position,
  size,
  kind,
  symbol,
  rotY = 0,
}: {
  position: [number, number, number];
  size: [number, number];
  kind: any;
  symbol?: string;
  rotY?: number;
}) {
  const tex = useMemo(() => getScreen(kind, symbol), [kind, symbol]);
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh>
        <boxGeometry args={[size[0] + 0.07, size[1] + 0.07, 0.08]} />
        <meshStandardMaterial color="#161c25" roughness={0.38} metalness={0.45} />
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
        <meshBasicMaterial color="#cfe2f6" toneMapped={false} />
      </mesh>
      {Array.from({ length: 26 }).map((_, i) => {
        const bx = (Math.random() - 0.5) * w * 0.92;
        const bh = 0.5 + Math.random() * 2.1;
        return (
          <mesh key={i} position={[bx, -1.7 + bh / 2, 0.02]}>
            <planeGeometry args={[0.28 + Math.random() * 0.3, bh]} />
            <meshBasicMaterial color={new THREE.Color().setHSL(0.58, 0.12, 0.62 + Math.random() * 0.16)} toneMapped={false} />
          </mesh>
        );
      })}
      {Array.from({ length: 30 }).map((_, i) => (
        <mesh key={`l${i}`} position={[(Math.random() - 0.5) * w * 0.9, -1.6 + Math.random() * 2, 0.03]}>
          <planeGeometry args={[0.05, 0.05]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.55} toneMapped={false} />
        </mesh>
      ))}
      {/* frame */}
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[w + 0.22, 3.62, 0.09]} />
        <meshStandardMaterial color="#aeb7c2" roughness={0.42} metalness={0.45} wireframe />
      </mesh>
    </group>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.24, 0.18, 0.46, 14]} />
        <meshStandardMaterial color="#e3e6ea" roughness={0.75} />
      </mesh>
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.16, 0.72, Math.sin(a) * 0.16]} rotation={[Math.cos(a) * 0.5, a, Math.sin(a) * 0.5]}>
            <coneGeometry args={[0.11, 0.78, 6]} />
            <meshStandardMaterial color="#2f7a52" roughness={0.78} />
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
        <meshStandardMaterial color="#20293a" roughness={0.5} metalness={0.45} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 28]} />
        <meshBasicMaterial color="#f6f8fa" />
      </mesh>
      <mesh ref={hand} position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.02, 0.5]} />
        <meshBasicMaterial color="#0f766e" toneMapped={false} />
      </mesh>
      <mesh ref={min} position={[0, 0.045, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.03, 0.34]} />
        <meshBasicMaterial color="#1f2937" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Rack de servidores que "treina" os setups — LEDs piscando. */
function ServerRack({ position }: { position: [number, number, number] }) {
  const leds = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!leds.current) return;
    leds.current.children.forEach((c, i) => {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = 0.35 + 0.65 * Math.abs(Math.sin(clock.elapsedTime * (1.4 + (i % 5) * 0.6) + i));
    });
  });
  return (
    <group position={position}>
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[0.9, 2.1, 0.8]} />
        <meshStandardMaterial color="#1d242e" roughness={0.6} metalness={0.4} />
      </mesh>
      <group ref={leds}>
        {Array.from({ length: 18 }).map((_, i) => (
          <mesh key={i} position={[-0.3 + (i % 3) * 0.3, 0.35 + Math.floor(i / 3) * 0.26, 0.41]}>
            <planeGeometry args={[0.07, 0.035]} />
            <meshBasicMaterial color={i % 4 === 0 ? '#5eead4' : '#7dd3fc'} transparent opacity={0.6} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Sala fechada de backtest & treinamento, atrás do vidro do pregão. */
function ResearchLabRoom() {
  const GLASS_Z = 14.2;
  const BACK = 20.8;
  return (
    <group>
      {/* piso de vinil claro da sala */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, (GLASS_Z + BACK) / 2]}>
        <planeGeometry args={[30, BACK - GLASS_Z]} />
        <meshStandardMaterial color="#d7dde5" roughness={0.85} />
      </mesh>
      {/* divisória de vidro com montantes e vão da porta */}
      {[-1, 1].map((sgn) => (
        <group key={sgn}>
          <mesh position={[sgn * 9.25, 1.65, GLASS_Z]}>
            <boxGeometry args={[11.5, 3.3, 0.06]} />
            <meshPhysicalMaterial color="#dbeafe" transparent opacity={0.16} roughness={0.04} transmission={0.85} />
          </mesh>
          <mesh position={[sgn * 3.5, 1.65, GLASS_Z]}>
            <boxGeometry args={[0.1, 3.3, 0.12]} />
            <meshStandardMaterial color="#9aa3ae" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[sgn * 15, 1.65, GLASS_Z]}>
            <boxGeometry args={[0.1, 3.3, 0.12]} />
            <meshStandardMaterial color="#9aa3ae" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 3.36, GLASS_Z]}>
        <boxGeometry args={[30, 0.14, 0.16]} />
        <meshStandardMaterial color="#aab2bc" metalness={0.75} roughness={0.32} />
      </mesh>

      {/* letreiro da sala */}
      <mesh position={[0, 3.9, GLASS_Z]}>
        <boxGeometry args={[11, 0.7, 0.1]} />
        <meshStandardMaterial color="#1b2430" roughness={0.5} metalness={0.3} />
      </mesh>
      <Text position={[0, 3.9, GLASS_Z - 0.07]} rotation={[0, Math.PI, 0]} fontSize={0.3} letterSpacing={0.26} color="#67e8f9" anchorX="center">
        RESEARCH LAB
      </Text>
      <Text position={[0, 3.9, GLASS_Z + 0.07]} fontSize={0.3} letterSpacing={0.26} color="#67e8f9" anchorX="center">
        RESEARCH LAB · BACKTEST &amp; TRAINING
      </Text>

      {/* parede de telas da sala (fundo) */}
      <mesh position={[0, 2.6, BACK + 0.1]}>
        <boxGeometry args={[22, 5.2, 0.1]} />
        <meshStandardMaterial color="#2b3440" roughness={0.8} />
      </mesh>
      {[
        { kind: 'EQUITY', x: -6.4 },
        { kind: 'BACKTEST', x: -2.1 },
        { kind: 'OPTIMIZER', x: 2.1 },
        { kind: 'QUANT', x: 6.4 },
      ].map((sc) => (
        <WallScreen key={sc.kind} position={[sc.x, 3.1, BACK]} size={[3.9, 2.3]} kind={sc.kind} rotY={Math.PI} />
      ))}
      <Text position={[0, 4.75, BACK - 0.02]} rotation={[0, Math.PI, 0]} fontSize={0.26} letterSpacing={0.3} color="#8c98a6" anchorX="center">
        WALK-FORWARD · MULTI-TIMEFRAME · HIT RATE
      </Text>

      {/* quadro branco com as ideias */}
      <group position={[-13.4, 2.4, 17.4]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[4.4, 2.2]} />
          <meshStandardMaterial color="#fafbfc" roughness={0.55} />
        </mesh>
        {Array.from({ length: 11 }).map((_, i) => (
          <mesh key={i} position={[-1.5 + (i % 3) * 1.45, 0.72 - Math.floor(i / 3) * 0.5, 0.01]}>
            <planeGeometry args={[0.9 + ((i * 7) % 5) * 0.08, 0.05]} />
            <meshBasicMaterial color={i % 3 === 0 ? '#0ea5e9' : i % 4 === 0 ? '#16a34a' : '#64748b'} toneMapped={false} />
          </mesh>
        ))}
      </group>

      <ServerRack position={[12.6, 0, 18.6]} />
      <ServerRack position={[13.8, 0, 18.6]} />
      <Plant position={[-12.6, 0, 15.4]} />
      <Plant position={[12.4, 0, 15.4]} />

      <Text position={[0, 0.03, 15.6]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} letterSpacing={0.3} color="#9aa5b2" anchorX="center">
        RESEARCH LAB — NO LIVE ORDERS
      </Text>
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
    // esquerda = redação / notícias (crawler), direita = mercado
    const left = [
      { kind: 'NEWSPAGE' },
      { kind: 'NEWSWIRE' },
      { kind: 'BRIEFING' },
      { kind: 'CHART', symbol: syms[0] },
    ];
    const right = [
      { kind: 'HEATMAP' },
      { kind: 'NEWSWIRE' },
      { kind: 'CHART', symbol: syms[3] ?? 'DXY' },
      { kind: 'WATCHLIST' },
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
          mixStrength={7}
          roughness={0.78}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.3}
          color="#c3c9d1"
          metalness={0.18}
          mirror={0.22}
        />
      </mesh>

      {/* carpet strips to break up the floor */}
      {[-11, 11].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, 1]}>
          <planeGeometry args={[9.5, 24]} />
          <meshStandardMaterial color="#8d99a8" roughness={1} />
        </mesh>
      ))}

      {/* ───────────────────────────── walls ───────────────────────────── */}
      <mesh position={[0, WALL_H / 2, BACK_Z]} receiveShadow>
        <planeGeometry args={[FLOOR_W, WALL_H]} />
        <meshStandardMaterial color="#e7eaef" roughness={0.95} />
      </mesh>
      <mesh position={[0, WALL_H / 2, 21]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[FLOOR_W, WALL_H]} />
        <meshStandardMaterial color="#e2e6ec" roughness={0.95} />
      </mesh>
      <mesh position={[-FLOOR_W / 2, WALL_H / 2, 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[FLOOR_D, WALL_H]} />
        <meshStandardMaterial color="#e4e8ee" roughness={0.95} />
      </mesh>
      <mesh position={[FLOOR_W / 2, WALL_H / 2, 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[FLOOR_D, WALL_H]} />
        <meshStandardMaterial color="#e4e8ee" roughness={0.95} />
      </mesh>
      {/* ceiling */}
      <mesh position={[0, WALL_H, 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[FLOOR_W, FLOOR_D]} />
        <meshStandardMaterial color="#f2f4f7" roughness={1} />
      </mesh>
      {/* ceiling light strips */}
      {[-13, -6, 1, 8, 15].map((z) => (
        <group key={z}>
          {[-13, 0, 13].map((x) => (
            <mesh key={x} position={[x, WALL_H - 0.12, z]}>
              <boxGeometry args={[9, 0.07, 0.24]} />
              <meshBasicMaterial color="#ffffff" toneMapped={false} />
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

      {/* ────────── parede de monitores grandes (sem "telão" único) ────────── */}
      <group position={[0, 0, BACK_Z + 0.1]}>
        {/* painel ripado de fundo + estrutura de suporte */}
        <mesh position={[0, 3.4, -0.04]}>
          <boxGeometry args={[27, 5.6, 0.1]} />
          <meshStandardMaterial color="#2b3440" roughness={0.75} metalness={0.15} />
        </mesh>
        {Array.from({ length: 34 }).map((_, i) => (
          <mesh key={`slat${i}`} position={[-13 + i * 0.79, 3.4, 0.015]}>
            <boxGeometry args={[0.1, 5.5, 0.05]} />
            <meshStandardMaterial color="#394657" roughness={0.8} />
          </mesh>
        ))}
        {/* trilhos horizontais de fixação */}
        {[1.42, 4.62].map((y) => (
          <mesh key={`rail${y}`} position={[0, y, 0.07]}>
            <boxGeometry args={[26.4, 0.1, 0.12]} />
            <meshStandardMaterial color="#aeb6c0" metalness={0.75} roughness={0.32} />
          </mesh>
        ))}

        {/* letreiro */}
        <mesh position={[0, 6.0, 0.08]}>
          <boxGeometry args={[9.4, 0.62, 0.1]} />
          <meshStandardMaterial color="#e8ebef" roughness={0.5} metalness={0.2} />
        </mesh>
        <Text position={[0, 6.0, 0.16]} fontSize={0.3} letterSpacing={0.3} color="#16283a" anchorX="center">
          MARKET INTELLIGENCE
        </Text>

        {/* grade de monitores grandes: 2 fileiras laterais + par central */}
        {wallScreens.left.map((s, i) => (
          <WallScreen
            key={`L${i}`}
            position={[-10.15 + (i % 2) * 3.62, 4.62 - Math.floor(i / 2) * 2.24, 0.14]}
            size={[3.42, 2.0]}
            rotY={0.12 - (i % 2) * 0.05}
            kind={s.kind}
            symbol={(s as any).symbol}
          />
        ))}
        {wallScreens.right.map((s, i) => (
          <WallScreen
            key={`R${i}`}
            position={[6.53 + (i % 2) * 3.62, 4.62 - Math.floor(i / 2) * 2.24, 0.14]}
            size={[3.42, 2.0]}
            rotY={-0.07 - (i % 2) * 0.05}
            kind={s.kind}
            symbol={(s as any).symbol}
          />
        ))}

        {/* TELÃO CENTRAL — marca Axe Capital e espaço de patrocínio.
            O interruptor do ControlBar troca entre a arte e o gráfico ao vivo. */}
        {tvEnabled ? (
          <BrandWall position={[0, 4.34, 0.18]} size={[9.4, 2.8]} />
        ) : (
          <WallScreen position={[0, 4.34, 0.14]} size={[9.4, 2.8]} kind="CHART" symbol={focusSymbol} />
        )}
        <WallScreen position={[0, 2.12, 0.14]} size={[9.6, 1.18]} kind="WATCHLIST" />

        {/* faixa de ticker sob os monitores */}
        <mesh position={[0, 0.78, 0.14]}>
          <boxGeometry args={[26.4, 0.46, 0.08]} />
          <meshStandardMaterial color="#111823" roughness={0.5} />
        </mesh>
        <Text position={[0, 0.78, 0.2]} fontSize={0.19} letterSpacing={0.22} color="#5fd3b2" anchorX="center">
          AXE CAPITAL · AUTONOMOUS FX DESK · RESEARCH LAB ONLINE
        </Text>
      </group>

      {/* sector signage */}
      {[
        { t: 'RESEARCH', x: -17.6, z: 3.4, rot: Math.PI / 2 },
        { t: 'NEWS ROOM', x: -17.6, z: -5.6, rot: Math.PI / 2 },
        { t: 'RISK & PORTFOLIO', x: 17.6, z: 3.4, rot: -Math.PI / 2 },
        { t: 'EXECUTION', x: 0, z: 11.6, rot: 0 },
      ].map((s) => (
        <group key={s.t}>
          <Text position={[s.x, 0.03, s.z]} rotation={[-Math.PI / 2, 0, -s.rot]} fontSize={0.34} letterSpacing={0.34} color="#9aa5b2" anchorX="center">
            {s.t}
          </Text>
          <Text position={[s.x, 2.9, s.z]} rotation={[0, s.rot, 0]} fontSize={0.22} letterSpacing={0.3} color="#5a6a7b" anchorX="center">
            {s.t}
          </Text>
        </group>
      ))}

      {/* whiteboard */}
      <group position={[-22.7, 2.6, 3.4]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[4.2, 2.1]} />
          <meshStandardMaterial color="#fafbfc" roughness={0.6} />
        </mesh>
        {Array.from({ length: 9 }).map((_, i) => (
          <mesh key={i} position={[-1.6 + (i % 3) * 1.4, 0.6 - Math.floor(i / 3) * 0.6, 0.01]}>
            <planeGeometry args={[1.0 + Math.random() * 0.2, 0.05]} />
            <meshBasicMaterial color={i % 4 === 0 ? '#0f9d6a' : '#4a5b6c'} toneMapped={false} />
          </mesh>
        ))}
      </group>

      {/* water cooler */}
      <group position={[-19.6, 0, 7.5]}>
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[0.45, 1.1, 0.45]} />
          <meshStandardMaterial color="#eceff3" roughness={0.6} />
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

      <ResearchLabRoom />

      {/* printer / credenza */}
      <group position={[18.5, 0, 1]}>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[1.6, 0.9, 0.8]} />
          <meshStandardMaterial color="#e6e9ee" roughness={0.65} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <boxGeometry args={[1.2, 0.2, 0.7]} />
          <meshStandardMaterial color="#cfd5dd" roughness={0.5} />
        </mesh>
      </group>

      {/* floor branding */}
      <Text position={[0, 0.02, 13.6]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.72} letterSpacing={0.5} color="#9fa9b5" anchorX="center">
        AXE CAPITAL
      </Text>
    </group>
  );
}

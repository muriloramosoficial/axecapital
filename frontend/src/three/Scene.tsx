import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Line, OrbitControls, Preload, useProgress } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { CameraDirector, OVERVIEW } from './CameraDirector';
import { Office } from './Office';
import { LoungeAgents, LoungeRoom } from './Lounge';
import { isMarketOpen } from '../lib/market-hours';
import { Desk3D } from './Desk3D';
import { updateScreens } from './screens';
import { useStore } from '../state/store';
import type { Desk } from '../types';

/** Perfis de qualidade: trocáveis no backoffice, salvos em localStorage. */
const PROFILE = {
  alta: { dpr: [1, 1.9] as [number, number], reflector: 512, bloom: 0.3, shadows: true, aa: true },
  media: { dpr: [1, 1.4] as [number, number], reflector: 256, bloom: 0.24, shadows: true, aa: true },
  baixa: { dpr: [0.8, 1] as [number, number], reflector: 0, bloom: 0, shadows: false, aa: false },
};

function ScreenTicker() {
  useFrame(({ clock }) => updateScreens(clock.elapsedTime * 1000));
  return null;
}

/** Animated signal travelling between the desks of the current pipeline. */
function SignalBeam() {
  const focus = useStore((s) => s.focus);
  const desks = useStore((s) => s.desks);
  const last = useRef<Desk | null>(null);
  const [pair, setPair] = useState<{ from: Desk; to: Desk; at: number } | null>(null);
  const bead = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const d = desks.find((x) => x.id === focus?.deskId) ?? null;
    if (!d || d.id === last.current?.id) return;
    if (last.current) setPair({ from: last.current, to: d, at: performance.now() });
    last.current = d;
  }, [focus?.at, focus?.deskId, desks]);

  const points = useMemo(() => {
    if (!pair) return null;
    const a = new THREE.Vector3(pair.from.x, 1.5, pair.from.z);
    const b = new THREE.Vector3(pair.to.x, 1.5, pair.to.z);
    const mid = a.clone().lerp(b, 0.5).setY(3.6);
    return new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(32);
  }, [pair]);

  useFrame(() => {
    if (!bead.current || !points || !pair) return;
    const t = Math.min(1, (performance.now() - pair.at) / 1400);
    bead.current.position.copy(points[Math.floor(t * (points.length - 1))]);
    (bead.current.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    bead.current.visible = t < 1;
  });

  if (!points || !pair || performance.now() - pair.at > 2600) return null;
  return (
    <group>
      <Line points={points} color="#0e9f8a" lineWidth={1.4} transparent opacity={0.4} />
      <mesh ref={bead}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial color="#0fbf9f" transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

function Floor() {
  const desks = useStore((s) => s.desks);
  const agents = useStore((s) => s.agents);
  const select = useStore((s) => s.select);
  const restMode = useStore((s) => s.restMode);
  const simNow = useStore((s) => s.simNow);

  // mercado do ativo fechado → o agente está na sala de descanso, não na mesa
  const resting = agents.filter((a) => {
    if (restMode === 'never') return false;
    if (restMode === 'always') return !!a.symbol;
    return !isMarketOpen(a.symbol, simNow || Date.now());
  });
  const restingIds = new Set(resting.map((a) => a.id));

  return (
    <>
      {desks.map((desk) => {
        const agent = agents.find((a) => a.deskId === desk.id);
        return <Desk3D key={desk.id} desk={desk} agent={agent && !restingIds.has(agent.id) ? agent : undefined} onSelect={select} />;
      })}
      <LoungeAgents agents={resting} />
    </>
  );
}

/**
 * Cortina de carregamento.
 *
 * Era aqui que a cena "aparecia pela metade": enquanto texturas, fontes do
 * drei/Text e a arte do telão carregavam, pedaços do escritório surgiam em
 * cinza. Agora a cena só é revelada quando tudo está pronto (com um respiro de
 * 400 ms para o primeiro frame assentar).
 */
function LoadingCurtain() {
  const { active, progress } = useProgress();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (active) {
      setHidden(false);
      return;
    }
    const t = setTimeout(() => setHidden(true), 450);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#070b11] transition-opacity duration-700 ${
        hidden ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="w-[260px] text-center">
        <div className="text-[13px] font-semibold uppercase tracking-[0.42em] text-slate-100">Axe Capital</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-emerald-400/70">autonomous fx desk</div>
        <div className="mt-5 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400/80 transition-[width] duration-300"
            style={{ width: `${Math.max(6, Math.round(progress))}%` }}
          />
        </div>
        <div className="mono mt-2 text-[10px] text-slate-500">montando o escritório · {Math.round(progress)}%</div>
      </div>
    </div>
  );
}

/** Flash curtinho de switcher a cada corte de câmera (esconde a troca de plano). */
function CutFlash() {
  const cutAt = useStore((s) => s.cameraCutAt);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!cutAt) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 30);
    return () => clearTimeout(t);
  }, [cutAt]);
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 bg-black transition-opacity ${
        on ? 'opacity-70 duration-0' : 'opacity-0 duration-[220ms]'
      }`}
    />
  );
}

export function Scene() {
  const controls = useRef<any>(null);
  const quality = useStore((s) => s.quality);
  const p = PROFILE[quality] ?? PROFILE.alta;

  return (
    <>
      <Canvas
        key={quality}
        shadows={false}
        dpr={p.dpr}
        performance={{ min: 1 }}
        gl={{ antialias: p.aa, powerPreference: 'high-performance', stencil: false }}
        camera={{ position: [0, 17.5, 27], fov: 38, near: 0.12, far: 220 }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.04;
          // névoa longa, puxando para o mesmo tom do fundo: sem "parede cinza"
          scene.fog = new THREE.Fog('#b4c0ce', 72, 200);
        }}
      >
        <color attach="background" args={['#aab7c7']} />
        {/* daylight office: soft, even and bright — reads well on a 24/7 stream */}
        <ambientLight intensity={0.68} color="#eef3fb" />
        <hemisphereLight intensity={0.62} color="#ffffff" groundColor="#97a2b1" />
        <directionalLight
          position={[11, 19, 13]}
          intensity={1.05}
          color="#fff6ea"
        />
        <directionalLight position={[-12, 14, 6]} intensity={0.38} color="#cfe3ff" />
        <pointLight position={[0, 5.4, -10]} intensity={18} distance={34} color="#dceaff" />
        <pointLight position={[-14, 4.6, 4]} intensity={11} distance={26} color="#fff1dd" />
        <pointLight position={[14, 4.6, 4]} intensity={11} distance={26} color="#fff1dd" />
        <pointLight position={[0, 4.6, 8]} intensity={10} distance={24} color="#eaf4ff" />

        <Suspense fallback={null}>
          <Office reflector={p.reflector} />
          <LoungeRoom />
          <Floor />
          <SignalBeam />
          {/* sombra de contato assada uma única vez: aterra as mesas sem custo por frame */}
          {p.shadows && (
            <ContactShadows
              position={[0, 0.015, 2]}
              scale={46}
              resolution={1024}
              blur={2.4}
              opacity={0.42}
              far={4.5}
              frames={1}
              color="#2a3240"
            />
          )}
          <Preload all />
        </Suspense>

        <ScreenTicker />
        <CameraDirector controls={controls} />
        <OrbitControls
          ref={controls}
          enablePan
          enableDamping
          dampingFactor={0.08}
          minDistance={2.4}
          maxDistance={46}
          maxPolarAngle={Math.PI / 2.08}
          target={[OVERVIEW.target.x, OVERVIEW.target.y, OVERVIEW.target.z]}
        />
        {p.bloom > 0 && (
          <EffectComposer multisampling={0}>
            <Bloom intensity={p.bloom} luminanceThreshold={0.74} luminanceSmoothing={0.26} mipmapBlur radius={0.55} />
            <Vignette eskil={false} offset={0.3} darkness={0.4} />
          </EffectComposer>
        )}
      </Canvas>

      <CutFlash />
      <LoadingCurtain />
    </>
  );
}

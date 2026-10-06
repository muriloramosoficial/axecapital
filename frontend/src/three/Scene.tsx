import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, AdaptiveDpr, Line } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Office } from './Office';
import { Desk3D } from './Desk3D';
import { updateScreens } from './screens';
import { useStore } from '../state/store';
import type { Desk } from '../types';

const OVERVIEW = { pos: new THREE.Vector3(0, 17.5, 27), target: new THREE.Vector3(0, 1.6, -1) };

function ScreenTicker() {
  useFrame(({ clock }) => updateScreens(clock.elapsedTime * 1000));
  return null;
}

function CameraRig({ controls }: { controls: React.MutableRefObject<any> }) {
  const { camera } = useThree();
  const focus = useStore((s) => s.focus);
  const desks = useStore((s) => s.desks);
  const autoCamera = useStore((s) => s.autoCamera);
  const wanted = useRef({ pos: OVERVIEW.pos.clone(), target: OVERVIEW.target.clone() });
  const until = useRef(0);

  useEffect(() => {
    if (!focus || !autoCamera) return;
    const desk = desks.find((d) => d.id === focus.deskId);
    if (!desk) return;
    const dir = new THREE.Vector3(Math.sin(desk.rot), 0, Math.cos(desk.rot));
    const target = new THREE.Vector3(desk.x, 1.25, desk.z);
    wanted.current = {
      target,
      pos: target.clone().add(dir.multiplyScalar(5.4)).add(new THREE.Vector3(0.8, 3.1, 0)),
    };
    until.current = performance.now() + 5200;
  }, [focus?.at, autoCamera, desks]);

  useFrame(() => {
    if (!controls.current) return;
    if (!autoCamera) return;
    if (performance.now() > until.current) {
      wanted.current = { pos: OVERVIEW.pos.clone(), target: OVERVIEW.target.clone() };
    }
    camera.position.lerp(wanted.current.pos, 0.035);
    controls.current.target.lerp(wanted.current.target, 0.045);
    controls.current.update();
  });
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
  return (
    <>
      {desks.map((desk) => (
        <Desk3D key={desk.id} desk={desk} agent={agents.find((a) => a.deskId === desk.id)} onSelect={select} />
      ))}
    </>
  );
}

export function Scene() {
  const controls = useRef<any>(null);
  return (
    <Canvas
      shadows={false}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 17.5, 27], fov: 38, near: 0.5, far: 180 }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.02;
        scene.fog = new THREE.Fog('#aab6c6', 58, 150);
      }}
    >
      <color attach="background" args={['#9fadbf']} />
      {/* daylight office: soft, even and bright — reads well on a 24/7 stream */}
      <ambientLight intensity={0.72} color="#eef3fb" />
      <hemisphereLight intensity={0.6} color="#ffffff" groundColor="#97a2b1" />
      <directionalLight position={[10, 18, 12]} intensity={0.95} color="#fff6ea" />
      <directionalLight position={[-12, 14, 6]} intensity={0.4} color="#cfe3ff" />
      <pointLight position={[0, 5.4, -10]} intensity={18} distance={34} color="#dceaff" />
      <pointLight position={[-14, 4.6, 4]} intensity={11} distance={26} color="#fff1dd" />
      <pointLight position={[14, 4.6, 4]} intensity={11} distance={26} color="#fff1dd" />
      <pointLight position={[0, 4.6, 8]} intensity={10} distance={24} color="#eaf4ff" />

      <Suspense fallback={null}>
        <Office />
        <Floor />
        <SignalBeam />
      </Suspense>

      <ScreenTicker />
      <CameraRig controls={controls} />
      <OrbitControls
        ref={controls}
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={46}
        maxPolarAngle={Math.PI / 2.12}
        target={[0, 1.6, -1]}
      />
      <AdaptiveDpr pixelated />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.32} luminanceThreshold={0.72} luminanceSmoothing={0.26} mipmapBlur radius={0.55} />
        <Vignette eskil={false} offset={0.32} darkness={0.42} />
      </EffectComposer>
    </Canvas>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Telão principal do escritório: a arte da marca Axe Capital e, no futuro,
 * os anúncios/patrocínios da transmissão.
 *
 * As artes vêm de `public/brand/playlist.json` — é só jogar novos arquivos
 * 16:9 na pasta `public/brand` e listá-los lá; o telão passa a rodar em
 * carrossel com crossfade. Se o arquivo não existir, cai na arte padrão.
 */

interface Slide {
  src: string;
  seconds: number;
}

const FALLBACK: Slide[] = [{ src: '/brand/axe-wall.jpg', seconds: 20 }];
const FADE = 1.1; // segundos de crossfade

export function BrandWall({
  position,
  size,
  rotY = 0,
}: {
  position: [number, number, number];
  size: [number, number];
  rotY?: number;
}) {
  const [slides, setSlides] = useState<Slide[]>(FALLBACK);
  const [textures, setTextures] = useState<THREE.Texture[]>([]);
  const [index, setIndex] = useState(0);
  const matA = useRef<THREE.MeshBasicMaterial>(null);
  const matB = useRef<THREE.MeshBasicMaterial>(null);
  const scan = useRef<THREE.Mesh>(null);
  const elapsed = useRef(0);
  const fading = useRef(0);
  const front = useRef<'A' | 'B'>('A');

  // playlist
  useEffect(() => {
    let alive = true;
    fetch('/brand/playlist.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.slides?.length) return;
        const clean: Slide[] = j.slides
          .filter((s: any) => typeof s?.src === 'string')
          .map((s: any) => ({ src: s.src, seconds: Math.max(4, Number(s.seconds) || 15) }));
        if (clean.length) setSlides(clean);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // carrega as texturas da playlist
  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    Promise.all(
      slides.map(
        (s) =>
          new Promise<THREE.Texture | null>((resolve) =>
            loader.load(
              s.src,
              (t) => {
                t.colorSpace = THREE.SRGBColorSpace;
                t.anisotropy = 8;
                resolve(t);
              },
              undefined,
              () => resolve(null),
            ),
          ),
      ),
    ).then((list) => {
      if (!alive) return;
      const ok = list.filter(Boolean) as THREE.Texture[];
      if (ok.length) setTextures(ok);
    });
    return () => {
      alive = false;
    };
  }, [slides]);

  // primeira textura entra sem fade
  useEffect(() => {
    if (!textures.length) return;
    if (matA.current) {
      matA.current.map = textures[0];
      matA.current.opacity = 1;
      matA.current.needsUpdate = true;
    }
    setIndex(0);
  }, [textures]);

  useFrame((state, dt) => {
    if (textures.length === 0) return;
    const cur = slides[index % slides.length] ?? FALLBACK[0];

    // troca de arte
    if (textures.length > 1) {
      elapsed.current += dt;
      if (elapsed.current > cur.seconds && fading.current <= 0) {
        const next = (index + 1) % textures.length;
        const incoming = front.current === 'A' ? matB.current : matA.current;
        if (incoming) {
          incoming.map = textures[next];
          incoming.opacity = 0;
          incoming.needsUpdate = true;
        }
        fading.current = FADE;
        elapsed.current = 0;
        setIndex(next);
      }
    }

    if (fading.current > 0) {
      fading.current = Math.max(0, fading.current - dt);
      const k = 1 - fading.current / FADE;
      const a = matA.current;
      const b = matB.current;
      if (a && b) {
        if (front.current === 'A') {
          a.opacity = 1 - k;
          b.opacity = k;
        } else {
          a.opacity = k;
          b.opacity = 1 - k;
        }
        if (fading.current === 0) front.current = front.current === 'A' ? 'B' : 'A';
      }
    }

    // varredura sutil de LED, para o telão não parecer um pôster colado
    if (scan.current) {
      const m = scan.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.05 + Math.sin(state.clock.elapsedTime * 0.6) * 0.025;
      scan.current.position.y = ((state.clock.elapsedTime * 0.35) % 1) * size[1] - size[1] / 2;
    }
  });

  const [w, h] = size;
  const glow = useMemo(() => new THREE.Color('#1aa37a'), []);

  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {/* carcaça do painel de LED */}
      <mesh position={[0, 0, -0.06]} castShadow>
        <boxGeometry args={[w + 0.16, h + 0.16, 0.14]} />
        <meshStandardMaterial color="#0e131a" roughness={0.45} metalness={0.5} />
      </mesh>

      {/* duas camadas para o crossfade */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial ref={matA} transparent opacity={1} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial ref={matB} transparent opacity={0} toneMapped={false} />
      </mesh>

      {/* faixa de varredura */}
      <mesh ref={scan} position={[0, 0, 0.03]}>
        <planeGeometry args={[w, h * 0.12]} />
        <meshBasicMaterial color="#9fd8ff" transparent opacity={0.05} toneMapped={false} />
      </mesh>

      {/* vidro + brilho da moldura */}
      <mesh position={[0, 0, 0.04]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#0b1118" transparent opacity={0.05} toneMapped={false} />
      </mesh>
      <mesh position={[0, -h / 2 - 0.12, 0.02]}>
        <planeGeometry args={[w * 0.96, 0.05]} />
        <meshBasicMaterial color={glow} transparent opacity={0.55} toneMapped={false} />
      </mesh>

      {/* a luz do telão lava a mesa logo abaixo */}
      <pointLight position={[0, -0.4, 1.4]} intensity={9} distance={11} color="#86f0c6" />
    </group>
  );
}

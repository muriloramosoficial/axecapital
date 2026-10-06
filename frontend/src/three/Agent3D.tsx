import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Agent } from '../types';
import { STATE_COLOR } from '../lib/format';

/**
 * Operador de mesa institucional — estilizado, mas com anatomia de gente:
 * pescoço, ombros arredondados, braços em dois segmentos (ombro + antebraço),
 * rosto com nariz/sobrancelhas/boca, piscar de olhos, respiração e fala.
 * Toda a animação é dirigida pelo estado/atividade que vem do engine.
 */

const SUITS = ['#28313f', '#343c48', '#1f2733', '#3c4552', '#2b3745', '#444a53'];
const TIES = ['#1e5f74', '#7c2d3a', '#2f6b4d', '#3b4a93', '#8a5a1f', '#52306b'];
const SHIRTS = ['#f4f7fb', '#e7eef8', '#d9e5f3', '#f6f1e7', '#dfe9f2'];
const HAIRCUTS = ['short', 'bun', 'long', 'buzz', 'curly'] as const;

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** material de pele com um leve brilho — evita o aspecto "plástico fosco" */
function Skin({ color }: { color: string }) {
  return <meshPhysicalMaterial color={color} roughness={0.52} clearcoat={0.22} clearcoatRoughness={0.6} sheen={0.3} sheenColor="#ffd9c2" />;
}

export function Agent3D({ agent, seat }: { agent: Agent; seat: [number, number, number] }) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const jaw = useRef<THREE.Mesh>(null);
  const lidL = useRef<THREE.Mesh>(null);
  const lidR = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const foreL = useRef<THREE.Group>(null);
  const foreR = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const phase = useRef(Math.random() * 10);
  const nextBlink = useRef(1 + Math.random() * 4);

  const skin = agent.avatar?.skin ?? '#d8a87f';
  const hair = agent.avatar?.hair ?? '#2b2420';
  const build = agent.avatar?.build ?? 1;
  const color = STATE_COLOR[agent.state] ?? '#64748b';

  const look = useMemo(() => {
    const h = hash(agent.id + (agent.name ?? ''));
    const cut = HAIRCUTS[(h >> 9) % HAIRCUTS.length];
    return {
      suit: SUITS[h % SUITS.length],
      tie: TIES[(h >> 3) % TIES.length],
      shirt: agent.avatar?.shirt ?? SHIRTS[(h >> 6) % SHIRTS.length],
      cut,
      headset: agent.role === 'TRADER' || agent.role === 'MARKET_SCOUT',
      glasses: (h >> 11) % 3 === 0,
      beard: (h >> 13) % 4 === 0 && cut !== 'bun',
      noTie: (h >> 15) % 5 === 0,
      watch: (h >> 17) % 2 === 0,
      height: 0.96 + ((h >> 19) % 9) / 100,
    };
  }, [agent.id, agent.name, agent.role, agent.avatar?.shirt]);

  useFrame((_, dt) => {
    phase.current += dt;
    const t = phase.current;
    const act = agent.activity;
    const busy = agent.state !== 'IDLE';
    const typing = act === 'TYPING' || agent.state === 'EXECUTING' || agent.state === 'SCANNING';

    if (torso.current) {
      const lean = typing ? 0.17 : act === 'WRITING' ? 0.25 : act === 'STRETCH' ? -0.12 : 0.06;
      const breathe = Math.sin(t * 1.5) * 0.013;
      torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, lean + breathe, 0.07);
      torso.current.rotation.z = THREE.MathUtils.lerp(torso.current.rotation.z, Math.sin(t * 0.6) * 0.02, 0.05);
      torso.current.position.y = THREE.MathUtils.lerp(torso.current.position.y, act === 'STRETCH' ? 0.09 : 0, 0.06);
      torso.current.scale.y = 1 + Math.sin(t * 1.5) * 0.008;
    }
    if (head.current) {
      const gaze = act === 'TALKING' ? Math.sin(t * 2.1) * 0.4 : act === 'WALKING' ? Math.sin(t) * 0.3 : Math.sin(t * 0.65) * 0.13;
      head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, gaze, 0.07);
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, act === 'WRITING' ? 0.33 : -0.04 + Math.sin(t * 0.9) * 0.02, 0.07);
      head.current.rotation.z = THREE.MathUtils.lerp(head.current.rotation.z, Math.sin(t * 0.43) * 0.04, 0.05);
    }
    // boca: abre e fecha quando o agente está falando
    if (jaw.current) {
      const talking = act === 'TALKING' || act === 'PHONE';
      const open = talking ? 0.5 + Math.abs(Math.sin(t * 9.5)) * 0.9 : 0.12;
      jaw.current.scale.y = THREE.MathUtils.lerp(jaw.current.scale.y, open, 0.35);
    }
    // piscada
    nextBlink.current -= dt;
    const blinking = nextBlink.current < 0;
    if (blinking && nextBlink.current < -0.12) nextBlink.current = 1.6 + Math.random() * 4.2;
    for (const lid of [lidL.current, lidR.current]) {
      if (lid) lid.scale.y = THREE.MathUtils.lerp(lid.scale.y, blinking ? 1 : 0.06, 0.5);
    }

    if (armL.current && armR.current && foreL.current && foreR.current) {
      const set = (up: THREE.Group, fore: THREE.Group, shoulder: number, elbow: number, k = 0.15) => {
        up.rotation.x = THREE.MathUtils.lerp(up.rotation.x, shoulder, k);
        fore.rotation.x = THREE.MathUtils.lerp(fore.rotation.x, elbow, k);
      };
      if (act === 'PHONE') {
        set(armR.current, foreR.current, -0.55, -2.0, 0.12);
        set(armL.current, foreL.current, -0.3, -0.9);
      } else if (act === 'COFFEE') {
        set(armR.current, foreR.current, -0.2, -1.5 + Math.sin(t * 1.1) * 0.3, 0.1);
        set(armL.current, foreL.current, -0.3, -0.85);
      } else if (act === 'POINTING') {
        set(armR.current, foreR.current, -1.0, -0.5, 0.16);
        set(armL.current, foreL.current, -0.3, -0.85);
      } else if (act === 'STRETCH') {
        set(armR.current, foreR.current, -2.5, -0.4, 0.07);
        set(armL.current, foreL.current, -2.5, -0.4, 0.07);
      } else {
        // mãos no teclado: ombro pouco aberto, cotovelo dobrado
        const wiggle = typing ? Math.sin(t * 12) * 0.07 : Math.sin(t * 1.5) * 0.015;
        set(armR.current, foreR.current, -0.42 + wiggle * 0.3, -0.95 + wiggle, 0.22);
        set(armL.current, foreL.current, -0.42 - wiggle * 0.3, -0.95 - wiggle, 0.22);
      }
    }

    if (halo.current) {
      const m = halo.current.material as THREE.MeshBasicMaterial;
      m.color.set(color);
      m.opacity = busy ? 0.5 + Math.sin(t * 4) * 0.2 : 0.18;
      halo.current.scale.setScalar(1 + (busy ? Math.sin(t * 4) * 0.04 : 0));
    }
    if (root.current) {
      root.current.position.y = seat[1] + (act === 'WALKING' ? Math.abs(Math.sin(t * 4)) * 0.05 : 0);
    }
  });

  const sh = look.height;

  return (
    <group ref={root} position={seat} scale={[1, sh, 1]}>
      {/* halo de estado no chão */}
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.56, 0]}>
        <ringGeometry args={[0.44, 0.58, 44]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>

      <group ref={torso}>
        {/* quadril / calça */}
        <mesh position={[0, -0.22, 0.02]} castShadow>
          <capsuleGeometry args={[0.21 * build, 0.16, 5, 14]} />
          <meshStandardMaterial color="#262d38" roughness={0.9} />
        </mesh>

        {/* camisa */}
        <mesh position={[0, 0.16, 0.015]}>
          <capsuleGeometry args={[0.2 * build, 0.33, 6, 18]} />
          <meshStandardMaterial color={look.shirt} roughness={0.66} />
        </mesh>
        {/* paletó: tronco + ombros arredondados */}
        <mesh position={[0, 0.15, -0.012]} castShadow>
          <capsuleGeometry args={[0.232 * build, 0.33, 6, 20]} />
          <meshStandardMaterial color={look.suit} roughness={0.72} metalness={0.05} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.228 * build, 0.3, 0]} castShadow>
            <sphereGeometry args={[0.105 * build, 16, 14]} />
            <meshStandardMaterial color={look.suit} roughness={0.72} metalness={0.05} />
          </mesh>
        ))}
        {/* abertura do paletó + lapelas */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.08 * build, 0.26, 0.19]} rotation={[0.1, s * -0.12, s * 0.4]}>
            <planeGeometry args={[0.085, 0.3]} />
            <meshStandardMaterial color={look.suit} roughness={0.55} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {/* gravata (ou gola aberta) */}
        {!look.noTie && (
          <>
            <mesh position={[0, 0.17, 0.198]} rotation={[0.07, 0, 0]}>
              <planeGeometry args={[0.052, 0.3]} />
              <meshStandardMaterial color={look.tie} roughness={0.5} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 0.35, 0.2]}>
              <boxGeometry args={[0.055, 0.05, 0.025]} />
              <meshStandardMaterial color={look.tie} roughness={0.45} />
            </mesh>
          </>
        )}
        {/* colarinho */}
        <mesh position={[0, 0.39, 0.02]}>
          <cylinderGeometry args={[0.1, 0.14, 0.08, 16]} />
          <meshStandardMaterial color={look.shirt} roughness={0.58} />
        </mesh>
        {/* lenço de bolso */}
        <mesh position={[-0.145 * build, 0.19, 0.185]} rotation={[0.08, 0, 0.1]}>
          <planeGeometry args={[0.05, 0.022]} />
          <meshStandardMaterial color={look.tie} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
        {/* crachá */}
        <mesh position={[0, 0.28, 0.175]} rotation={[0.1, 0, 0]}>
          <planeGeometry args={[0.17, 0.011]} />
          <meshStandardMaterial color="#1b2432" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0.05, 0.09, 0.2]} rotation={[0.12, 0, 0.07]}>
          <planeGeometry args={[0.09, 0.058]} />
          <meshStandardMaterial color="#fdfefe" emissive={color} emissiveIntensity={0.3} roughness={0.45} />
        </mesh>

        {/* pescoço */}
        <mesh position={[0, 0.44, 0.005]}>
          <cylinderGeometry args={[0.062, 0.072, 0.12, 14]} />
          <Skin color={skin} />
        </mesh>

        <group ref={head} position={[0, 0.58, 0]}>
          {/* crânio levemente achatado + mandíbula */}
          <mesh castShadow scale={[1, 1.08, 0.94]}>
            <sphereGeometry args={[0.132, 26, 22]} />
            <Skin color={skin} />
          </mesh>
          <mesh position={[0, -0.085, 0.015]} scale={[0.88, 0.7, 0.9]}>
            <sphereGeometry args={[0.115, 20, 16]} />
            <Skin color={skin} />
          </mesh>
          {/* orelhas */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.128, -0.008, -0.005]} scale={[0.6, 1, 0.8]}>
              <sphereGeometry args={[0.034, 10, 10]} />
              <Skin color={skin} />
            </mesh>
          ))}
          {/* nariz */}
          <mesh position={[0, -0.012, 0.122]} rotation={[0.35, 0, 0]}>
            <coneGeometry args={[0.026, 0.07, 10]} />
            <Skin color={skin} />
          </mesh>
          {/* sobrancelhas */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.05, 0.055, 0.112]} rotation={[0, 0, s * 0.1]}>
              <boxGeometry args={[0.045, 0.011, 0.012]} />
              <meshStandardMaterial color={hair} roughness={0.9} />
            </mesh>
          ))}
          {/* olhos: esclera + íris + pálpebra animada */}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.05, 0.012, 0.104]}>
              <mesh scale={[1, 0.8, 0.6]}>
                <sphereGeometry args={[0.024, 14, 12]} />
                <meshStandardMaterial color="#f6f8fb" roughness={0.25} />
              </mesh>
              <mesh position={[0, 0, 0.014]}>
                <sphereGeometry args={[0.0105, 12, 12]} />
                <meshStandardMaterial color="#1b2430" roughness={0.2} />
              </mesh>
              <mesh ref={s === -1 ? lidL : lidR} position={[0, 0.004, 0.018]} scale={[1, 0.06, 1]}>
                <planeGeometry args={[0.052, 0.04]} />
                <meshStandardMaterial color={skin} roughness={0.6} />
              </mesh>
            </group>
          ))}
          {/* boca */}
          <mesh ref={jaw} position={[0, -0.062, 0.108]} scale={[1, 0.12, 1]}>
            <sphereGeometry args={[0.028, 14, 10]} />
            <meshStandardMaterial color="#8d4a4a" roughness={0.6} />
          </mesh>
          {look.beard && (
            <mesh position={[0, -0.062, 0.062]} scale={[1, 0.85, 0.75]}>
              <sphereGeometry args={[0.1, 18, 14, 0, Math.PI * 2, Math.PI / 2.1, Math.PI / 2]} />
              <meshStandardMaterial color={hair} roughness={0.95} />
            </mesh>
          )}

          {/* cabelo */}
          {look.cut !== 'buzz' && (
            <mesh position={[0, 0.03, -0.004]} scale={[1.03, 1.06, 1.02]}>
              <sphereGeometry args={[0.134, 24, 18, 0, Math.PI * 2, 0, Math.PI / 1.85]} />
              <meshStandardMaterial color={hair} roughness={0.95} />
            </mesh>
          )}
          {look.cut === 'buzz' && (
            <mesh position={[0, 0.03, -0.004]} scale={[1.01, 1.02, 1.01]}>
              <sphereGeometry args={[0.133, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
              <meshStandardMaterial color={hair} roughness={1} />
            </mesh>
          )}
          {look.cut === 'long' && (
            <mesh position={[0, -0.06, -0.06]} scale={[1.05, 1, 0.8]}>
              <capsuleGeometry args={[0.105, 0.17, 5, 14]} />
              <meshStandardMaterial color={hair} roughness={0.95} />
            </mesh>
          )}
          {look.cut === 'bun' && (
            <mesh position={[0, 0.045, -0.13]}>
              <sphereGeometry args={[0.055, 14, 12]} />
              <meshStandardMaterial color={hair} roughness={0.95} />
            </mesh>
          )}
          {look.cut === 'curly' &&
            Array.from({ length: 10 }).map((_, i) => {
              const a = (i / 10) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(a) * 0.11, 0.075 + Math.sin(i * 1.7) * 0.02, Math.sin(a) * 0.1 - 0.01]}>
                  <sphereGeometry args={[0.045, 10, 10]} />
                  <meshStandardMaterial color={hair} roughness={0.98} />
                </mesh>
              );
            })}

          {look.glasses && (
            <group position={[0, 0.012, 0.118]}>
              {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 0.05, 0, 0]} rotation={[0.08, 0, 0]}>
                  <torusGeometry args={[0.034, 0.0045, 8, 20]} />
                  <meshStandardMaterial color="#2b3440" metalness={0.7} roughness={0.25} />
                </mesh>
              ))}
              <mesh>
                <boxGeometry args={[0.035, 0.0045, 0.0045]} />
                <meshStandardMaterial color="#2b3440" metalness={0.7} roughness={0.25} />
              </mesh>
              {[-1, 1].map((s) => (
                <mesh key={`t${s}`} position={[s * 0.082, 0, -0.045]} rotation={[0, s * 0.5, 0]}>
                  <boxGeometry args={[0.075, 0.004, 0.004]} />
                  <meshStandardMaterial color="#2b3440" metalness={0.7} roughness={0.25} />
                </mesh>
              ))}
            </group>
          )}
          {look.headset && (
            <group>
              <mesh position={[0, 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
                <torusGeometry args={[0.142, 0.009, 8, 24, Math.PI]} />
                <meshStandardMaterial color="#1f262f" roughness={0.45} metalness={0.3} />
              </mesh>
              {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 0.142, -0.005, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.036, 0.036, 0.028, 16]} />
                  <meshStandardMaterial color="#1f262f" roughness={0.45} metalness={0.3} />
                </mesh>
              ))}
              <mesh position={[-0.105, -0.055, 0.07]} rotation={[0, 0.45, 0.55]}>
                <capsuleGeometry args={[0.006, 0.1, 4, 8]} />
                <meshStandardMaterial color="#1f262f" roughness={0.45} />
              </mesh>
              <mesh position={[-0.055, -0.08, 0.108]}>
                <sphereGeometry args={[0.013, 10, 10]} />
                <meshStandardMaterial color="#111820" roughness={0.4} />
              </mesh>
            </group>
          )}
          {/* luz azulada dos monitores batendo no rosto */}
          <mesh position={[0, -0.01, 0.126]}>
            <planeGeometry args={[0.21, 0.16]} />
            <meshBasicMaterial color="#cfe6ff" transparent opacity={0.08} />
          </mesh>
        </group>

        {/* braços em dois segmentos */}
        {([['L', armL, foreL, -1], ['R', armR, foreR, 1]] as const).map(([key, up, fore, s]) => (
          <group key={key} ref={up} position={[s * 0.24 * build, 0.3, 0]}>
            {/* braço */}
            <mesh position={[0, -0.13, 0.015]} castShadow>
              <capsuleGeometry args={[0.062, 0.2, 5, 12]} />
              <meshStandardMaterial color={look.suit} roughness={0.76} />
            </mesh>
            {/* cotovelo */}
            <mesh position={[0, -0.25, 0.02]}>
              <sphereGeometry args={[0.062, 12, 10]} />
              <meshStandardMaterial color={look.suit} roughness={0.76} />
            </mesh>
            {/* antebraço + mão */}
            <group ref={fore} position={[0, -0.25, 0.02]}>
              <mesh position={[0, -0.02, 0.15]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <capsuleGeometry args={[0.055, 0.22, 5, 12]} />
                <meshStandardMaterial color={look.suit} roughness={0.76} />
              </mesh>
              <mesh position={[0, -0.02, 0.275]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.035, 12]} />
                <meshStandardMaterial color={look.shirt} roughness={0.6} />
              </mesh>
              {look.watch && s === -1 && (
                <mesh position={[0, -0.02, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.049, 0.049, 0.018, 14]} />
                  <meshStandardMaterial color="#c9ccd2" metalness={0.85} roughness={0.25} />
                </mesh>
              )}
              {/* mão */}
              <mesh position={[0, -0.025, 0.345]} scale={[1, 0.72, 1.25]} castShadow>
                <sphereGeometry args={[0.05, 14, 12]} />
                <Skin color={skin} />
              </mesh>
              {/* dedos */}
              {[-1, 0, 1].map((f) => (
                <mesh key={f} position={[f * 0.022, -0.03, 0.4]} rotation={[0.5, 0, 0]}>
                  <capsuleGeometry args={[0.009, 0.03, 3, 6]} />
                  <Skin color={skin} />
                </mesh>
              ))}
            </group>
          </group>
        ))}
      </group>

      {/* pernas sob a mesa */}
      <mesh position={[0, -0.4, 0.2]} rotation={[-1.3, 0, 0]}>
        <capsuleGeometry args={[0.1 * build, 0.34, 5, 12]} />
        <meshStandardMaterial color="#262d38" roughness={0.92} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.1, -0.52, 0.34]} rotation={[-0.3, 0, 0]}>
            <capsuleGeometry args={[0.062, 0.26, 5, 10]} />
            <meshStandardMaterial color="#262d38" roughness={0.92} />
          </mesh>
          <mesh position={[s * 0.1, -0.66, 0.46]} rotation={[-0.12, 0, 0]}>
            <boxGeometry args={[0.115, 0.07, 0.25]} />
            <meshStandardMaterial color="#12161d" roughness={0.45} metalness={0.15} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

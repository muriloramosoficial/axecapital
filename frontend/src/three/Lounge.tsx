import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from './SceneText';
import { getScreen } from './screens';
import { Agent3D, type AgentPose } from './Agent3D';
import type { Agent } from '../types';

/**
 * Sala de descanso da Axe Capital.
 *
 * Canto direito do fundo, atrás de um vidro: sofá em L, TV, copa/cozinha com
 * bancada, geladeira, cafeteira e micro-ondas, mesa de refeição e uma mesa de
 * sinuca. É para onde o agente vai quando o mercado do ativo dele está
 * fechado — ninguém fica olhando gráfico parado.
 */

// caixa da sala (coerente com as paredes do escritório: x até 23, z até 21)
export const LOUNGE = { x0: 15.4, x1: 22.6, z0: 12.4, z1: 20.6 };
const CX = (LOUNGE.x0 + LOUNGE.x1) / 2;
const CZ = (LOUNGE.z0 + LOUNGE.z1) / 2;

/** Lugares onde os agentes descansam, em ordem de preferência. */
export const LOUNGE_SPOTS: { pos: [number, number, number]; facing: number; pose: AgentPose }[] = [
  // sofá grande (encosto no fundo, de frente para a TV)
  { pos: [CX - 2.1, 0.74, CZ + 3.0], facing: Math.PI, pose: 'couch' },
  { pos: [CX - 1.3, 0.74, CZ + 3.0], facing: Math.PI, pose: 'couch' },
  { pos: [CX - 0.5, 0.74, CZ + 3.0], facing: Math.PI, pose: 'couch' },
  // sofá menor, lateral
  { pos: [CX - 3.0, 0.74, CZ + 1.6], facing: -Math.PI / 2, pose: 'couch' },
  { pos: [CX - 3.0, 0.74, CZ + 1.0], facing: -Math.PI / 2, pose: 'couch' },
  // mesa de sinuca: um de cada lado, em pé
  { pos: [CX + 1.4, 0.82, CZ + 1.1], facing: Math.PI, pose: 'stand' },
  { pos: [CX + 2.1, 0.82, CZ - 0.7], facing: 0, pose: 'stand' },
  // copa: em pé, perto da cafeteira
  { pos: [CX + 0.6, 0.82, LOUNGE.z1 - 1.35], facing: Math.PI, pose: 'stand' },
  // mesa de refeição (duas cadeiras)
  { pos: [CX - 2.65, 0.74, CZ - 3.05], facing: 0, pose: 'couch' },
  { pos: [CX - 1.35, 0.74, CZ - 1.35], facing: Math.PI, pose: 'couch' },
  // em pé, conversando junto ao vidro
  { pos: [LOUNGE.x0 + 1.1, 0.82, CZ - 2.6], facing: 1.2, pose: 'stand' },
];

function Sofa({ position, rotation = 0, length = 2.6 }: { position: [number, number, number]; rotation?: number; length?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* base */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[length, 0.26, 0.95]} />
        <meshStandardMaterial color="#2f3a46" roughness={0.95} />
      </mesh>
      {/* almofadas do assento */}
      {Array.from({ length: Math.max(2, Math.round(length / 0.9)) }).map((_, i, arr) => {
        const w = length / arr.length - 0.06;
        return (
          <mesh key={i} position={[(i - (arr.length - 1) / 2) * (length / arr.length), 0.42, 0.02]}>
            <boxGeometry args={[w, 0.16, 0.8]} />
            <meshStandardMaterial color="#3b4857" roughness={0.98} />
          </mesh>
        );
      })}
      {/* encosto */}
      <mesh position={[0, 0.58, -0.42]} rotation={[-0.1, 0, 0]}>
        <boxGeometry args={[length, 0.55, 0.2]} />
        <meshStandardMaterial color="#374453" roughness={0.98} />
      </mesh>
      {/* braços */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * length) / 2 - s * 0.1, 0.46, 0]}>
          <boxGeometry args={[0.2, 0.3, 0.95]} />
          <meshStandardMaterial color="#2f3a46" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function PoolTable({ position }: { position: [number, number, number] }) {
  const balls = useMemo(
    () =>
      Array.from({ length: 9 }).map((_, i) => ({
        x: (Math.random() - 0.5) * 1.5,
        z: (Math.random() - 0.5) * 0.9,
        c: ['#d9b23a', '#2f5fd0', '#b8332f', '#5a3b8a', '#d4752a', '#2e7d4f', '#8a2f3b', '#1b1f26', '#f3f4f6'][i],
      })),
    [],
  );
  return (
    <group position={position}>
      {/* pano */}
      <mesh position={[0, 0.78, 0]}>
        <boxGeometry args={[2.3, 0.08, 1.25]} />
        <meshStandardMaterial color="#1f7a52" roughness={1} />
      </mesh>
      {/* tabelas */}
      {[
        [0, 0.84, 0.66, 2.46, 0.12, 0.14],
        [0, 0.84, -0.66, 2.46, 0.12, 0.14],
        [1.2, 0.84, 0, 0.14, 0.12, 1.45],
        [-1.2, 0.84, 0, 0.14, 0.12, 1.45],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#5a3a24" roughness={0.6} />
        </mesh>
      ))}
      {/* corpo e pés */}
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[2.3, 0.3, 1.25]} />
        <meshStandardMaterial color="#4a3020" roughness={0.7} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.95, 0.23, sz * 0.48]}>
            <boxGeometry args={[0.18, 0.46, 0.18]} />
            <meshStandardMaterial color="#3d281a" roughness={0.75} />
          </mesh>
        )),
      )}
      {/* bolas */}
      {balls.map((b, i) => (
        <mesh key={i} position={[b.x, 0.85, b.z]}>
          <sphereGeometry args={[0.045, 14, 12]} />
          <meshStandardMaterial color={b.c} roughness={0.22} metalness={0.05} />
        </mesh>
      ))}
      {/* taco apoiado */}
      <mesh position={[1.35, 0.72, 0.4]} rotation={[0, 0.2, -1.15]}>
        <cylinderGeometry args={[0.018, 0.026, 1.45, 8]} />
        <meshStandardMaterial color="#c8a06a" roughness={0.5} />
      </mesh>
    </group>
  );
}

function Kitchen({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* bancada */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[3.4, 0.9, 0.64]} />
        <meshStandardMaterial color="#e6e9ee" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <boxGeometry args={[3.5, 0.06, 0.7]} />
        <meshStandardMaterial color="#2f3642" roughness={0.35} metalness={0.25} />
      </mesh>
      {/* armários superiores */}
      <mesh position={[0, 1.95, -0.16]}>
        <boxGeometry args={[3.4, 0.7, 0.36]} />
        <meshStandardMaterial color="#cfd6de" roughness={0.65} />
      </mesh>
      {/* pia */}
      <mesh position={[-1.1, 0.94, 0]}>
        <boxGeometry args={[0.55, 0.04, 0.42]} />
        <meshStandardMaterial color="#aab2bb" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[-1.1, 1.08, -0.16]}>
        <cylinderGeometry args={[0.022, 0.022, 0.26, 8]} />
        <meshStandardMaterial color="#c3cad2" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* cafeteira */}
      <group position={[0.35, 1.08, 0]}>
        <mesh>
          <boxGeometry args={[0.26, 0.3, 0.26]} />
          <meshStandardMaterial color="#1c232c" roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.02, 0.14]}>
          <planeGeometry args={[0.1, 0.06]} />
          <meshBasicMaterial color="#f0a04a" toneMapped={false} />
        </mesh>
      </group>
      {/* micro-ondas */}
      <mesh position={[1.25, 1.1, 0]}>
        <boxGeometry args={[0.6, 0.34, 0.42]} />
        <meshStandardMaterial color="#3a424d" roughness={0.45} metalness={0.3} />
      </mesh>
      {/* canecas */}
      {[-0.3, -0.12, 0.05].map((x) => (
        <mesh key={x} position={[x, 1.0, 0.16]}>
          <cylinderGeometry args={[0.045, 0.04, 0.1, 12]} />
          <meshStandardMaterial color="#f5f7fa" roughness={0.5} />
        </mesh>
      ))}
      {/* geladeira */}
      <group position={[2.3, 0, 0]}>
        <mesh position={[0, 0.95, 0]}>
          <boxGeometry args={[0.8, 1.9, 0.72]} />
          <meshStandardMaterial color="#b9c1ca" metalness={0.65} roughness={0.32} />
        </mesh>
        <mesh position={[0, 1.2, 0.37]}>
          <boxGeometry args={[0.04, 0.5, 0.03]} />
          <meshStandardMaterial color="#8b939c" metalness={0.8} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

function DiningSet({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[1.9, 0.07, 1.0]} />
        <meshStandardMaterial color="#cbb591" roughness={0.6} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.8, 0.35, sz * 0.4]}>
            <cylinderGeometry args={[0.035, 0.035, 0.7, 8]} />
            <meshStandardMaterial color="#8e9199" metalness={0.6} roughness={0.4} />
          </mesh>
        )),
      )}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.65, 0, s * 0.85]} rotation={[0, s > 0 ? Math.PI : 0, 0]}>
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[0.44, 0.06, 0.44]} />
            <meshStandardMaterial color="#49525e" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.72, 0.2]}>
            <boxGeometry args={[0.44, 0.5, 0.06]} />
            <meshStandardMaterial color="#49525e" roughness={0.85} />
          </mesh>
          {[-1, 1].flatMap((ax) =>
            [-1, 1].map((az) => (
              <mesh key={`${ax}${az}`} position={[ax * 0.18, 0.22, az * 0.18]}>
                <cylinderGeometry args={[0.022, 0.022, 0.44, 6]} />
                <meshStandardMaterial color="#6f7782" metalness={0.5} roughness={0.5} />
              </mesh>
            )),
          )}
        </group>
      ))}
    </group>
  );
}

function LoungePlant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.28, 0.22, 0.56, 14]} />
        <meshStandardMaterial color="#d8dde3" roughness={0.8} />
      </mesh>
      {Array.from({ length: 9 }).map((_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.2, 0.95, Math.sin(a) * 0.2]} rotation={[Math.cos(a) * 0.55, a, Math.sin(a) * 0.55]}>
            <coneGeometry args={[0.14, 0.95, 6]} />
            <meshStandardMaterial color="#2f7a52" roughness={0.85} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Estrutura da sala: piso, vidros, TV, móveis e letreiro. */
export function LoungeRoom() {
  const tv = useMemo(() => getScreen('NEWSPAGE'), []);
  const tvLight = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (tvLight.current) tvLight.current.intensity = 5 + Math.sin(clock.elapsedTime * 1.7) * 0.8;
  });

  const w = LOUNGE.x1 - LOUNGE.x0;
  const d = LOUNGE.z1 - LOUNGE.z0;

  return (
    <group>
      {/* piso de madeira */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX, 0.035, CZ]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#8a6a4b" roughness={0.9} />
      </mesh>
      {/* tapete */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX - 1.4, 0.05, CZ + 1.6]}>
        <planeGeometry args={[3.6, 2.6]} />
        <meshStandardMaterial color="#5c6675" roughness={1} />
      </mesh>

      {/* divisória de vidro: lado do pregão (x = x0) e frente (z = z0) */}
      <mesh position={[LOUNGE.x0, 1.7, CZ]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[d, 3.4, 0.06]} />
        <meshPhysicalMaterial color="#dbeafe" transparent opacity={0.15} roughness={0.04} transmission={0.86} />
      </mesh>
      <mesh position={[CX + 1.4, 1.7, LOUNGE.z0]}>
        <boxGeometry args={[w - 2.8, 3.4, 0.06]} />
        <meshPhysicalMaterial color="#dbeafe" transparent opacity={0.15} roughness={0.04} transmission={0.86} />
      </mesh>
      {/* montantes + verga */}
      {[LOUNGE.z0 + 0.1, CZ, LOUNGE.z1 - 0.1].map((z) => (
        <mesh key={z} position={[LOUNGE.x0, 1.7, z]}>
          <boxGeometry args={[0.1, 3.4, 0.1]} />
          <meshStandardMaterial color="#9aa3ae" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[LOUNGE.x0, 3.44, CZ]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[d, 0.14, 0.16]} />
        <meshStandardMaterial color="#aab2bc" metalness={0.75} roughness={0.32} />
      </mesh>

      {/* letreiro */}
      <Text
        position={[LOUNGE.x0 - 0.1, 3.9, CZ]}
        rotation={[0, -Math.PI / 2, 0]}
        fontSize={0.3}
        letterSpacing={0.28}
        color="#f0b35e"
        anchorX="center"
        bold
      >
        LOUNGE · DESCANSO
      </Text>
      <Text
        position={[LOUNGE.x0 - 0.1, 3.5, CZ]}
        rotation={[0, -Math.PI / 2, 0]}
        fontSize={0.17}
        letterSpacing={0.22}
        color="#8c98a6"
        anchorX="center"
      >
        MERCADO FECHADO · AGENTES FORA DE TURNO
      </Text>

      {/* TV na parede do fundo */}
      <group position={[CX - 1.4, 2.3, LOUNGE.z1 - 0.12]} rotation={[0, Math.PI, 0]}>
        <mesh>
          <boxGeometry args={[2.3, 1.34, 0.08]} />
          <meshStandardMaterial color="#12171e" roughness={0.4} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={[2.18, 1.22]} />
          <meshStandardMaterial map={tv} emissiveMap={tv} emissive="#ffffff" emissiveIntensity={0.8} toneMapped={false} />
        </mesh>
      </group>
      <pointLight ref={tvLight} position={[CX - 1.4, 2.3, LOUNGE.z1 - 1.2]} intensity={5} distance={7} color="#9fd0ff" />

      {/* móveis */}
      <Sofa position={[CX - 1.3, 0, CZ + 3.1]} rotation={Math.PI} length={2.8} />
      <Sofa position={[CX - 3.1, 0, CZ + 1.4]} rotation={Math.PI / 2} length={1.6} />
      <mesh position={[CX - 1.4, 0.36, CZ + 1.7]}>
        <boxGeometry args={[1.3, 0.1, 0.7]} />
        <meshStandardMaterial color="#3a3026" roughness={0.6} />
      </mesh>
      {[-0.4, 0.3].map((x) => (
        <mesh key={x} position={[CX - 1.4 + x, 0.47, CZ + 1.7]}>
          <cylinderGeometry args={[0.05, 0.045, 0.12, 12]} />
          <meshStandardMaterial color="#f5f7fa" roughness={0.5} />
        </mesh>
      ))}

      <PoolTable position={[CX + 1.6, 0, CZ + 0.2]} />
      <Kitchen position={[CX + 0.4, 0, LOUNGE.z1 - 0.45]} />
      <DiningSet position={[CX - 2.0, 0, CZ - 2.2]} />
      <LoungePlant position={[LOUNGE.x1 - 0.7, 0, LOUNGE.z0 + 0.8]} />
      <LoungePlant position={[LOUNGE.x0 + 0.6, 0, LOUNGE.z1 - 0.8]} />

      {/* luminária pendente sobre a sinuca */}
      <mesh position={[CX + 1.6, 2.5, CZ + 0.2]}>
        <cylinderGeometry args={[0.5, 0.62, 0.22, 18]} />
        <meshStandardMaterial color="#2b3440" roughness={0.6} metalness={0.3} />
      </mesh>
      <pointLight position={[CX + 1.6, 2.2, CZ + 0.2]} intensity={7} distance={6} color="#ffe9c4" />
    </group>
  );
}

/** Agentes fora de turno, distribuídos pelos lugares da sala. */
export function LoungeAgents({ agents }: { agents: Agent[] }) {
  return (
    <group>
      {agents.slice(0, LOUNGE_SPOTS.length).map((agent, i) => {
        const spot = LOUNGE_SPOTS[i];
        return <Agent3D key={agent.id} agent={agent} seat={spot.pos} pose={spot.pose} facing={spot.facing} />;
      })}
    </group>
  );
}

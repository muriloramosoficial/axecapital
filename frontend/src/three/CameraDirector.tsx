import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/store';
import type { Agent, Desk } from '../types';

/**
 * Direção de câmera de transmissão.
 *
 * Funciona como um switcher de TV: existe um ROTEIRO fixo (abertura ampla por
 * trás do pregão → mesas → telão → travelling pelo chão → research lab → …) que
 * se repete com variações, e o engine pode INTERROMPER o roteiro quando algo
 * importante acontece (oportunidade, aprovação, execução, stop).
 *
 * Duas regras evitam os artefatos que apareciam antes:
 *  1. CORTE SECO — a câmera nunca interpola de um plano para o outro; ela é
 *     reposicionada e um flash curto disfarça o corte. Assim ela nunca
 *     atravessa parede/mesa (era isso que gerava as "barras cinzas" na tela).
 *  2. CONTENÇÃO — todo plano interno é limitado à caixa da sala, com margem das
 *     paredes; só os planos de abertura ficam fora, acima do pé-direito, onde a
 *     sala é vista como uma maquete aberta.
 */

export const OVERVIEW = {
  pos: new THREE.Vector3(0, 17.5, 27),
  target: new THREE.Vector3(0, 1.6, -1),
};

/** Caixa útil da sala (paredes em ±23 / -15 / +21, pé-direito 6.2). */
const ROOM = { minX: -20.5, maxX: 20.5, minZ: -13.2, maxZ: 19, minY: 0.9, maxY: 5.6 };

type ShotKind =
  | 'ESTABLISH'
  | 'CRANE'
  | 'PUSH_IN'
  | 'ORBIT'
  | 'OVER_SHOULDER'
  | 'WALL_SWEEP'
  | 'BRAND'
  | 'FLOOR_GLIDE'
  | 'LAB'
  | 'CLOSE_UP';

interface Shot {
  kind: ShotKind;
  label: string;
  agentId?: string;
  reason: string;
  /** plano externo (maquete) — não sofre contenção */
  exterior?: boolean;
  start: { pos: THREE.Vector3; target: THREE.Vector3 };
  end: { pos: THREE.Vector3; target: THREE.Vector3 };
  orbit?: { center: THREE.Vector3; radius: number; from: number; to: number; height: number };
  duration: number;
  startedAt: number;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function clampInside(p: THREE.Vector3) {
  p.x = THREE.MathUtils.clamp(p.x, ROOM.minX, ROOM.maxX);
  p.y = THREE.MathUtils.clamp(p.y, ROOM.minY, ROOM.maxY);
  p.z = THREE.MathUtils.clamp(p.z, ROOM.minZ, ROOM.maxZ);
  return p;
}

/** Empurra a câmera para fora de qualquer mesa (raio ~1.6m) para não entrar no móvel. */
function avoidDesks(p: THREE.Vector3, desks: Desk[], exclude?: string) {
  for (const d of desks) {
    if (d.id === exclude) continue;
    const dx = p.x - d.x;
    const dz = p.z - d.z;
    const dist = Math.hypot(dx, dz);
    const min = Math.max(d.width, d.depth) * 0.6 + 0.55;
    if (dist < min && dist > 0.001) {
      p.x = d.x + (dx / dist) * min;
      p.z = d.z + (dz / dist) * min;
    }
  }
  return p;
}

function deskFront(desk: Desk, distance: number, height: number) {
  const dir = new THREE.Vector3(Math.sin(desk.rot), 0, Math.cos(desk.rot)).normalize();
  const seat = new THREE.Vector3(desk.x, 0, desk.z).add(dir.clone().multiplyScalar(0.8));
  return seat.clone().add(dir.clone().multiplyScalar(distance)).setY(height);
}

function deskHead(desk: Desk) {
  const dir = new THREE.Vector3(Math.sin(desk.rot), 0, Math.cos(desk.rot)).normalize();
  return new THREE.Vector3(desk.x, 1.5, desk.z).add(dir.clone().multiplyScalar(0.7));
}

/** Quanto este agente "merece" aparecer agora. */
function interest(agent: Agent | undefined, lastSeen: number) {
  if (!agent) return 0;
  let score = 1;
  if (agent.openSymbol) score += 6;
  if (Math.abs(agent.openPnl ?? 0) > 5) score += 3;
  if (agent.state === 'EXECUTING') score += 9;
  if (agent.state === 'ALERT' || agent.state === 'APPROVED' || agent.state === 'REJECTED') score += 6;
  if (agent.state === 'ANALYZING' || agent.state === 'SCANNING') score += 2;
  if ((agent.daily?.trades ?? 0) > 0) score += 2;
  score += Math.min(8, (Date.now() - lastSeen) / 12000);
  return score;
}

/** Roteiro base da live: a cada volta a câmera passa por tudo que importa. */
type Beat = 'OPEN' | 'AGENT' | 'WALL' | 'BRAND' | 'GLIDE' | 'LAB';
const RUNDOWN: Beat[] = ['OPEN', 'AGENT', 'BRAND', 'AGENT', 'GLIDE', 'AGENT', 'WALL', 'AGENT', 'LAB', 'AGENT'];

export function CameraDirector({ controls }: { controls: React.MutableRefObject<any> }) {
  const { camera } = useThree();
  const shot = useRef<Shot | null>(null);
  const beat = useRef(0);
  const lastSeen = useRef<Record<string, number>>({});
  const manualUntil = useRef(0);
  const noise = useRef(Math.random() * 100);
  const lastFocusAt = useRef(0);

  // ── usuário mexeu na câmera → devolve o controle por 25s ────────────────
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const onStart = () => {
      manualUntil.current = performance.now() + 25000;
      shot.current = null;
    };
    c.addEventListener('start', onStart);
    return () => c.removeEventListener('start', onStart);
  }, [controls.current]);

  /** Corte seco: posiciona a câmera no início do plano e pisca o flash. */
  const cut = (next: Shot) => {
    shot.current = next;
    const st = useStore.getState();
    if (next.agentId) {
      lastSeen.current[next.agentId] = Date.now();
      st.setSpotlight({ agentId: next.agentId, shot: next.label, reason: next.reason });
    } else {
      st.setSpotlight(null);
    }
    st.markCameraCut();
    const ctrl = controls.current;
    const pos = next.orbit
      ? new THREE.Vector3(
          next.orbit.center.x + Math.sin(next.orbit.from) * next.orbit.radius,
          next.orbit.height,
          next.orbit.center.z + Math.cos(next.orbit.from) * next.orbit.radius,
        )
      : next.start.pos.clone();
    camera.position.copy(pos);
    if (ctrl) {
      ctrl.target.copy(next.orbit ? next.orbit.center : next.start.target);
      ctrl.update();
    }
  };

  const buildDeskShot = (desk: Desk, agent: Agent | undefined, kind: ShotKind, reason: string): Shot => {
    const head = deskHead(desk);
    const now = performance.now();
    const desks = useStore.getState().desks;
    const place = (v: THREE.Vector3) => avoidDesks(clampInside(v), desks, desk.id);

    if (kind === 'ORBIT') {
      const base = Math.atan2(camera.position.x - desk.x, camera.position.z - desk.z);
      const dirSign = Math.random() > 0.5 ? 1 : -1;
      return {
        kind,
        label: 'ORBIT',
        agentId: agent?.id,
        reason,
        orbit: { center: head.clone(), radius: 3.6, from: base, to: base + dirSign * 0.9, height: 2.2 },
        start: { pos: camera.position.clone(), target: head.clone() },
        end: { pos: camera.position.clone(), target: head.clone() },
        duration: 9000,
        startedAt: now,
      };
    }
    if (kind === 'OVER_SHOULDER') {
      const behind = deskFront(desk, 2.4, 2.05);
      return {
        kind,
        label: 'OVER THE SHOULDER',
        agentId: agent?.id,
        reason,
        start: { pos: place(behind.clone().add(new THREE.Vector3(0.85, 0.45, 0))), target: head.clone() },
        end: { pos: place(behind.clone().add(new THREE.Vector3(0.5, 0.1, 0))), target: head.clone().setY(1.34) },
        duration: 7500,
        startedAt: now,
      };
    }
    if (kind === 'CLOSE_UP') {
      return {
        kind,
        label: 'CLOSE UP',
        agentId: agent?.id,
        reason,
        start: { pos: place(deskFront(desk, 3.2, 1.95)), target: head.clone() },
        end: { pos: place(deskFront(desk, 2.0, 1.72)), target: head.clone().setY(1.44) },
        duration: 6500,
        startedAt: now,
      };
    }
    return {
      kind: 'PUSH_IN',
      label: 'PUSH IN',
      agentId: agent?.id,
      reason,
      start: { pos: place(deskFront(desk, 7.4, 3.9)), target: head.clone() },
      end: { pos: place(deskFront(desk, 3.1, 2.0)), target: head.clone() },
      duration: 8500,
      startedAt: now,
    };
  };

  const buildAgentShot = (): Shot | null => {
    const { desks, agents } = useStore.getState();
    const staffed = desks
      .map((d) => ({ desk: d, agent: agents.find((a) => a.deskId === d.id) }))
      .filter((x) => !!x.agent);
    if (!staffed.length) return null;
    const ranked = staffed
      .map((x) => ({ ...x, score: interest(x.agent, lastSeen.current[x.agent!.id] ?? 0) }))
      .sort((a, b) => b.score - a.score);
    const chosen = rand(ranked.slice(0, Math.min(4, ranked.length)));
    const agent = chosen.agent!;
    const kinds: ShotKind[] = agent.openSymbol
      ? ['PUSH_IN', 'ORBIT', 'OVER_SHOULDER', 'CLOSE_UP']
      : ['PUSH_IN', 'ORBIT', 'OVER_SHOULDER'];
    const reason = agent.openSymbol
      ? `posição aberta em ${agent.openSymbol}`
      : agent.state !== 'IDLE'
        ? agent.statusLine ?? agent.state
        : 'acompanhando o mercado';
    return buildDeskShot(chosen.desk, agent, rand(kinds), reason);
  };

  /** Planos de cenário — cada beat tem a sua geometria própria. */
  const buildBeatShot = (b: Beat): Shot => {
    const now = performance.now();
    switch (b) {
      case 'OPEN': {
        // abertura: maquete vista de trás/acima do pregão, descendo devagar
        const side = Math.random() > 0.5 ? 1 : -1;
        return {
          kind: 'ESTABLISH',
          label: 'AXE CAPITAL',
          reason: 'abertura — visão geral do pregão',
          exterior: true,
          start: { pos: new THREE.Vector3(9 * side, 19.5, 31), target: new THREE.Vector3(0, 2.2, -2) },
          end: { pos: new THREE.Vector3(3 * side, 13.5, 24), target: new THREE.Vector3(0, 2.0, -5) },
          duration: 13000,
          startedAt: now,
        };
      }
      case 'BRAND':
        // telão central: entra baixo e sobe até a arte da marca
        return {
          kind: 'BRAND',
          label: 'MAIN SCREEN',
          reason: 'telão central da Axe Capital',
          start: { pos: new THREE.Vector3(0.6, 2.0, 7.6), target: new THREE.Vector3(0, 3.4, -14.8) },
          end: { pos: new THREE.Vector3(-0.4, 3.4, 3.4), target: new THREE.Vector3(0, 4.3, -14.8) },
          duration: 10000,
          startedAt: now,
        };
      case 'WALL': {
        // travelling lateral colado na parede de monitores
        const dir = Math.random() > 0.5 ? 1 : -1;
        return {
          kind: 'WALL_SWEEP',
          label: 'MARKET INTELLIGENCE',
          reason: 'parede de monitores',
          start: { pos: new THREE.Vector3(-10.5 * dir, 4.1, -5.2), target: new THREE.Vector3(-7 * dir, 3.7, -14.8) },
          end: { pos: new THREE.Vector3(10.5 * dir, 3.6, -4.2), target: new THREE.Vector3(7 * dir, 3.5, -14.8) },
          duration: 12000,
          startedAt: now,
        };
      }
      case 'GLIDE': {
        // travelling baixo pelo corredor, entre as fileiras de mesas
        const dir = Math.random() > 0.5 ? 1 : -1;
        return {
          kind: 'FLOOR_GLIDE',
          label: 'TRADING FLOOR',
          reason: 'corredor da mesa',
          start: { pos: new THREE.Vector3(13.5 * dir, 2.6, 11.5), target: new THREE.Vector3(3 * dir, 1.5, 1) },
          end: { pos: new THREE.Vector3(-2 * dir, 2.2, 4.5), target: new THREE.Vector3(-2 * dir, 1.4, -8) },
          duration: 13000,
          startedAt: now,
        };
      }
      case 'LAB':
        // research lab, visto do pregão através do vidro
        return {
          kind: 'LAB',
          label: 'RESEARCH LAB',
          reason: 'backtest e treinamento rodando',
          start: { pos: new THREE.Vector3(-6.5, 3.1, 9.6), target: new THREE.Vector3(-2, 2.6, 18) },
          end: { pos: new THREE.Vector3(4.5, 2.6, 12.0), target: new THREE.Vector3(1.5, 2.6, 20.4) },
          duration: 10000,
          startedAt: now,
        };
      default:
        return buildBeatShot('OPEN');
    }
  };

  const pickNext = (): Shot => {
    const { cameraMode } = useStore.getState();
    if (cameraMode === 'follow') {
      return buildAgentShot() ?? buildBeatShot('OPEN');
    }
    const b = RUNDOWN[beat.current % RUNDOWN.length];
    beat.current += 1;
    if (b === 'AGENT') return buildAgentShot() ?? buildBeatShot('GLIDE');
    return buildBeatShot(b);
  };

  useFrame((_, dt) => {
    const st = useStore.getState();
    const ctrl = controls.current;
    if (!ctrl) return;

    if (st.cameraMode === 'manual' || performance.now() < manualUntil.current) {
      if (st.spotlight) st.setSpotlight(null);
      return;
    }

    // evento importante do engine → corta na hora para a mesa envolvida
    const focus = st.focus;
    if (focus && focus.at !== lastFocusAt.current) {
      lastFocusAt.current = focus.at;
      const desk = st.desks.find((d) => d.id === focus.deskId);
      const agent = st.agents.find((a) => a.id === focus.agentId);
      const current = shot.current;
      const fresh = current ? performance.now() - current.startedAt : 9e9;
      // não corta em cima de um plano que acabou de começar (evita pisca-pisca)
      if (desk && fresh > 2600) {
        const sameDesk = current?.agentId && current.agentId === agent?.id;
        const kind: ShotKind = sameDesk ? 'ORBIT' : Math.random() > 0.45 ? 'PUSH_IN' : 'OVER_SHOULDER';
        cut(buildDeskShot(desk, agent, kind, focus.label ?? 'evento no pregão'));
      }
    }

    if (!shot.current) cut(pickNext());
    const s = shot.current!;
    const elapsed = performance.now() - s.startedAt;
    const t = Math.min(1, elapsed / s.duration);
    const e = s.kind === 'PUSH_IN' || s.kind === 'CLOSE_UP' ? easeOut(t) : easeInOut(t);

    let pos: THREE.Vector3;
    let target: THREE.Vector3;
    if (s.orbit) {
      const a = THREE.MathUtils.lerp(s.orbit.from, s.orbit.to, e);
      pos = new THREE.Vector3(
        s.orbit.center.x + Math.sin(a) * s.orbit.radius,
        s.orbit.height,
        s.orbit.center.z + Math.cos(a) * s.orbit.radius,
      );
      target = s.orbit.center.clone();
    } else {
      pos = s.start.pos.clone().lerp(s.end.pos, e);
      target = s.start.target.clone().lerp(s.end.target, e);
    }

    if (!s.exterior) {
      clampInside(pos);
      avoidDesks(pos, st.desks, s.agentId ? st.agents.find((a) => a.id === s.agentId)?.deskId : undefined);
    }

    // leve respiração de câmera na mão (amplitude menor nos planos fechados)
    noise.current += dt;
    const n = noise.current;
    const amp = s.kind === 'CLOSE_UP' || s.kind === 'OVER_SHOULDER' ? 0.018 : 0.034;
    pos.x += Math.sin(n * 0.63) * amp;
    pos.y += Math.sin(n * 0.47 + 1.3) * amp * 0.8;
    pos.z += Math.cos(n * 0.55 + 0.7) * amp * 0.9;

    // suavização independente de framerate (sem "teleporte" nem tranco em 144Hz)
    const k = 1 - Math.exp(-7.5 * dt);
    camera.position.lerp(pos, k);
    ctrl.target.lerp(target, Math.min(1, k * 1.15));
    ctrl.update();

    if (t >= 1) cut(pickNext());
  });

  return null;
}

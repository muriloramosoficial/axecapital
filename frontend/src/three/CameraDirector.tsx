import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/store';
import type { Agent, Desk } from '../types';

/**
 * Direção de câmera "de transmissão".
 *
 * Em vez de um único plano geral, a câmera trabalha com um roteiro de planos
 * (estabelecimento, push-in, órbita, over-the-shoulder, travelling pela parede
 * de monitores…), corta sozinha entre as mesas mais interessantes e interrompe
 * o roteiro quando o engine dispara um evento importante (oportunidade,
 * aprovação, execução, stop). Cada plano tem easing próprio e um leve
 * movimento de câmera na mão para não parecer um render estático.
 */

export const OVERVIEW = {
  pos: new THREE.Vector3(0, 17.5, 27),
  target: new THREE.Vector3(0, 1.6, -1),
};

type ShotKind = 'ESTABLISH' | 'PUSH_IN' | 'ORBIT' | 'OVER_SHOULDER' | 'WALL_SWEEP' | 'FLOOR_GLIDE' | 'CLOSE_UP';

interface Shot {
  kind: ShotKind;
  label: string;
  agentId?: string;
  reason: string;
  start: { pos: THREE.Vector3; target: THREE.Vector3 };
  end: { pos: THREE.Vector3; target: THREE.Vector3 };
  /** órbita: ângulos inicial/final em torno da mesa */
  orbit?: { center: THREE.Vector3; radius: number; from: number; to: number; height: number };
  duration: number;
  startedAt: number;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function deskFront(desk: Desk, distance: number, height: number) {
  // vetor que sai da frente da mesa (lado onde o agente senta)
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
  // evita repetir a mesma mesa: quanto mais tempo sem aparecer, melhor
  score += Math.min(8, (Date.now() - lastSeen) / 12000);
  return score;
}

export function CameraDirector({ controls }: { controls: React.MutableRefObject<any> }) {
  const { camera } = useThree();
  const shot = useRef<Shot | null>(null);
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

  const cut = (next: Shot) => {
    shot.current = next;
    if (next.agentId) {
      lastSeen.current[next.agentId] = Date.now();
      useStore.getState().setSpotlight({ agentId: next.agentId, shot: next.label, reason: next.reason });
    } else {
      useStore.getState().setSpotlight(null);
    }
  };

  const buildDeskShot = (desk: Desk, agent: Agent | undefined, kind: ShotKind, reason: string): Shot => {
    const head = deskHead(desk);
    const now = performance.now();
    if (kind === 'ORBIT') {
      const base = Math.atan2(camera.position.x - desk.x, camera.position.z - desk.z);
      const dirSign = Math.random() > 0.5 ? 1 : -1;
      return {
        kind,
        label: 'ORBIT',
        agentId: agent?.id,
        reason,
        orbit: { center: head.clone(), radius: 3.9, from: base, to: base + dirSign * 0.85, height: 2.25 },
        start: { pos: camera.position.clone(), target: head.clone() },
        end: { pos: camera.position.clone(), target: head.clone() },
        duration: 9000,
        startedAt: now,
      };
    }
    if (kind === 'OVER_SHOULDER') {
      const behind = deskFront(desk, 2.5, 2.1);
      return {
        kind,
        label: 'OVER THE SHOULDER',
        agentId: agent?.id,
        reason,
        start: { pos: behind.clone().add(new THREE.Vector3(0.9, 0.5, 0)), target: head.clone() },
        end: { pos: behind.clone().add(new THREE.Vector3(0.55, 0.12, 0)), target: head.clone().setY(1.35) },
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
        start: { pos: deskFront(desk, 3.4, 2.0), target: head.clone() },
        end: { pos: deskFront(desk, 2.1, 1.75), target: head.clone().setY(1.45) },
        duration: 6500,
        startedAt: now,
      };
    }
    // PUSH_IN
    return {
      kind: 'PUSH_IN',
      label: 'PUSH IN',
      agentId: agent?.id,
      reason,
      start: { pos: deskFront(desk, 8.2, 4.4), target: head.clone() },
      end: { pos: deskFront(desk, 3.3, 2.1), target: head.clone() },
      duration: 8500,
      startedAt: now,
    };
  };

  const buildAmbientShot = (): Shot => {
    const now = performance.now();
    const kinds: ShotKind[] = ['ESTABLISH', 'WALL_SWEEP', 'FLOOR_GLIDE'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    if (kind === 'WALL_SWEEP') {
      const dir = Math.random() > 0.5 ? 1 : -1;
      return {
        kind,
        label: 'MARKET INTELLIGENCE',
        reason: 'parede de monitores',
        start: { pos: new THREE.Vector3(-11 * dir, 4.6, -3.5), target: new THREE.Vector3(-6 * dir, 3.6, -14.6) },
        end: { pos: new THREE.Vector3(11 * dir, 4.2, -2.2), target: new THREE.Vector3(6 * dir, 3.4, -14.6) },
        duration: 13000,
        startedAt: now,
      };
    }
    if (kind === 'FLOOR_GLIDE') {
      const dir = Math.random() > 0.5 ? 1 : -1;
      return {
        kind,
        label: 'TRADING FLOOR',
        reason: 'visão geral da mesa',
        start: { pos: new THREE.Vector3(14 * dir, 7.2, 12), target: new THREE.Vector3(2 * dir, 1.4, 0) },
        end: { pos: new THREE.Vector3(-6 * dir, 5.4, 6), target: new THREE.Vector3(-1 * dir, 1.3, -4) },
        duration: 14000,
        startedAt: now,
      };
    }
    return {
      kind: 'ESTABLISH',
      label: 'AXE CAPITAL',
      reason: 'plano geral',
      start: { pos: OVERVIEW.pos.clone().add(new THREE.Vector3(6, 1.5, 2)), target: OVERVIEW.target.clone() },
      end: { pos: OVERVIEW.pos.clone().add(new THREE.Vector3(-6, -1.2, -1)), target: OVERVIEW.target.clone() },
      duration: 15000,
      startedAt: now,
    };
  };

  const pickNext = (): Shot => {
    const { desks, agents, cameraMode } = useStore.getState();
    // 1 em cada 4 planos é ambiente, para respirar
    const ambient = Math.random() < 0.26 || cameraMode === 'follow';
    const staffed = desks
      .map((d) => ({ desk: d, agent: agents.find((a) => a.deskId === d.id) }))
      .filter((x) => !!x.agent);
    if (ambient || !staffed.length) return buildAmbientShot();

    const ranked = staffed
      .map((x) => ({ ...x, score: interest(x.agent, lastSeen.current[x.agent!.id] ?? 0) }))
      .sort((a, b) => b.score - a.score);
    const pool = ranked.slice(0, Math.min(4, ranked.length));
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const agent = chosen.agent!;
    const kinds: ShotKind[] = agent.openSymbol
      ? ['PUSH_IN', 'ORBIT', 'OVER_SHOULDER', 'CLOSE_UP']
      : ['PUSH_IN', 'ORBIT', 'OVER_SHOULDER'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const reason = agent.openSymbol
      ? `posição aberta em ${agent.openSymbol}`
      : agent.state !== 'IDLE'
        ? agent.statusLine ?? agent.state
        : 'acompanhando o mercado';
    return buildDeskShot(chosen.desk, agent, kind, reason);
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
      if (desk) {
        const current = shot.current;
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

    // leve respiração de câmera na mão
    noise.current += dt;
    const n = noise.current;
    pos.x += Math.sin(n * 0.63) * 0.035;
    pos.y += Math.sin(n * 0.47 + 1.3) * 0.028;
    pos.z += Math.cos(n * 0.55 + 0.7) * 0.03;

    // interpolação suave no corte (primeiros 700ms) para nunca "teleportar"
    const blend = elapsed < 700 ? 0.085 : 0.16;
    camera.position.lerp(pos, blend);
    ctrl.target.lerp(target, blend * 1.1);
    ctrl.update();

    if (t >= 1) cut(pickNext());
  });

  return null;
}

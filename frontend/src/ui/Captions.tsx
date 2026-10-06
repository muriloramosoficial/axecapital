import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { ChatMessage } from '../types';

/**
 * Legendas das falas da mesa, estilo transmissão ao vivo.
 *
 * Cada fala nova entra numa FILA: nada é engolido quando vários agentes falam
 * ao mesmo tempo. Cada legenda fica no ar pelo menos MIN_MS; falas com tom
 * `good`/`bad` (entrada aprovada, stop, resultado) furam a fila. Tecla C
 * liga/desliga.
 */

const MIN_MS = 2600;
const MAX_MS = 6800;
const QUEUE_MAX = 6;

const TONE_RING: Record<string, string> = {
  good: 'border-emerald-400/40',
  bad: 'border-rose-400/40',
  warn: 'border-amber-400/40',
  info: 'border-sky-400/30',
};
const PRIORITY: Record<string, number> = { bad: 3, good: 2, warn: 1, info: 0 };

function holdFor(text: string) {
  return Math.min(MAX_MS, Math.max(MIN_MS, 900 + text.length * 42));
}

export function Captions() {
  const chat = useStore((s) => s.chat);
  const roleMeta = useStore((s) => s.roleMeta);
  const select = useStore((s) => s.select);
  const [enabled, setEnabled] = useState(() => localStorage.getItem('axe.captions') !== '0');
  const [shown, setShown] = useState<ChatMessage | null>(null);
  const [typed, setTyped] = useState('');
  const queue = useRef<ChatMessage[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const busyUntil = useRef(0);
  const bootstrapped = useRef(false);

  // tecla C
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && /input|textarea|select/i.test(el.tagName)) return;
      setEnabled((v) => {
        localStorage.setItem('axe.captions', v ? '0' : '1');
        return !v;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // alimenta a fila com as falas que ainda não foram exibidas
  useEffect(() => {
    if (!chat.length) return;
    if (!bootstrapped.current) {
      // na primeira carga, não despeja o histórico inteiro na tela
      chat.forEach((m) => seen.current.add(m.id));
      bootstrapped.current = true;
      return;
    }
    const fresh = chat.filter((m) => !seen.current.has(m.id)).reverse();
    for (const m of fresh) {
      seen.current.add(m.id);
      queue.current.push(m);
    }
    if (queue.current.length > QUEUE_MAX) {
      // mantém as falas mais relevantes quando o pregão acelera
      queue.current = queue.current
        .slice(-QUEUE_MAX * 2)
        .sort((a, b) => (PRIORITY[b.tone] ?? 0) - (PRIORITY[a.tone] ?? 0) || a.at - b.at)
        .slice(0, QUEUE_MAX);
    }
    if (seen.current.size > 400) seen.current = new Set(chat.map((m) => m.id));
  }, [chat]);

  // despacha a fila
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      if (now < busyUntil.current) return;
      const next = queue.current.shift();
      if (next) {
        setShown(next);
        setTyped('');
        busyUntil.current = now + holdFor(next.text);
      } else if (shown && now > busyUntil.current + 600) {
        setShown(null);
      }
    }, 120);
    return () => window.clearInterval(id);
  }, [shown]);

  // efeito de digitação
  useEffect(() => {
    if (!shown) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 2;
      setTyped(shown.text.slice(0, i));
      if (i >= shown.text.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [shown?.id]);

  if (!enabled || !shown) return null;
  const meta = roleMeta[shown.role];
  const pending = queue.current.length;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[86px] z-30 flex justify-center px-4">
      <div
        className={`pointer-events-auto max-w-[min(70vw,780px)] cursor-pointer rounded-lg border bg-[#070c13]/[0.86] px-4 py-2.5 shadow-panel backdrop-blur-md ${
          TONE_RING[shown.tone] ?? 'border-white/10'
        }`}
        onClick={() => select(shown.agentId)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px]">{meta?.emoji ?? '•'}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: meta?.accent ?? '#94a3b8' }}>
            {shown.agentName}
          </span>
          <span className="text-[9px] uppercase tracking-[0.2em] text-slate-500">{meta?.label ?? shown.role}</span>
          {pending > 0 && <span className="mono ml-auto text-[9px] text-slate-600">+{pending} na fila</span>}
        </div>
        <div className="mt-1 text-[15px] leading-snug text-slate-100">
          {typed}
          <span className="ml-0.5 inline-block h-[15px] w-[2px] translate-y-[2px] animate-pulse bg-sky-300/80" />
        </div>
      </div>
    </div>
  );
}

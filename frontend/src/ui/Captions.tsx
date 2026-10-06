import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';

/**
 * Legendas das falas da mesa, no estilo de transmissão ao vivo:
 * a última mensagem do chat aparece embaixo, com nome/função do agente,
 * efeito de digitação e saída automática. Tecla C liga/desliga.
 */

const HOLD_MS = 6500;
const TONE_RING: Record<string, string> = {
  good: 'border-emerald-400/40',
  bad: 'border-rose-400/40',
  warn: 'border-amber-400/40',
  info: 'border-sky-400/30',
};

export function Captions() {
  const chat = useStore((s) => s.chat);
  const roleMeta = useStore((s) => s.roleMeta);
  const select = useStore((s) => s.select);
  const [enabled, setEnabled] = useState(() => localStorage.getItem('axe.captions') !== '0');
  const [shown, setShown] = useState<(typeof chat)[number] | null>(null);
  const [typed, setTyped] = useState('');
  const timer = useRef<number | null>(null);

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

  const latest = chat[0];
  useEffect(() => {
    if (!latest) return;
    setShown(latest);
    setTyped('');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShown(null), HOLD_MS);
  }, [latest?.id]);

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
        </div>
        <div className="mt-1 text-[15px] leading-snug text-slate-100">
          {typed}
          <span className="ml-0.5 inline-block h-[15px] w-[2px] translate-y-[2px] animate-pulse bg-sky-300/80" />
        </div>
      </div>
    </div>
  );
}

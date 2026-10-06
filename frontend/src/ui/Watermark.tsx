import { useEffect, useState } from 'react';

/**
 * Marca d'água da transmissão: fica no canto da tela em TODOS os modos de HUD
 * (inclusive no modo limpo), para o vídeo sair sempre assinado.
 *
 * Personalize sem mexer no código, pelo console do navegador:
 *   localStorage.setItem('axe.watermark.handle', '@seucanal')
 *   localStorage.setItem('axe.watermark.corner', 'tl' | 'tr' | 'bl' | 'br')
 *   localStorage.setItem('axe.watermark', 'off')   // esconde
 * Tecla W também liga/desliga.
 */

const CORNERS: Record<string, string> = {
  tl: 'top-3 left-3',
  tr: 'top-3 right-3',
  bl: 'bottom-3 left-3',
  br: 'bottom-3 right-3',
};

export function Watermark() {
  const [on, setOn] = useState(() => localStorage.getItem('axe.watermark') !== 'off');
  const handle = localStorage.getItem('axe.watermark.handle') ?? 'axecapital.live';
  const corner = CORNERS[localStorage.getItem('axe.watermark.corner') ?? 'tr'] ?? CORNERS.tr;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'w' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && /input|textarea|select/i.test(el.tagName)) return;
      setOn((v) => {
        localStorage.setItem('axe.watermark', v ? 'off' : 'on');
        return !v;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!on) return null;

  return (
    <div className={`pointer-events-none absolute z-40 flex items-center gap-2 ${corner}`} style={{ opacity: 0.62 }}>
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden>
        <defs>
          <linearGradient id="axe-wm" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        {/* lâmina do machado */}
        <path d="M16 3 L26 8 Q28 14 22 17 L16 13 Z" fill="url(#axe-wm)" opacity="0.95" />
        <path d="M16 3 L6 8 Q4 14 10 17 L16 13 Z" fill="url(#axe-wm)" opacity="0.6" />
        {/* cabo / candle */}
        <rect x="14.8" y="12" width="2.4" height="17" rx="1" fill="#cbd5e1" opacity="0.85" />
        {/* seta de alta */}
        <path d="M20 27 L24 20 L27 23" stroke="#5eead4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <div className="leading-none">
        <div className="text-[12px] font-semibold uppercase tracking-[0.3em] text-slate-100 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
          Axe Capital
        </div>
        <div className="mt-[3px] text-[9px] uppercase tracking-[0.22em] text-emerald-300/80 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
          {handle}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useStore, type HudMode } from '../state/store';

const MODES: { id: HudMode; icon: string; label: string; hint: string }[] = [
  { id: 'full', icon: '▦', label: 'Completo', hint: 'Todos os painéis de análise' },
  { id: 'broadcast', icon: '◉', label: 'Transmissão', hint: 'Só HUD de conta + ticker (ideal para live)' },
  { id: 'clean', icon: '⬚', label: 'Limpo', hint: 'Somente o escritório 3D' },
];

/**
 * Pequena barra sempre disponível (canto superior direito) para esconder /
 * mostrar a HUD, ajustar a escala da interface e entrar em tela cheia.
 * Pensada para transmissão 24h: atalhos H, [ , ] e F.
 */
export function HudControls() {
  const hudMode = useStore((s) => s.hudMode);
  const setHudMode = useStore((s) => s.setHudMode);
  const cycleHud = useStore((s) => s.cycleHud);
  const uiScale = useStore((s) => s.uiScale);
  const setUiScale = useStore((s) => s.setUiScale);
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'h' || e.key === 'H') cycleHud();
      else if (e.key === '[') setUiScale(useStore.getState().uiScale - 0.05);
      else if (e.key === ']') setUiScale(useStore.getState().uiScale + 0.05);
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [cycleHud, setUiScale]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  const current = MODES.find((m) => m.id === hudMode) ?? MODES[0];

  return (
    <div
      className="pointer-events-auto absolute right-3 top-3 z-50 flex flex-col items-end gap-1.5"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className={`glass flex items-center gap-1 rounded-full px-1.5 py-1 transition-opacity duration-300 ${
          open || hudMode !== 'clean' ? 'opacity-100' : 'opacity-25'
        }`}
      >
        <button
          className="rounded-full px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10"
          title={`Interface: ${current.label} — clique ou tecle H para alternar`}
          onClick={cycleHud}
        >
          {current.icon} <span className="ml-1 hidden text-[10px] uppercase tracking-[0.16em] sm:inline">{current.label}</span>
        </button>
        <span className="h-4 w-px bg-white/10" />
        <button
          className="rounded-full px-1.5 py-1 text-[11px] text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
          title="Diminuir interface ( [ )"
          onClick={() => setUiScale(uiScale - 0.05)}
        >
          −
        </button>
        <span className="mono w-[34px] text-center text-[10px] text-slate-400">{Math.round(uiScale * 100)}%</span>
        <button
          className="rounded-full px-1.5 py-1 text-[11px] text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
          title="Aumentar interface ( ] )"
          onClick={() => setUiScale(uiScale + 0.05)}
        >
          +
        </button>
        <span className="h-4 w-px bg-white/10" />
        <button
          className="rounded-full px-2 py-1 text-[11px] text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
          title="Tela cheia ( F )"
          onClick={toggleFullscreen}
        >
          {full ? '⤡' : '⤢'}
        </button>
      </div>

      {open && (
        <div className="glass flex w-[230px] flex-col gap-1 rounded-lg p-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setHudMode(m.id)}
              className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition ${
                hudMode === m.id ? 'bg-emerald-400/15 text-emerald-200' : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <span className="mt-[1px] text-[12px]">{m.icon}</span>
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em]">{m.label}</span>
                <span className="block text-[10px] leading-tight text-slate-500">{m.hint}</span>
              </span>
            </button>
          ))}
          <div className="mt-1 border-t border-white/5 pt-1 text-[9px] uppercase tracking-[0.16em] text-slate-500">
            H alterna · [ ] escala · F tela cheia
          </div>
        </div>
      )}
    </div>
  );
}

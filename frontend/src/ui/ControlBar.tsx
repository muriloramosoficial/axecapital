import { api } from '../lib/api';
import { useStore } from '../state/store';
import type { MarketRegime } from '../types';

const SPEEDS = [1, 2, 5, 10, 20, 100];
const REGIMES: MarketRegime[] = ['TRENDING', 'RANGING', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'NEWS_SHOCK', 'LIQUIDITY_DROP'];

export function ControlBar({ onToggleTv }: { onToggleTv?: () => void } = {}) {
  const config = useStore((s) => s.config);
  const cameraMode = useStore((s) => s.cameraMode);
  const setCameraMode = useStore((s) => s.setCameraMode);
  const tvEnabled = useStore((s) => s.tvEnabled);
  const setTv = useStore((s) => s.setTv);

  return (
    <div className="glass pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg px-3 py-2">
      <button
        className={`btn ${config.running ? 'btn-danger' : 'btn-accent'}`}
        onClick={() => api.control({ running: !config.running })}
      >
        {config.running ? '⏸ Pause' : '▶ Start simulation'}
      </button>

      <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/30 p-1">
        <span className="px-1.5 text-[9px] uppercase tracking-[0.18em] text-slate-500">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => api.control({ speed: s })}
            className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
              config.speed === s ? 'bg-emerald-400/20 text-emerald-300' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/30 px-2 py-1">
        <span className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Regime</span>
        <select
          className="bg-transparent text-[11px] font-semibold uppercase tracking-wider text-slate-200 outline-none"
          value={config.regime}
          onChange={(e) => api.control({ regime: e.target.value, autoRegime: false })}
        >
          {REGIMES.map((r) => (
            <option key={r} value={r} className="bg-[#0b1016]">
              {r.replace('_', ' ')}
            </option>
          ))}
        </select>
        <label className="ml-2 flex items-center gap-1 text-[10px] text-slate-400">
          <input
            type="checkbox"
            checked={config.autoRegime}
            onChange={(e) => api.control({ autoRegime: e.target.checked })}
            className="accent-emerald-400"
          />
          auto
        </label>
      </div>

      <button className="btn" onClick={() => api.injectEvent()}>
        ⚡ New market event
      </button>
      <button className="btn" onClick={() => api.reset()}>
        ⟲ Reset day
      </button>

      <div className="mx-1 h-6 w-px bg-white/10" />

      <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/30 p-1">
        <span className="px-1.5 text-[9px] uppercase tracking-[0.18em] text-slate-500">Câmera</span>
        {(
          [
            ['director', '🎬 Direção', 'Roteiro cinematográfico: corta sozinha entre planos e mesas'],
            ['follow', '🎯 Eventos', 'Só aproxima quando acontece algo importante'],
            ['manual', '🖐 Manual', 'Você controla: arrastar = orbitar, scroll = zoom'],
          ] as const
        ).map(([id, label, title]) => (
          <button
            key={id}
            title={title}
            onClick={() => setCameraMode(id)}
            className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
              cameraMode === id ? 'bg-emerald-400/20 text-emerald-300' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
        <input
          type="checkbox"
          checked={tvEnabled}
          onChange={() => (onToggleTv ? onToggleTv() : setTv(!tvEnabled))}
          className="accent-emerald-400"
        />
        Telão: {tvEnabled ? 'marca' : 'gráfico'}
      </label>

      <div className="ml-auto flex items-center gap-2 pr-1 text-[9px] uppercase tracking-[0.18em] text-slate-500">
        <span>arraste para assumir a câmera (volta sozinha em 25s) · H esconde a HUD</span>
      </div>
    </div>
  );
}

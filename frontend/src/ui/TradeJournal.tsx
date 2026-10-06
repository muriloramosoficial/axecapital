import { useState } from 'react';
import { useStore } from '../state/store';
import { api } from '../lib/api';
import { duration, px, signed } from '../lib/format';

export function TradeJournal() {
  const [tab, setTab] = useState<'open' | 'journal'>('open');
  const positions = useStore((s) => s.positions);
  const closed = useStore((s) => s.closed);

  return (
    <div className="glass flex min-h-0 flex-1 flex-col rounded-lg">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <span className="panel-title">Book</span>
        <div className="ml-auto flex gap-1 rounded-md border border-white/10 bg-black/30 p-0.5">
          {(['open', 'journal'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                tab === t ? 'bg-white/10 text-slate-100' : 'text-slate-500'
              }`}
            >
              {t === 'open' ? `Positions ${positions.length}` : `Journal ${closed.length}`}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {tab === 'open' ? (
          positions.length ? (
            positions.map((p) => (
              <div key={p.id} className="slide-in mb-1.5 rounded border border-white/5 bg-white/[0.02] px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold ${p.side === 'BUY' ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {p.side === 'BUY' ? '▲' : '▼'} {p.symbol}
                  </span>
                  <span className="mono text-[10px] text-slate-500">{p.lots.toFixed(2)} lot</span>
                  <span className={`mono ml-auto text-[12px] font-semibold ${p.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {signed(p.pnl)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[9px] text-slate-500">
                  <span className="mono">in {px(p.entry)}</span>
                  <span className="mono">now {px(p.current)}</span>
                  <span className="mono text-rose-400/70">sl {px(p.stopLoss)}</span>
                  <span className="mono text-emerald-400/70">tp {px(p.takeProfit)}</span>
                  <button className="ml-auto text-[9px] uppercase tracking-wider text-slate-400 hover:text-rose-300" onClick={() => api.closePosition(p.id)}>
                    close
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-[11px] text-slate-500">Book is flat.</div>
          )
        ) : closed.length ? (
          closed.map((t) => (
            <div key={t.id} className="slide-in mb-1.5 rounded border border-white/5 bg-white/[0.02] px-2 py-1.5">
              <div className="flex items-center gap-2">
                <span className="mono text-[9px] text-slate-600">#{t.number}</span>
                <span className={`text-[11px] font-bold ${t.side === 'BUY' ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {t.symbol} {t.side}
                </span>
                <span
                  className={`chip ${
                    t.result === 'WIN' ? 'border-emerald-400/40 text-emerald-300' : t.result === 'LOSS' ? 'border-rose-400/40 text-rose-300' : 'text-slate-400'
                  }`}
                >
                  {t.result}
                </span>
                <span className={`mono ml-auto text-[12px] font-semibold ${t.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{signed(t.pnl)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[9px] text-slate-500">
                <span className="mono">in {px(t.entry)}</span>
                <span className="mono">out {px(t.exit)}</span>
                <span className="mono text-rose-400/70">sl {px(t.stopLoss)}</span>
                <span className="mono text-emerald-400/70">tp {px(t.takeProfit)}</span>
                <span>{t.reason.replace('_', ' ').toLowerCase()}</span>
                <span className="ml-auto">{duration(t.durationMs)}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="py-6 text-center text-[11px] text-slate-500">No trades closed yet today.</div>
        )}
      </div>
    </div>
  );
}

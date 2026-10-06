import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api } from '../lib/api';
import type { BrainSummary } from '../types';
import { duration } from '../lib/format';

function Stat({ label, value, tone = 'text-slate-100' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded border border-white/8 bg-black/30 px-2 py-1.5">
      <div className="text-[8px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mono text-[14px] font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function PatternRow({ p, good }: { p: BrainSummary['best'][number]; good: boolean }) {
  const pct = Math.round(p.winRate * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-[160px] truncate text-[10px] text-slate-300" title={p.label}>
        {p.label}
      </span>
      <div className="h-1.5 flex-1 rounded bg-white/5">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: good ? '#4ade80' : '#f05252' }} />
      </div>
      <span className="mono w-9 text-right text-[10px]" style={{ color: good ? '#86efac' : '#fca5a5' }}>
        {pct}%
      </span>
      <span className="mono w-14 text-right text-[9px] text-slate-500">{p.n} trades</span>
      <span className={`mono w-16 text-right text-[10px] ${p.pnl >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
        {p.pnl >= 0 ? '+' : '-'}${Math.abs(p.pnl).toFixed(0)}
      </span>
    </div>
  );
}

export function BrainModal({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [data, setData] = useState<{ agent: any; brain: BrainSummary } | null>(null);
  const [err, setErr] = useState('');

  const load = () =>
    api
      .brain(agentId)
      .then(setData)
      .catch((e) => setErr(e.message ?? 'erro'));

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const b = data?.brain;

  return (
    <Modal
      title={`🧠 Trading memory — ${data?.agent?.name ?? '…'}`}
      subtitle="Cada trade fechado vira uma lição: o setup é decomposto em features e o agente aprende o que funciona (e o que evitar)."
      onClose={onClose}
      wide
    >
      {err && <div className="rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">{err}</div>}
      {!b ? (
        <div className="py-10 text-center text-[11px] text-slate-500">carregando memória…</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
            <Stat label="Lessons" value={String(b.samples)} />
            <Stat label="Hit rate" value={`${(b.winRate * 100).toFixed(0)}%`} tone={b.winRate >= 0.5 ? 'text-emerald-300' : 'text-rose-300'} />
            <Stat label="W / L" value={`${b.wins}/${b.losses}`} />
            <Stat label="Expectancy" value={`${b.expectancyR >= 0 ? '+' : ''}${b.expectancyR.toFixed(2)}R`} tone={b.expectancyR >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
            <Stat label="Profit factor" value={b.profitFactor >= 99 ? '∞' : b.profitFactor.toFixed(2)} />
            <Stat label="Learned P&L" value={`${b.pnl >= 0 ? '+' : '-'}$${Math.abs(b.pnl).toFixed(2)}`} tone={b.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
          </div>

          {b.samples === 0 && (
            <div className="rounded border border-white/8 bg-black/30 px-3 py-4 text-center text-[11px] text-slate-500">
              Ainda sem lições gravadas. Assim que a primeira posição dele fechar, o cérebro começa a montar o playbook.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <section>
              <div className="panel-title mb-2">✓ Setups que funcionam</div>
              <div className="space-y-1.5">
                {b.best.length ? b.best.map((p) => <PatternRow key={p.key} p={p} good />) : <div className="text-[11px] text-slate-500">sem amostras suficientes</div>}
              </div>
            </section>
            <section>
              <div className="panel-title mb-2">✕ Setups para evitar</div>
              <div className="space-y-1.5">
                {b.worst.length ? b.worst.map((p) => <PatternRow key={p.key} p={p} good={false} />) : <div className="text-[11px] text-slate-500">sem amostras suficientes</div>}
              </div>
            </section>
          </div>

          {!!b.calibration.length && (
            <section>
              <div className="panel-title mb-2">Calibração de confiança (previsto × realizado)</div>
              <div className="flex flex-wrap gap-2">
                {b.calibration.map((c) => (
                  <div key={c.band} className="rounded border border-white/8 bg-black/30 px-2 py-1">
                    <div className="text-[9px] text-slate-500">conf {c.band}%</div>
                    <div className="mono text-[12px]" style={{ color: c.realized >= 0.5 ? '#86efac' : '#fca5a5' }}>
                      {(c.realized * 100).toFixed(0)}% real <span className="text-[9px] text-slate-500">· {c.n}x</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="panel-title mb-2">Diário de aprendizado</div>
            <div className="max-h-[32vh] space-y-2 overflow-y-auto pr-1">
              {b.lessons.map((l) => (
                <div key={l.id} className="rounded border border-white/8 bg-white/[0.02] p-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold ${l.side === 'BUY' ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {l.symbol} {l.side}
                    </span>
                    <span
                      className={`chip ${l.result === 'WIN' ? 'border-emerald-400/40 text-emerald-300' : 'border-rose-400/40 text-rose-300'}`}
                    >
                      {l.result} {l.rMultiple >= 0 ? '+' : ''}
                      {l.rMultiple.toFixed(2)}R
                    </span>
                    <span className="mono text-[10px] text-slate-500">{l.exitReason.replace('_', ' ').toLowerCase()}</span>
                    <span className="mono text-[10px] text-slate-600">{duration(l.holdMs)}</span>
                    <span className={`mono ml-auto text-[12px] font-semibold ${l.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {l.pnl >= 0 ? '+' : '-'}${Math.abs(l.pnl).toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1.5 grid gap-1 md:grid-cols-2">
                    <ul className="space-y-0.5">
                      {l.right.map((r, i) => (
                        <li key={i} className="text-[10px] text-emerald-300/90">
                          ✓ {r}
                        </li>
                      ))}
                    </ul>
                    <ul className="space-y-0.5">
                      {l.wrong.map((w, i) => (
                        <li key={i} className="text-[10px] text-rose-300/90">
                          ✕ {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-1 border-t border-white/5 pt-1 text-[10px] italic text-slate-400">{l.verdict}</div>
                </div>
              ))}
              {!b.lessons.length && <div className="text-[11px] text-slate-500">nenhuma lição ainda</div>}
            </div>
          </section>

          <div className="flex justify-between">
            <span className="text-[10px] text-slate-500">
              A memória é gravada em <span className="mono">data/memory.json</span> e sobrevive a reinícios e atualizações.
            </span>
            <button
              className="btn btn-danger"
              onClick={async () => {
                await api.resetBrain(agentId);
                load();
              }}
            >
              Apagar memória
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

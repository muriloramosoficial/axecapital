import { useStore } from '../state/store';

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

const TONE: Record<string, string> = {
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-rose-300',
  info: 'text-slate-300',
};

export function LabPanel() {
  const lab = useStore((s) => s.lab);
  if (!lab) return null;

  const champs = lab.champions.slice(0, 4);
  const board = lab.leaderboard.slice(0, 5);
  const findings = lab.findings.slice(0, 6);

  return (
    <div className="glass flex max-h-[46vh] shrink-0 flex-col gap-3 overflow-y-auto rounded-lg p-3">
      <div className="flex items-center justify-between">
        <span className="panel-title">Research lab</span>
        <span className="mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
          gen {lab.generation} · {lab.experiments} runs · {lab.promotions} promoted
        </span>
      </div>

      {/* campeões em produção */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Setups em produção</div>
        {champs.length === 0 && <div className="text-[11px] text-slate-500">nenhum setup aprovado ainda — o lab está treinando…</div>}
        {champs.map((c) => {
          const liveWr = c.live.trades ? c.live.wins / c.live.trades : null;
          return (
            <div key={c.id} className="rounded border border-white/5 bg-white/[0.03] px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="mono text-[11px] text-slate-200">
                  {c.symbol} · {c.name}
                </span>
                <span className="mono text-[10px] text-emerald-300">{c.expectancyR.toFixed(2)}R</span>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-1 text-[9px] uppercase tracking-[0.12em] text-slate-500">
                <span>
                  IS <span className="mono text-slate-300">{pct(c.winRate)}</span>
                </span>
                <span>
                  OOS <span className="mono text-sky-300">{pct(c.validation.winRate)}</span>
                </span>
                <span>
                  LIVE{' '}
                  <span className={`mono ${liveWr === null ? 'text-slate-500' : liveWr >= 0.5 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {liveWr === null ? '—' : `${pct(liveWr)} (${c.live.trades})`}
                  </span>
                </span>
              </div>
              <div className="mt-0.5 text-[9px] text-slate-600">
                sl {c.slAtr.toFixed(2)}atr · tp {c.tpAtr.toFixed(2)}atr{c.htf ? ` · htf ${c.htf}` : ''} · by {c.author}
              </div>
            </div>
          );
        })}
      </div>

      {/* leaderboard de candidatos */}
      {board.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Candidatos em teste</div>
          {board.map((b, i) => (
            <div key={`${b.symbol}-${b.name}-${i}`} className="flex items-center justify-between text-[10px]">
              <span className="mono truncate text-slate-400">
                {b.symbol} {b.name}
              </span>
              <span className="mono shrink-0 text-slate-500">
                {pct(b.winRate)} <span className="text-sky-400">/ {pct(b.validationWinRate)}</span> · {b.expectancyR.toFixed(2)}R
              </span>
            </div>
          ))}
        </div>
      )}

      {/* descobertas */}
      {findings.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Descobertas</div>
          {findings.map((f, i) => (
            <div key={`${f.at}-${i}`} className="text-[10px] leading-snug">
              <span className="mono text-slate-500">{f.author}</span>{' '}
              <span className={TONE[f.tone] ?? 'text-slate-300'}>{f.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useStore } from '../state/store';
import { px } from '../lib/format';

const STAGES = [
  { key: 'DETECTED', label: 'Scout', emoji: '👁' },
  { key: 'TECHNICAL', label: 'Technical', emoji: '📈' },
  { key: 'MACRO', label: 'Macro', emoji: '🌎' },
  { key: 'QUANT', label: 'Quant', emoji: '🧮' },
  { key: 'RISK', label: 'Risk', emoji: '🛡' },
  { key: 'PORTFOLIO', label: 'Portfolio', emoji: '📊' },
  { key: 'EXECUTION', label: 'Execution', emoji: '🤖' },
];

function Bar({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <div className="flex justify-between text-[9px] uppercase tracking-[0.16em] text-slate-500">
        <span>{label}</span>
        <span className="mono text-slate-300">{value ?? '—'}{value !== undefined ? '/100' : ''}</span>
      </div>
      <div className="mt-1 h-1 w-full rounded bg-white/5">
        <div
          className="h-full rounded transition-all duration-500"
          style={{
            width: `${value ?? 0}%`,
            background: (value ?? 0) > 65 ? '#4ade80' : (value ?? 0) > 45 ? '#f5a524' : '#f05252',
          }}
        />
      </div>
    </div>
  );
}

export function PipelinePanel() {
  const ops = useStore((s) => s.opportunities);
  const op = ops.find((o) => o.status === 'UNDER_REVIEW' || o.status === 'APPROVED') ?? ops[0];
  const stageIndex = op ? STAGES.findIndex((s) => s.key === op.stage) : -1;
  const done = op?.stage === 'DONE';

  return (
    <div className="glass flex flex-col gap-3 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <span className="panel-title">Analysis pipeline</span>
        {op && (
          <span
            className={`chip ${
              op.status === 'EXECUTED'
                ? 'border-emerald-400/40 text-emerald-300'
                : op.status === 'REJECTED'
                  ? 'border-rose-400/40 text-rose-300'
                  : 'border-amber-400/40 text-amber-300'
            }`}
          >
            {op.status.replace('_', ' ')}
          </span>
        )}
      </div>

      {!op ? (
        <div className="py-6 text-center text-[11px] text-slate-500">Scouts are watching the tape…</div>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Opportunity #{op.number}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[17px] font-bold tracking-wide text-slate-100">{op.symbol}</span>
                <span className={`text-[13px] font-bold ${op.side === 'BUY' ? 'text-emerald-300' : 'text-rose-300'}`}>{op.side}</span>
                {op.aiAssisted && <span className="chip border-violet-400/40 text-violet-300">AI</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="mono text-[16px] text-slate-200">{px(op.entry ?? op.price, 5)}</div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500">{op.momentum} · {op.volatility} vol</div>
            </div>
          </div>

          {op.brain && (
            <div
              className="flex items-start gap-2 rounded border px-2 py-1.5"
              style={{
                borderColor: op.brain.verdict === 'AVOID' ? 'rgba(240,82,82,0.3)' : op.brain.verdict === 'TAKE' ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)',
                background: op.brain.verdict === 'AVOID' ? 'rgba(240,82,82,0.07)' : op.brain.verdict === 'TAKE' ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)',
              }}
            >
              <span className="text-[12px]">🧠</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">Agent memory</span>
                  <span
                    className="mono text-[11px] font-bold"
                    style={{ color: op.brain.delta > 0 ? '#86efac' : op.brain.delta < 0 ? '#fca5a5' : '#94a3b8' }}
                  >
                    {op.brain.delta > 0 ? '+' : ''}
                    {op.brain.delta} conf
                  </span>
                  <span className="chip ml-auto">{op.brain.verdict}</span>
                </div>
                <div className="text-[10px] leading-snug text-slate-400">{op.brain.reason}</div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Bar label="Technical" value={op.scores.technical} />
            <Bar label="Macro" value={op.scores.macro} />
            <Bar label="Quant" value={op.scores.quant} />
            <Bar label="Confidence" value={op.scores.confidence} />
          </div>

          <div className="grid grid-cols-4 gap-2 border-y border-white/5 py-2 text-center">
            {[
              ['Risk', op.riskPct !== undefined ? `${op.riskPct}%` : '—'],
              ['R:R', op.riskReward ? `1:${op.riskReward}` : '—'],
              ['Size', op.lots ? `${op.lots}` : '—'],
              ['Exp.', op.expectedMovePct !== undefined ? `${op.expectedMovePct}%` : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-[8px] uppercase tracking-[0.16em] text-slate-500">{k}</div>
                <div className="mono text-[12px] text-slate-200">{v}</div>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {STAGES.map((s, i) => {
              const active = i === stageIndex && !done;
              const passed = done ? op.status !== 'REJECTED' || i < 4 : i < stageIndex;
              const rejected = op.status === 'REJECTED' && s.key === 'RISK';
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded text-[10px] ${
                      rejected
                        ? 'bg-rose-500/20 text-rose-300'
                        : active
                          ? 'bg-amber-400/20 text-amber-300'
                          : passed
                            ? 'bg-emerald-400/15 text-emerald-300'
                            : 'bg-white/5 text-slate-600'
                    }`}
                  >
                    {s.emoji}
                  </span>
                  <span
                    className={`text-[11px] ${
                      rejected ? 'text-rose-300' : active ? 'text-amber-200' : passed ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {s.label}
                  </span>
                  {active && <span className="pulse-soft ml-auto text-[9px] uppercase tracking-wider text-amber-300">working…</span>}
                  {rejected && <span className="ml-auto text-[9px] uppercase tracking-wider text-rose-300">veto</span>}
                </div>
              );
            })}
          </div>

          {op.status === 'REJECTED' && op.rejectionReason && (
            <div className="rounded border border-rose-400/25 bg-rose-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-rose-200">
              {op.rejectionReason}
            </div>
          )}
          {(op.status === 'EXECUTED' || op.status === 'APPROVED') && (
            <div className="grid grid-cols-3 gap-2 rounded border border-emerald-400/20 bg-emerald-400/5 px-2 py-1.5 text-center">
              {[
                ['Entry', px(op.entry, 5)],
                ['Stop', px(op.stopLoss, 5)],
                ['Target', px(op.takeProfit, 5)],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-[8px] uppercase tracking-[0.16em] text-emerald-500/70">{k}</div>
                  <div className="mono text-[11px] text-emerald-200">{v}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

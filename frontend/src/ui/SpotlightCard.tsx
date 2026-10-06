import { useStore } from '../state/store';
import { money, STATE_COLOR } from '../lib/format';

/**
 * Lower-third de transmissão: aparece sempre que a direção de câmera está
 * num agente, com o essencial para quem assiste a live entender a cena.
 */
export function SpotlightCard() {
  const spotlight = useStore((s) => s.spotlight);
  const agent = useStore((s) => s.agents.find((a) => a.id === spotlight?.agentId));
  const meta = useStore((s) => (agent ? s.roleMeta[agent.role] : undefined));
  const prices = useStore((s) => s.prices);
  if (!spotlight || !agent) return null;

  const color = STATE_COLOR[agent.state] ?? '#64748b';
  const day = agent.daily?.realized ?? 0;
  const price = agent.symbol ? prices[agent.symbol] : undefined;

  return (
    <div className="pointer-events-none w-full max-w-[min(92vw,460px)]">
      <div
        key={agent.id}
        className="slide-in overflow-hidden rounded-lg border border-white/10 bg-[#0b1119]/[0.92] shadow-panel backdrop-blur-xl"
        style={{ borderLeft: `4px solid ${color}` }}
      >
        <div className="flex items-center gap-3 px-3 py-2">
          <span className="text-[20px] leading-none">{meta?.emoji ?? '👤'}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold leading-tight text-slate-50">{agent.name}</span>
              <span
                className="rounded px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.12em]"
                style={{ color: '#06121b', background: color }}
              >
                {agent.state}
              </span>
            </div>
            <div className="truncate text-[10px] uppercase tracking-[0.18em]" style={{ color: meta?.accent ?? '#7dd3fc' }}>
              {meta?.label ?? agent.role}
              {agent.symbol ? ` · ${agent.symbol}` : ''}
              {price ? ` · ${price.bid.toFixed(price.digits)}` : ''}
            </div>
          </div>
          <div className="ml-auto shrink-0 text-right">
            <div className="text-[8px] uppercase tracking-[0.16em] text-slate-500">dia</div>
            <div className={`mono text-[15px] font-semibold leading-tight ${day >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {money(day)}
            </div>
            <div className="text-[9px] text-slate-500">
              {agent.daily?.wins ?? 0}W/{agent.daily?.losses ?? 0}L · {agent.daily?.trades ?? 0}t
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-white/5 bg-black/20 px-3 py-1.5 text-[10px]">
          {agent.openSymbol ? (
            <span
              className="mono rounded px-1.5 py-[2px] font-semibold"
              style={{
                color: agent.openPnl >= 0 ? '#6ee7b7' : '#fda4af',
                background: agent.openPnl >= 0 ? 'rgba(16,185,129,0.14)' : 'rgba(244,63,94,0.14)',
              }}
            >
              ● AO VIVO {agent.openSymbol} {money(agent.openPnl)}
            </span>
          ) : (
            <span className="rounded bg-white/5 px-1.5 py-[2px] text-slate-400">sem posição aberta</span>
          )}
          <span className="min-w-0 flex-1 truncate text-slate-400">{agent.statusLine ?? spotlight.reason}</span>
          <span className="shrink-0 text-[8px] uppercase tracking-[0.2em] text-slate-600">{spotlight.shot}</span>
        </div>
      </div>
    </div>
  );
}

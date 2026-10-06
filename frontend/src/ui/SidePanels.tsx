import { useStore } from '../state/store';
import { api } from '../lib/api';
import { countdown, STATE_COLOR } from '../lib/format';

export function NewsPanel() {
  const news = useStore((s) => s.news);
  const simNow = useStore((s) => s.simNow);
  return (
    <div className="glass max-h-[26vh] overflow-y-auto rounded-lg p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="panel-title">News room · calendar</span>
        <span className="chip border-amber-400/30 text-amber-300">macro</span>
      </div>
      <div className="space-y-1.5">
        {news.slice(0, 7).map((n) => {
          const delta = n.at - simNow;
          const color = n.impact === 'HIGH' ? '#f05252' : n.impact === 'MEDIUM' ? '#f5a524' : '#64748b';
          return (
            <div key={n.id} className="flex items-center gap-2">
              <span className="h-3 w-[3px] rounded" style={{ background: color }} />
              <span className="mono w-8 text-[10px] text-slate-400">{n.currency}</span>
              <span className={`flex-1 truncate text-[11px] ${n.released ? 'text-slate-500' : 'text-slate-200'}`}>{n.title}</span>
              {n.released ? (
                <span className="mono text-[10px] text-slate-400">
                  {n.actual} <span className="text-slate-600">vs {n.forecast}</span>
                </span>
              ) : (
                <span className="mono text-[10px]" style={{ color }}>
                  {countdown(delta)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AgentInspector({ onOpenChart, onOpenBrain }: { onOpenChart: (symbol: string) => void; onOpenBrain: (agentId: string) => void }) {
  const id = useStore((s) => s.selectedAgentId);
  const agent = useStore((s) => s.agents.find((a) => a.id === id));
  const roleMeta = useStore((s) => s.roleMeta);
  const desks = useStore((s) => s.desks);
  const select = useStore((s) => s.select);
  const focusDesk = useStore((s) => s.focusDesk);
  if (!agent) return null;
  const meta = roleMeta[agent.role];
  const desk = desks.find((d) => d.id === agent.deskId);

  return (
    <div className="glass rounded-lg p-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span>{meta?.emoji}</span>
            <span className="text-[13px] font-semibold text-slate-100">{agent.name}</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: meta?.accent }}>
            {meta?.label} {agent.symbol ? `· ${agent.symbol}` : ''}
          </div>
        </div>
        <button className="text-[11px] text-slate-500 hover:text-slate-200" onClick={() => select(null)}>
          ✕
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full pulse-soft" style={{ background: STATE_COLOR[agent.state] }} />
        <span className="text-[11px] text-slate-300">{agent.statusLine}</span>
        <span className="chip ml-auto" style={{ color: STATE_COLOR[agent.state], borderColor: `${STATE_COLOR[agent.state]}55` }}>
          {agent.state}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded border border-white/8 bg-black/30 px-2 py-1.5">
          <div className="text-[8px] uppercase tracking-[0.14em] text-slate-500">Open entry (max 1)</div>
          {agent.openSymbol ? (
            <div className="mono text-[13px]" style={{ color: agent.openPnl >= 0 ? '#4ade80' : '#f05252' }}>
              {agent.openSymbol} {agent.openPnl >= 0 ? '+' : '-'}${Math.abs(agent.openPnl).toFixed(2)}
            </div>
          ) : (
            <div className="mono text-[13px] text-slate-500">free slot</div>
          )}
        </div>
        <div className="rounded border border-white/8 bg-black/30 px-2 py-1.5">
          <div className="text-[8px] uppercase tracking-[0.14em] text-slate-500">Day result</div>
          <div className="mono text-[13px]" style={{ color: (agent.daily?.realized ?? 0) >= 0 ? '#86efac' : '#fca5a5' }}>
            {(agent.daily?.realized ?? 0) >= 0 ? '+' : '-'}${Math.abs(agent.daily?.realized ?? 0).toFixed(2)}
            <span className="ml-1 text-[9px] text-slate-500">
              {agent.daily?.wins ?? 0}W/{agent.daily?.losses ?? 0}L
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2 border-y border-white/5 py-2 text-center">
        {[
          ['Analyses', agent.stats.analyses],
          ['Approved', agent.stats.approvals],
          ['Vetoed', agent.stats.rejections],
          ['Trades', agent.stats.trades],
        ].map(([k, v]) => (
          <div key={k as string}>
            <div className="text-[8px] uppercase tracking-[0.14em] text-slate-500">{k}</div>
            <div className="mono text-[13px] text-slate-200">{v as number}</div>
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-1.5 text-[10px] text-slate-400">
        <div className="flex justify-between">
          <span>Desk</span>
          <span className="text-slate-300">{desk?.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-24">Aggressiveness</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            defaultValue={agent.config.aggressiveness}
            onMouseUp={(e) => api.updateAgent(agent.id, { config: { aggressiveness: Number((e.target as HTMLInputElement).value) } })}
            className="flex-1 accent-emerald-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-24">Max risk %</span>
          <input
            type="range"
            min={0.1}
            max={2}
            step={0.1}
            defaultValue={agent.config.maxRiskPct}
            onMouseUp={(e) => api.updateAgent(agent.id, { config: { maxRiskPct: Number((e.target as HTMLInputElement).value) } })}
            className="flex-1 accent-emerald-400"
          />
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            defaultChecked={agent.config.useAI}
            onChange={(e) => api.updateAgent(agent.id, { config: { useAI: e.target.checked } })}
            className="accent-violet-400"
          />
          Use local LLM for this agent
        </label>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="btn flex-1" onClick={() => focusDesk(agent.deskId, agent.id, 'Manual focus')}>
          🎥 Focus
        </button>
        {agent.symbol && (
          <button className="btn flex-1" onClick={() => onOpenChart(agent.symbol!)}>
            📈 Chart
          </button>
        )}
        <button className="btn flex-1" onClick={() => onOpenBrain(agent.id)} title="Memória de aprendizado deste agente">
          🧠 Brain
        </button>
        <button className="btn btn-danger" onClick={() => api.fire(agent.id).then(() => select(null))}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function MarketRail() {
  const prices = useStore((s) => s.prices);
  return (
    <div className="glass flex items-center gap-4 overflow-x-auto rounded-lg px-3 py-1.5">
      {Object.values(prices).map((p) => (
        <div key={p.symbol} className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-[10px] font-semibold tracking-wider text-slate-400">{p.symbol}</span>
          <span className={`mono text-[12px] ${p.change >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{p.bid.toFixed(p.digits)}</span>
          <span className={`mono text-[9px] ${p.change >= 0 ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
            {p.change >= 0 ? '+' : ''}
            {p.change.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

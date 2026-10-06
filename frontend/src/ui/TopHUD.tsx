import { useStore } from '../state/store';
import { countdown, money, signed } from '../lib/format';

function Stat({
  label,
  value,
  tone = 'text-slate-100',
  sub,
  hideBelow,
}: {
  label: string;
  value: string;
  tone?: string;
  sub?: string;
  hideBelow?: 'lg' | 'xl';
}) {
  const vis = hideBelow === 'lg' ? 'hidden lg:block' : hideBelow === 'xl' ? 'hidden xl:block' : '';
  return (
    <div className={`min-w-[78px] shrink-0 px-3 py-1 ${vis}`}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mono text-[15px] font-semibold leading-tight ${tone}`}>{value}</div>
      {sub && <div className="text-[9px] text-slate-500">{sub}</div>}
    </div>
  );
}

/** Abre o backoffice (outra aba) na seção pedida. */
const openAdmin = (section = 'integracoes') => window.open(`/admin#${section}`, '_blank');

export function TopHUD({
  onOpenSettings = (tab) => openAdmin(tab === 'ai' ? 'ia' : 'integracoes'),
  onOpenHire = () => openAdmin('agentes'),
}: {
  onOpenSettings?: (tab?: 'mt5' | 'ai') => void;
  onOpenHire?: () => void;
} = {}) {
  const { account, config, simNow, nextNews, connected, mt5Connected, agents, banner, ai } = useStore();
  const aiOn = !!ai?.enabled;
  const aiAgents = agents.filter((a) => a.config?.useAI).length;
  const pnl = account?.dayPnl ?? 0;
  const live = config.executionMode === 'MT5_LIVE' && mt5Connected;

  return (
    <div className="pointer-events-auto flex items-stretch gap-2 pr-[200px]">
      <div className="glass flex shrink-0 items-center rounded-lg px-3 py-1.5">
        <div className="pr-3">
          <div className="text-[15px] font-bold tracking-[0.26em] text-slate-100">AXE CAPITAL</div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Autonomous FX Desk</div>
        </div>
        <div className="h-9 w-px bg-white/10" />
        <div className="flex items-center gap-2 pl-3">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 pulse-soft' : 'bg-rose-500'}`} />
          <span className="text-[10px] uppercase tracking-wider text-slate-400">{connected ? 'engine online' : 'reconnecting'}</span>
          <button
            className={`chip transition hover:brightness-125 ${live ? 'border-rose-400/40 text-rose-300' : 'border-emerald-400/30 text-emerald-300'}`}
            title={live ? 'Ordens roteadas para o seu MetaTrader 5 — clique para gerenciar' : 'Clique para conectar o MetaTrader 5'}
            onClick={() => onOpenSettings('mt5')}
          >
            {live ? 'MT5 LIVE' : mt5Connected ? 'MT5 PRONTO' : 'SIMULATION'}
          </button>
          <button
            className={`chip transition hover:brightness-125 ${aiOn ? 'border-violet-400/40 text-violet-300' : 'border-slate-500/40 text-slate-400'}`}
            title="Provider de IA dos agentes — clique para trocar"
            onClick={() => onOpenSettings('ai')}
          >
            🧠 {aiOn ? `${ai?.provider ?? 'ai'} · ${(ai?.model ?? '').slice(0, 18) || 'model'}${aiAgents ? ` · ${aiAgents}` : ''}` : 'IA desligada'}
          </button>
        </div>
      </div>

      <div className="glass flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg">
        <div className="flex min-w-0 items-center divide-x divide-white/5 overflow-x-auto">
          <Stat label="Balance" value={money(account?.balance ?? 0)} />
          <Stat label="Equity" value={money(account?.equity ?? 0)} />
          <Stat label="Day P&L" value={signed(pnl)} tone={pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
          <Stat label="Open" value={String(account?.openPositions ?? 0)} sub="positions" />
          <Stat label="Trades" value={String(account?.tradesToday ?? 0)} sub="today" hideBelow="lg" />
          <Stat label="Win rate" value={`${account?.winRate ?? 0}%`} tone="text-sky-300" />
          <Stat
            label="Risk"
            value={account?.riskLevel ?? 'LOW'}
            tone={account?.riskLevel === 'LOW' ? 'text-emerald-300' : account?.riskLevel === 'HIGH' ? 'text-rose-300' : 'text-amber-300'}
            sub={`exposure ${account?.exposurePct?.toFixed(1) ?? '0.0'}%`}
          />
          <Stat label="Staff" value={String(agents.length)} sub="agents on floor" hideBelow="xl" />
        </div>
        <div className="flex shrink-0 items-center gap-2 px-3">
          {nextNews && (
            <div className="flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-1">
              <span className="text-[11px]">⚠</span>
              <div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-amber-300/80">
                  {nextNews.currency} {nextNews.title}
                </div>
                <div className="mono text-[13px] font-semibold text-amber-200">{countdown(nextNews.at - simNow)}</div>
              </div>
            </div>
          )}
          <div className="mono rounded-md border border-white/10 bg-black/40 px-2.5 py-1 text-[13px] text-slate-300">
            {new Date(simNow).toISOString().slice(11, 19)}
            <span className="ml-1 text-[9px] text-slate-500">UTC</span>
          </div>
          <button className="btn" onClick={onOpenHire}>
            + Hire agent
          </button>
          <button className="btn" onClick={() => onOpenSettings('mt5')}>
            ⚙ Setup
          </button>
        </div>
      </div>

      {banner && Date.now() - banner.at < 6000 && (
        <div
          className={`glass slide-in absolute left-1/2 top-[70px] -translate-x-1/2 rounded-md px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] ${
            banner.tone === 'good' ? 'text-emerald-300' : banner.tone === 'bad' ? 'text-rose-300' : 'text-amber-300'
          }`}
        >
          {banner.text}
        </div>
      )}
    </div>
  );
}

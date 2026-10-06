import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { api } from '../lib/api';
import { useStore } from '../state/store';
import type { AgentRole, SymbolInfo } from '../types';

const ROLES: AgentRole[] = [
  'MARKET_SCOUT',
  'TECHNICAL_ANALYST',
  'MACRO_ANALYST',
  'QUANT_ANALYST',
  'RISK_MANAGER',
  'PORTFOLIO_MANAGER',
  'TRADER',
  'NEWS_ANALYST',
];

export function HireAgentModal({ onClose }: { onClose: () => void }) {
  const roleMeta = useStore((s) => s.roleMeta);
  const agents = useStore((s) => s.agents);
  const desks = useStore((s) => s.desks);
  const [role, setRole] = useState<AgentRole>('MARKET_SCOUT');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [deskId, setDeskId] = useState('');
  const [aggressiveness, setAggr] = useState(0.5);
  const [maxRiskPct, setRisk] = useState(0.5);
  const [useAI, setUseAI] = useState(false);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [source, setSource] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .symbols()
      .then((r) => {
        setSymbols(r.symbols);
        setSource(r.source);
        if (!symbol && r.symbols[0]) setSymbol(r.symbols[0].symbol);
      })
      .catch((e) => setError(String(e.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const takenDesks = useMemo(() => new Set(agents.map((a) => a.deskId)), [agents]);
  const freeDesks = desks.filter((d) => !takenDesks.has(d.id));
  const needsSymbol = role === 'MARKET_SCOUT' || role === 'TECHNICAL_ANALYST' || role === 'QUANT_ANALYST';
  const filtered = symbols.filter((s) => s.symbol.toLowerCase().includes(filter.toLowerCase()) || s.description.toLowerCase().includes(filter.toLowerCase()));

  const hire = async () => {
    setBusy(true);
    setError('');
    try {
      await api.hire({
        role,
        name: name || undefined,
        symbol: needsSymbol ? symbol : undefined,
        deskId: deskId || undefined,
        aggressiveness,
        maxRiskPct,
        useAI,
      });
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'could not hire');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Hire an agent"
      subtitle="Staff the floor. Instruments are pulled from the connected MetaTrader 5 account when the bridge is online."
      onClose={onClose}
      wide
    >
      <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="panel-title mb-2">Role</div>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => {
              const meta = roleMeta[r];
              const active = role === r;
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`rounded-lg border p-2 text-left transition ${
                    active ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/8 bg-white/[0.02] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{meta?.emoji}</span>
                    <span className="text-[11px] font-semibold text-slate-100">{meta?.label ?? r}</span>
                  </div>
                  <div className="mt-0.5 text-[9px] leading-snug text-slate-500">{meta?.blurb}</div>
                  <div className="mt-1 text-[8px] uppercase tracking-wider text-slate-600">
                    {agents.filter((a) => a.role === r).length} on floor
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="panel-title mb-1">Name (optional)</div>
            <input className="field" value={name} placeholder="auto-generated" onChange={(e) => setName(e.target.value)} />
          </div>

          {needsSymbol && (
            <div>
              <div className="panel-title mb-1 flex items-center justify-between">
                <span>Instrument</span>
                <span className="chip border-sky-400/30 text-sky-300">{source || '...'}</span>
              </div>
              <input className="field mb-1" placeholder="filter symbols…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <select className="field h-40" size={8} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {filtered.map((s) => (
                  <option key={s.symbol} value={s.symbol} className="bg-[#0b1016]">
                    {s.symbol} — {s.description}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="panel-title mb-1">Desk</div>
            <select className="field" value={deskId} onChange={(e) => setDeskId(e.target.value)}>
              <option value="" className="bg-[#0b1016]">
                Auto-assign best free desk
              </option>
              {freeDesks.map((d) => (
                <option key={d.id} value={d.id} className="bg-[#0b1016]">
                  {d.label} · {d.sector.replace('_', ' ').toLowerCase()} · {d.monitors} monitors
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-[10px] uppercase tracking-wider text-slate-400">
              Aggressiveness {aggressiveness.toFixed(2)}
              <input type="range" min={0} max={1} step={0.05} value={aggressiveness} onChange={(e) => setAggr(Number(e.target.value))} className="w-full accent-emerald-400" />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-slate-400">
              Max risk {maxRiskPct.toFixed(2)}%
              <input type="range" min={0.1} max={2} step={0.1} value={maxRiskPct} onChange={(e) => setRisk(Number(e.target.value))} className="w-full accent-emerald-400" />
            </label>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-slate-300">
            <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} className="accent-violet-400" />
            Let this agent think with the local LLM (LM Studio / custom provider)
          </label>

          {error && <div className="rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-accent" disabled={busy || (!freeDesks.length)} onClick={hire}>
              {busy ? 'Hiring…' : 'Hire agent'}
            </button>
          </div>
          {!freeDesks.length && <div className="text-right text-[10px] text-amber-400">All desks are occupied — dismiss someone first.</div>}
        </div>
      </div>
    </Modal>
  );
}

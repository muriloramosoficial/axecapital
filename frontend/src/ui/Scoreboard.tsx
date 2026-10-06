import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { money } from '../lib/format';

/**
 * Placar rotativo para a transmissão: troca de aba sozinho a cada ~10s,
 * mostrando ranking de P&L, precisão, atividade e o laboratório.
 */

const PAGE_MS = 10_000;

type Row = { id: string; name: string; role: string; main: string; sub: string; tone: 'good' | 'bad' | 'neutral'; value: number };

export function Scoreboard({ compact = false }: { compact?: boolean }) {
  const agents = useStore((s) => s.agents);
  const roleMeta = useStore((s) => s.roleMeta);
  const lab = useStore((s) => s.lab);
  const select = useStore((s) => s.select);
  const [page, setPage] = useState(0);
  const [tick, setTick] = useState(0);

  const pages = useMemo(() => {
    const list = Object.values(agents);
    const pnl: Row[] = list
      .map((a) => {
        const total = (a.daily?.realized ?? 0) + (a.openPnl ?? 0);
        return {
          id: a.id,
          name: a.name,
          role: a.role,
          main: `${total >= 0 ? '+' : ''}${money(total)}`,
          sub: `${a.daily?.trades ?? 0} trades${a.openPnl ? ' · aberta' : ''}`,
          tone: (total > 0 ? 'good' : total < 0 ? 'bad' : 'neutral') as Row['tone'],
          value: total,
        };
      })
      .sort((a, b) => b.value - a.value);

    const acc: Row[] = list
      .filter((a) => (a.daily?.trades ?? 0) > 0)
      .map((a) => {
        const wr = (a.daily.wins / Math.max(1, a.daily.trades)) * 100;
        return {
          id: a.id,
          name: a.name,
          role: a.role,
          main: `${wr.toFixed(0)}%`,
          sub: `${a.daily.wins}V / ${a.daily.losses}D`,
          tone: (wr >= 50 ? 'good' : 'bad') as Row['tone'],
          value: wr,
        };
      })
      .sort((a, b) => b.value - a.value);

    const work: Row[] = list
      .map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        main: String(a.stats?.analyses ?? 0),
        sub: `${a.stats?.approvals ?? 0} aprov · ${a.stats?.rejections ?? 0} veto`,
        tone: 'neutral' as const,
        value: a.stats?.analyses ?? 0,
      }))
      .sort((a, b) => b.value - a.value);

    const labRows: Row[] = (lab?.champions ?? []).map((c) => ({
      id: c.id,
      name: `${c.symbol} · ${c.name}`,
      role: 'STRATEGY_DEVELOPER',
      main: `${c.expectancyR.toFixed(2)}R`,
      sub: `IS ${(c.winRate * 100).toFixed(0)}% · OOS ${(c.validation.winRate * 100).toFixed(0)}%`,
      tone: 'good' as const,
      value: c.expectancyR,
    }));

    const out = [
      { key: 'pnl', title: 'Ranking · P&L do dia', rows: pnl },
      { key: 'acc', title: 'Ranking · precisão', rows: acc },
      { key: 'work', title: 'Ranking · produção', rows: work },
    ];
    if (labRows.length) out.push({ key: 'lab', title: 'Research lab · setups', rows: labRows });
    return out.filter((p) => p.rows.length);
  }, [agents, lab]);

  useEffect(() => {
    const id = setInterval(() => {
      setPage((p) => p + 1);
      setTick(0);
    }, PAGE_MS);
    const t = setInterval(() => setTick((v) => v + 100), 100);
    return () => {
      clearInterval(id);
      clearInterval(t);
    };
  }, []);

  if (!pages.length) return null;
  const current = pages[page % pages.length];
  const rows = current.rows.slice(0, compact ? 5 : 7);

  return (
    <div className="glass w-[min(32vw,330px)] overflow-hidden rounded-lg">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="panel-title">{current.title}</span>
        <div className="flex gap-1">
          {pages.map((p, i) => (
            <button
              key={p.key}
              aria-label={p.title}
              onClick={() => {
                setPage(i);
                setTick(0);
              }}
              className={`h-1.5 w-1.5 rounded-full ${i === page % pages.length ? 'bg-sky-300' : 'bg-white/20'}`}
            />
          ))}
        </div>
      </div>
      <div className="h-[2px] w-full bg-white/5">
        <div className="h-full bg-sky-400/70 transition-all duration-100" style={{ width: `${(tick / PAGE_MS) * 100}%` }} />
      </div>
      <div key={current.key} className="slide-in divide-y divide-white/[0.04]">
        {rows.map((r, i) => (
          <div
            key={r.id}
            className="flex cursor-pointer items-center gap-2 px-3 py-[5px] hover:bg-white/[0.04]"
            onClick={() => select(r.id)}
          >
            <span
              className={`mono w-4 text-[10px] ${i === 0 ? 'text-amber-300' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-300' : 'text-slate-600'}`}
            >
              {i + 1}
            </span>
            <span className="text-[11px]">{roleMeta[r.role]?.emoji ?? '•'}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] text-slate-200">{r.name}</div>
              <div className="truncate text-[9px] uppercase tracking-[0.12em] text-slate-600">{r.sub}</div>
            </div>
            <span
              className={`mono text-[12px] ${r.tone === 'good' ? 'text-emerald-300' : r.tone === 'bad' ? 'text-rose-300' : 'text-slate-300'}`}
            >
              {r.main}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { money } from '../lib/format';
import type { ClosedTrade } from '../types';

/**
 * Lower-third de resultado: toda vez que uma posição é encerrada, entra um
 * card animado com o par, o R obtido, o agente responsável e o acumulado do
 * dia dele. É o momento mais "assistível" da transmissão.
 */

const HOLD_MS = 7000;

export function ResultCard() {
  const closed = useStore((s) => s.closed);
  const roleMeta = useStore((s) => s.roleMeta);
  const select = useStore((s) => s.select);
  const [card, setCard] = useState<ClosedTrade | null>(null);
  const lastId = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  const latest = closed[0];
  useEffect(() => {
    if (!latest || latest.id === lastId.current) return;
    lastId.current = latest.id;
    setCard(latest);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCard(null), HOLD_MS);
  }, [latest?.id]);

  if (!card) return null;
  const win = card.pnl > 0;
  const flat = Math.abs(card.pnl) <= 0.5;
  const accent = flat ? '#94a3b8' : win ? '#2ee08a' : '#ff4d5e';
  const meta = card.role ? roleMeta[card.role] : undefined;
  const mins = Math.max(1, Math.round(card.durationMs / 60000));

  return (
    <div className="pointer-events-none flex w-full justify-center px-2">
      <div
        className="pointer-events-auto flex cursor-pointer items-stretch overflow-hidden rounded-lg border shadow-panel backdrop-blur-md"
        style={{ borderColor: `${accent}55`, background: 'rgba(7,12,19,0.9)' }}
        onClick={() => card.agentId && select(card.agentId)}
      >
        {/* faixa de resultado */}
        <div className="flex w-[84px] flex-col items-center justify-center px-2 py-2.5" style={{ background: `${accent}1f` }}>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: accent }}>
            {flat ? 'flat' : win ? 'win' : 'loss'}
          </span>
          <span className="mono text-[20px] font-semibold" style={{ color: accent }}>
            {card.rMultiple !== undefined ? `${card.rMultiple > 0 ? '+' : ''}${card.rMultiple.toFixed(2)}R` : money(card.pnl)}
          </span>
        </div>

        <div className="flex flex-col justify-center gap-0.5 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="mono text-[15px] text-slate-100">{card.symbol}</span>
            <span className={`chip ${card.side === 'BUY' ? 'border-emerald-400/30 text-emerald-300' : 'border-rose-400/30 text-rose-300'}`}>
              {card.side}
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
              {card.reason === 'TAKE_PROFIT' ? 'take profit' : card.reason === 'STOP_LOSS' ? 'stop loss' : card.reason.toLowerCase()}
            </span>
            <span className="mono text-[11px]" style={{ color: accent }}>
              {card.pnl >= 0 ? '+' : ''}
              {money(card.pnl)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="mono">
              {card.entry} → {card.exit}
            </span>
            <span>· {card.lots} lot</span>
            <span>· {mins}min</span>
            {card.setupName && <span className="truncate text-sky-400/80">· {card.setupName}</span>}
          </div>
        </div>

        {/* assinatura do agente */}
        {card.agentName && (
          <div className="flex min-w-[150px] flex-col justify-center border-l border-white/5 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px]">{meta?.emoji ?? '•'}</span>
              <span className="text-[11px] font-semibold text-slate-200">{card.agentName}</span>
            </div>
            <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
              dia{' '}
              <span className={`mono ${(card.dailyTotal ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {(card.dailyTotal ?? 0) >= 0 ? '+' : ''}
                {money(card.dailyTotal ?? 0)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

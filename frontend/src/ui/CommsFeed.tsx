import { useStore } from '../state/store';
import { TONE_COLOR } from '../lib/format';

export function CommsFeed() {
  const chat = useStore((s) => s.chat);
  const roleMeta = useStore((s) => s.roleMeta);
  const select = useStore((s) => s.select);

  return (
    <div className="glass flex min-h-0 flex-1 flex-col rounded-lg">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="panel-title">Desk comms</span>
        <span className="chip border-emerald-400/25 text-emerald-300">live</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {chat.map((m) => (
          <div key={m.id} className="slide-in cursor-pointer" onClick={() => select(m.agentId)}>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]">{roleMeta[m.role]?.emoji ?? '•'}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: roleMeta[m.role]?.accent ?? '#94a3b8' }}>
                {m.agentName}
              </span>
              <span className="mono ml-auto text-[9px] text-slate-600">{new Date(m.at).toISOString().slice(11, 19)}</span>
            </div>
            <div className={`pl-[18px] text-[11px] leading-snug ${TONE_COLOR[m.tone]}`}>“{m.text}”</div>
          </div>
        ))}
        {!chat.length && <div className="py-6 text-center text-[11px] text-slate-500">Floor is quiet…</div>}
      </div>
    </div>
  );
}

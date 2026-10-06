import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

const KEY = 'axe.modeNotice.dismissed';

/**
 * First-run explanation when there is no MetaTrader 5 on the machine:
 * nothing is broken — the whole office simply runs on the internal engine.
 */
export function ModeNotice({ onOpenSettings }: { onOpenSettings: () => void }) {
  const mt5Connected = useStore((s) => s.mt5Connected);
  const connected = useStore((s) => s.connected);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!connected) return;
    const t = setTimeout(() => setHidden(localStorage.getItem(KEY) === '1' || mt5Connected), 1800);
    return () => clearTimeout(t);
  }, [connected, mt5Connected]);

  if (hidden || mt5Connected) return null;

  return (
    <div className="glass slide-in pointer-events-auto absolute bottom-[112px] left-1/2 z-30 w-[520px] -translate-x-1/2 rounded-lg border-sky-400/20 p-3">
      <div className="flex items-start gap-3">
        <span className="text-[18px]">🧪</span>
        <div className="flex-1">
          <div className="text-[12px] font-semibold text-sky-300">Rodando em modo SIMULATION</div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Nenhum MetaTrader 5 foi detectado nesta máquina — e isso não impede nada. Preços, candles, spreads,
            notícias, oportunidades, risco, execução, P&amp;L e o aprendizado dos agentes rodam no motor interno.
            Quando você instalar o MT5 e subir a ponte, o mesmo escritório passa a usar a conta logada e os ativos dela.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              className="btn"
              onClick={() => {
                localStorage.setItem(KEY, '1');
                setHidden(true);
              }}
            >
              Entendi, seguir simulando
            </button>
            <button className="btn" onClick={onOpenSettings}>
              ⚙ Como conectar o MT5
            </button>
          </div>
        </div>
        <button
          className="text-[11px] text-slate-500 hover:text-slate-200"
          onClick={() => {
            localStorage.setItem(KEY, '1');
            setHidden(true);
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Scene } from './three/Scene';
import { TopHUD } from './ui/TopHUD';
import { ControlBar } from './ui/ControlBar';
import { PipelinePanel } from './ui/PipelinePanel';
import { CommsFeed } from './ui/CommsFeed';
import { TradeJournal } from './ui/TradeJournal';
import { AgentInspector, MarketRail, NewsPanel } from './ui/SidePanels';
import { HireAgentModal } from './ui/HireAgentModal';
import { SettingsModal } from './ui/SettingsModal';
import { BrainModal } from './ui/BrainModal';
import { ModeNotice } from './ui/ModeNotice';
import { TradingViewWidget } from './three/TradingViewScreen';
import { connect, useStore } from './state/store';

export default function App() {
  const [hire, setHire] = useState(false);
  const [settings, setSettings] = useState<null | 'mt5' | 'ai'>(null);
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [brainAgent, setBrainAgent] = useState<string | null>(null);
  const connected = useStore((s) => s.connected);
  const tvEnabled = useStore((s) => s.tvEnabled);
  const setTv = useStore((s) => s.setTv);

  useEffect(() => {
    connect();
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#04060a]">
      <div className="absolute inset-0">
        <Scene />
      </div>

      {/* vignette + glass sheen over the office */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.6)_100%)]" />

      <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-3">
        <TopHUD onOpenSettings={(tab) => setSettings(tab ?? 'mt5')} onOpenHire={() => setHire(true)} />

        <div className="flex min-h-0 flex-1 gap-2">
          {/* left column */}
          <div className="pointer-events-auto flex w-[310px] flex-col gap-2">
            <PipelinePanel />
            <NewsPanel />
            <AgentInspector onOpenChart={setChartSymbol} onOpenBrain={setBrainAgent} />
          </div>

          <div className="flex-1" />

          {/* right column */}
          <div className="pointer-events-auto flex w-[330px] flex-col gap-2">
            <CommsFeed />
            <TradeJournal />
          </div>
        </div>

        <div className="pointer-events-auto">
          <MarketRail />
        </div>
        <ControlBar onToggleTv={() => setTv(!tvEnabled)} />
      </div>

      {!connected && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#04060a]/90">
          <div className="text-center">
            <div className="text-[13px] font-semibold uppercase tracking-[0.4em] text-slate-300">Axe Capital</div>
            <div className="mt-2 text-[11px] text-slate-500">connecting to the trading floor engine…</div>
          </div>
        </div>
      )}

      {chartSymbol && (
        <div className="pointer-events-auto absolute bottom-[90px] right-[350px] z-30 h-[340px] w-[520px] overflow-hidden rounded-lg border border-white/10 bg-[#05080d] shadow-panel">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
            <span className="panel-title">TradingView · {chartSymbol}</span>
            <button className="text-[11px] text-slate-500 hover:text-slate-200" onClick={() => setChartSymbol(null)}>
              ✕
            </button>
          </div>
          <div className="h-[300px]">
            <TradingViewWidget symbol={chartSymbol} />
          </div>
        </div>
      )}

      <ModeNotice onOpenSettings={() => setSettings('mt5')} />

      {brainAgent && <BrainModal agentId={brainAgent} onClose={() => setBrainAgent(null)} />}
      {hire && <HireAgentModal onClose={() => setHire(false)} />}
      {settings && <SettingsModal initialTab={settings} onClose={() => setSettings(null)} />}
    </div>
  );
}

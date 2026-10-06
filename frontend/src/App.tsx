import { useEffect, useState } from 'react';
import { Scene } from './three/Scene';
import { TopHUD } from './ui/TopHUD';
import { ControlBar } from './ui/ControlBar';
import { PipelinePanel } from './ui/PipelinePanel';
import { LabPanel } from './ui/LabPanel';
import { CommsFeed } from './ui/CommsFeed';
import { TradeJournal } from './ui/TradeJournal';
import { AgentInspector, MarketRail, NewsPanel } from './ui/SidePanels';
import { HireAgentModal } from './ui/HireAgentModal';
import { SettingsModal } from './ui/SettingsModal';
import { BrainModal } from './ui/BrainModal';
import { ModeNotice } from './ui/ModeNotice';
import { HudControls } from './ui/HudControls';
import { SpotlightCard } from './ui/SpotlightCard';
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
  const hudMode = useStore((s) => s.hudMode);
  const uiScale = useStore((s) => s.uiScale);

  useEffect(() => {
    connect();
  }, []);

  const showPanels = hudMode === 'full';
  const showHud = hudMode !== 'clean';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#8e9bad]">
      <div className="absolute inset-0">
        <Scene />
      </div>

      {/* subtle depth vignette over the office */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(10,16,24,0.38)_100%)]" />

      <HudControls />

      <div
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ width: `${100 / uiScale}%`, height: `${100 / uiScale}%`, transform: `scale(${uiScale})` }}
      >
        <div
          className={`flex h-full w-full flex-col gap-2 p-2 transition-opacity duration-300 sm:p-3 ${
            showHud ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <TopHUD onOpenSettings={(tab) => setSettings(tab ?? 'mt5')} onOpenHire={() => setHire(true)} />

          <div className="flex min-h-0 flex-1 gap-2">
            {/* left column */}
            {showPanels && (
              <div className="pointer-events-auto hidden min-h-0 w-[clamp(250px,20vw,340px)] flex-col gap-2 overflow-hidden lg:flex">
                <PipelinePanel />
                <NewsPanel />
                <AgentInspector onOpenChart={setChartSymbol} onOpenBrain={setBrainAgent} />
              </div>
            )}

            <div className="flex-1" />

            {/* right column */}
            {showPanels && (
              <div className="pointer-events-auto hidden min-h-0 w-[clamp(270px,22vw,360px)] flex-col gap-2 overflow-hidden xl:flex">
                <CommsFeed />
                <LabPanel />
                <TradeJournal />
              </div>
            )}
          </div>

          <div className="pointer-events-auto">
            <MarketRail />
          </div>
          {showPanels && <ControlBar onToggleTv={() => setTv(!tvEnabled)} />}
        </div>
      </div>

      {!connected && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0b1118]/[0.92]">
          <div className="text-center">
            <div className="text-[13px] font-semibold uppercase tracking-[0.4em] text-slate-200">Axe Capital</div>
            <div className="mt-2 text-[11px] text-slate-400">connecting to the trading floor engine…</div>
          </div>
        </div>
      )}

      {chartSymbol && showHud && (
        <div className="pointer-events-auto absolute bottom-[96px] right-3 z-30 h-[min(40vh,340px)] w-[min(42vw,520px)] overflow-hidden rounded-lg border border-white/10 bg-[#05080d] shadow-panel xl:right-[calc(clamp(270px,22vw,360px)+20px)]">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
            <span className="panel-title">TradingView · {chartSymbol}</span>
            <button className="text-[11px] text-slate-500 hover:text-slate-200" onClick={() => setChartSymbol(null)}>
              ✕
            </button>
          </div>
          <div className="h-[calc(100%-30px)]">
            <TradingViewWidget symbol={chartSymbol} />
          </div>
        </div>
      )}

      {showHud && <SpotlightCard />}
      {showHud && <ModeNotice onOpenSettings={() => setSettings('mt5')} />}

      {brainAgent && <BrainModal agentId={brainAgent} onClose={() => setBrainAgent(null)} />}
      {hire && <HireAgentModal onClose={() => setHire(false)} />}
      {settings && <SettingsModal initialTab={settings} onClose={() => setSettings(null)} />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Scene } from './three/Scene';
import { TopHUD } from './ui/TopHUD';
import { ControlBar } from './ui/ControlBar';
import { PipelinePanel } from './ui/PipelinePanel';
import { LabPanel } from './ui/LabPanel';
import { Scoreboard } from './ui/Scoreboard';
import { Captions } from './ui/Captions';
import { ResultCard } from './ui/ResultCard';
import { Watermark } from './ui/Watermark';
import { CommsFeed } from './ui/CommsFeed';
import { TradeJournal } from './ui/TradeJournal';
import { AgentInspector, BriefingPanel, MarketRail, NewsPanel, WirePanel } from './ui/SidePanels';
import { BrainModal } from './ui/BrainModal';
import { ModeNotice } from './ui/ModeNotice';
import { SpotlightCard } from './ui/SpotlightCard';
import { TradingViewWidget } from './three/TradingViewScreen';
import { connect, useStore } from './state/store';

/**
 * Tela principal = o escritório.
 *
 * Toda a configuração (MT5, IA, agentes, telão, quais painéis aparecem) mora
 * no backoffice, em /admin. Aqui em cima ficam só dois botões: ligar/desligar a
 * HUD e abrir o backoffice em outra aba.
 */
export default function App() {
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [brainAgent, setBrainAgent] = useState<string | null>(null);
  const connected = useStore((s) => s.connected);
  const uiScale = useStore((s) => s.uiScale);
  const hudOn = useStore((s) => s.hudOn);
  const prefs = useStore((s) => s.hudPrefs);
  const toggleHudOn = useStore((s) => s.toggleHudOn);

  useEffect(() => {
    connect();
  }, []);

  // H continua ligando/desligando a HUD; F entra em tela cheia
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'h' || e.key === 'H') toggleHudOn();
      else if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleHudOn]);

  const on = (k: keyof typeof prefs) => hudOn && prefs[k];
  const leftColumn = on('pipeline') || on('news') || on('briefing') || on('wire') || on('inspector') || on('scoreboard');
  const rightColumn = on('comms') || on('lab') || on('journal');

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#8e9bad]">
      <div className="absolute inset-0">
        <Scene />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(10,16,24,0.38)_100%)]" />

      {/* ── os dois únicos botões da tela principal ───────────────────── */}
      <div className="pointer-events-auto absolute right-3 top-3 z-50 flex items-center gap-2">
        <button
          onClick={toggleHudOn}
          title={`${hudOn ? 'Esconder' : 'Mostrar'} a HUD (tecla H) — o que aparece é definido no backoffice`}
          className={`glass flex h-9 items-center gap-2 rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${
            hudOn ? 'text-emerald-300' : 'text-slate-400 hover:text-slate-100'
          }`}
        >
          <span className="text-[13px]">{hudOn ? '▦' : '⬚'}</span>
          HUD
        </button>
        <a
          href="/admin"
          target="_blank"
          rel="noreferrer"
          title="Abrir o backoffice de configurações em outra aba"
          className="glass flex h-9 items-center gap-2 rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:text-sky-300"
        >
          <span className="text-[13px]">⚙</span>
          Admin
        </a>
      </div>

      <div
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ width: `${100 / uiScale}%`, height: `${100 / uiScale}%`, transform: `scale(${uiScale})` }}
      >
        <div
          className={`flex h-full w-full flex-col gap-2 p-2 transition-opacity duration-300 sm:p-3 ${
            hudOn ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          {on('topHud') ? <TopHUD /> : <div />}

          <div className="flex min-h-0 flex-1 gap-2">
            {leftColumn && (
              <div className="pointer-events-auto hidden min-h-0 w-[clamp(250px,20vw,340px)] flex-col gap-2 overflow-y-auto pr-0.5 lg:flex">
                {on('pipeline') && <PipelinePanel />}
                {on('news') && <NewsPanel />}
                {on('briefing') && <BriefingPanel />}
                {on('wire') && <WirePanel />}
                {on('inspector') && <AgentInspector onOpenChart={setChartSymbol} onOpenBrain={setBrainAgent} />}
                {on('scoreboard') && <Scoreboard compact />}
              </div>
            )}

            <div className="flex-1" />

            {rightColumn && (
              <div className="pointer-events-auto hidden min-h-0 w-[clamp(270px,22vw,360px)] flex-col gap-2 overflow-y-auto pr-0.5 xl:flex">
                {on('comms') && <CommsFeed />}
                {on('lab') && <LabPanel />}
                {on('journal') && <TradeJournal />}
              </div>
            )}
          </div>

          {on('marketRail') && (
            <div className="pointer-events-auto">
              <MarketRail />
            </div>
          )}
          {on('controlBar') && <ControlBar />}
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

      {chartSymbol && (
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

      {/* camada de transmissão */}
      {prefs.watermark && <Watermark />}
      {on('captions') && <Captions />}
      {on('resultCard') && <ResultCard />}
      {on('spotlight') && <SpotlightCard />}
      {on('modeNotice') && <ModeNotice onOpenSettings={() => window.open('/admin', '_blank')} />}

      {brainAgent && <BrainModal agentId={brainAgent} onClose={() => setBrainAgent(null)} />}
    </div>
  );
}

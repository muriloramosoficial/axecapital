import { useEffect, useMemo, useState } from 'react';
import { connect, useStore, HUD_CATALOG, type HudKey, type Quality, type RestMode } from '../state/store';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { AdminGate } from './AdminLogin';
import { SettingsModal } from '../ui/SettingsModal';
import { HireAgentModal } from '../ui/HireAgentModal';
import type { MarketRegime } from '../types';

/**
 * Backoffice da Axe Capital — tudo que é configuração sai da tela do
 * escritório e vive aqui: HUD, mesa, integrações (MT5 e IA), agentes, telão
 * e marca. Abre em /admin, numa aba separada, e conversa com a aba do
 * escritório por localStorage (as mudanças de HUD aplicam na hora).
 */

const SECTIONS = [
  { id: 'hud', label: 'HUD & transmissão', icon: '▦' },
  { id: 'mesa', label: 'Mesa & simulação', icon: '🎛' },
  { id: 'integracoes', label: 'MetaTrader 5', icon: '🔌' },
  { id: 'ia', label: 'Inteligência artificial', icon: '🧠' },
  { id: 'agentes', label: 'Agentes', icon: '👔' },
  { id: 'marca', label: 'Telão & marca', icon: '🎬' },
  { id: 'acesso', label: 'Acesso', icon: '🔒' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const SPEEDS = [1, 2, 5, 10, 20, 100];
const REGIMES: MarketRegime[] = ['TRENDING', 'RANGING', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'NEWS_SHOCK', 'LIQUIDITY_DROP'];
const CORNERS: { id: string; label: string }[] = [
  { id: 'tl', label: '↖ topo esq.' },
  { id: 'tr', label: '↗ topo dir.' },
  { id: 'bl', label: '↙ base esq.' },
  { id: 'br', label: '↘ base dir.' },
];

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/8 bg-[#0d131b] p-4 shadow-panel">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-200">{title}</h3>
      {hint && <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 hover:border-white/15">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-emerald-400" />
      <span className="min-w-0">
        <span className="block text-[12px] text-slate-200">{label}</span>
        {hint && <span className="block text-[10px] leading-snug text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function Backoffice({ user, logout }: { user: string; logout: () => void }) {
  const [section, setSection] = useState<SectionId>(() => {
    const hash = window.location.hash.replace('#', '') as SectionId;
    return SECTIONS.some((s) => s.id === hash) ? hash : 'hud';
  });
  const [modal, setModal] = useState<null | 'mt5' | 'ai'>(null);
  const [hire, setHire] = useState(false);

  const connected = useStore((s) => s.connected);
  const config = useStore((s) => s.config);
  const account = useStore((s) => s.account);
  const agents = useStore((s) => s.agents);
  const watchlist = useStore((s) => s.watchlist);
  const ai = useStore((s) => s.ai);
  const mt5Connected = useStore((s) => s.mt5Connected);
  const hudOn = useStore((s) => s.hudOn);
  const prefs = useStore((s) => s.hudPrefs);
  const setHudOn = useStore((s) => s.setHudOn);
  const setHudPref = useStore((s) => s.setHudPref);
  const setAllHudPrefs = useStore((s) => s.setAllHudPrefs);
  const uiScale = useStore((s) => s.uiScale);
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);
  const restMode = useStore((s) => s.restMode);
  const setRestMode = useStore((s) => s.setRestMode);
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [diag, setDiag] = useState<{ ok: boolean; symbol: string; checks: { id: string; label: string; ok: boolean; detail: string }[] } | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [diagSymbol, setDiagSymbol] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const setUiScale = useStore((s) => s.setUiScale);
  const cameraMode = useStore((s) => s.cameraMode);
  const setCameraMode = useStore((s) => s.setCameraMode);
  const tvEnabled = useStore((s) => s.tvEnabled);
  const setTv = useStore((s) => s.setTv);

  const [handle, setHandle] = useState(() => localStorage.getItem('axe.watermark.handle') ?? 'axecapital.live');
  const [corner, setCorner] = useState(() => localStorage.getItem('axe.watermark.corner') ?? 'tr');
  const [slides, setSlides] = useState<{ src: string; seconds: number }[]>([]);

  useEffect(() => {
    connect();
    document.title = 'Axe Capital · Backoffice';
  }, []);

  useEffect(() => {
    window.location.hash = section;
  }, [section]);

  useEffect(() => {
    fetch('/brand/playlist.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.slides && setSlides(j.slides))
      .catch(() => {});
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, typeof HUD_CATALOG>();
    for (const item of HUD_CATALOG) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, []);

  const activeCount = HUD_CATALOG.filter((h) => prefs[h.key]).length;

  return (
    <div className="flex h-full w-full bg-[#070b11] text-slate-200">
      {/* ── navegação ─────────────────────────────────────────────── */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-white/8 bg-[#090e15] p-3">
        <div className="px-2 py-2">
          <div className="text-[13px] font-semibold uppercase tracking-[0.3em] text-slate-100">Axe Capital</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.24em] text-emerald-400/80">Backoffice</div>
        </div>

        <nav className="mt-4 flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] transition ${
                section === s.id ? 'bg-emerald-400/10 text-emerald-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              <span className="w-4 text-[13px]">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-2 px-1 pt-4 text-[10px] uppercase tracking-[0.16em]">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className="text-slate-500">{connected ? 'engine online' : 'engine offline'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${mt5Connected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <span className="text-slate-500">{mt5Connected ? 'MT5 conectado' : 'MT5 desconectado'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            <span className="text-slate-500">{user}</span>
          </div>
          <a href="/" className="mt-2 block rounded-lg border border-white/10 px-3 py-2 text-center text-slate-300 hover:border-emerald-400/40 hover:text-emerald-300">
            ← voltar ao escritório
          </a>
          <button
            onClick={logout}
            className="w-full rounded-lg border border-white/10 px-3 py-2 text-center text-slate-500 hover:border-rose-400/40 hover:text-rose-300"
          >
            sair
          </button>
        </div>
      </aside>

      {/* ── conteúdo ──────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold text-slate-100">{SECTIONS.find((s) => s.id === section)?.label}</h2>
            <p className="text-[11px] text-slate-500">
              {config.executionMode === 'MT5_LIVE'
                ? 'modo MT5 LIVE — ordens reais'
                : mt5Connected
                  ? 'modo MT5 papel — preços e conta reais, execução simulada'
                  : 'modo simulação'}
              {account ? ` · equity ${money(account.equity)} · ${agents.length} agentes` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded-full border border-white/10 px-3 py-1 text-slate-400">
              HUD {hudOn ? 'ligada' : 'desligada'} · {activeCount}/{HUD_CATALOG.length} painéis liberados
            </span>
          </div>
        </header>

        {section === 'hud' && (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title="Interruptor geral"
              hint="É o mesmo botão HUD do canto do escritório (tecla H). Quando você liga, aparecem apenas os painéis marcados abaixo."
            >
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setHudOn(!hudOn)}
                  className={`rounded-lg px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] transition ${
                    hudOn ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {hudOn ? '▦ HUD ligada' : '⬚ HUD desligada'}
                </button>
                <button className="btn" onClick={() => setAllHudPrefs(true)}>
                  marcar tudo
                </button>
                <button className="btn" onClick={() => setAllHudPrefs(false)}>
                  desmarcar tudo
                </button>
              </div>

              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Escala da interface · {Math.round(uiScale * 100)}%</div>
                <input
                  type="range"
                  min={0.7}
                  max={1.4}
                  step={0.05}
                  value={uiScale}
                  onChange={(e) => setUiScale(Number(e.target.value))}
                  className="mt-2 w-full accent-emerald-400"
                />
              </div>
            </Card>

            <Card title="Presets rápidos" hint="Combinações prontas para gravar, transmitir ou operar.">
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn"
                  onClick={() => {
                    setAllHudPrefs(true);
                    setHudOn(true);
                  }}
                >
                  🖥 Operação completa
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setAllHudPrefs(false);
                    (['topHud', 'marketRail', 'scoreboard', 'captions', 'resultCard', 'spotlight', 'watermark'] as HudKey[]).forEach((k) =>
                      setHudPref(k, true),
                    );
                    setHudOn(true);
                  }}
                >
                  ◉ Transmissão
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setAllHudPrefs(false);
                    setHudPref('watermark', true);
                    setHudOn(false);
                  }}
                >
                  ⬚ Só o escritório
                </button>
              </div>
            </Card>

            {groups.map(([group, items]) => (
              <Card key={group} title={group}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((item) => (
                    <Toggle
                      key={item.key}
                      label={item.label}
                      hint={item.hint}
                      checked={!!prefs[item.key]}
                      onChange={(v) => setHudPref(item.key, v)}
                    />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}

        {section === 'mesa' && (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Simulação" hint="Controla o relógio da mesa. Vale para os dois modos (simulado e MT5).">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={`btn ${config.running ? 'btn-danger' : 'btn-accent'}`}
                  onClick={() => api.control({ running: !config.running })}
                >
                  {config.running ? '⏸ Pausar' : '▶ Iniciar'}
                </button>
                <button className="btn" onClick={() => api.injectEvent()}>
                  ⚡ Novo evento de mercado
                </button>
                <button className="btn" onClick={() => api.reset()}>
                  ⟲ Resetar o dia
                </button>
              </div>

              <div className="mt-4 text-[10px] uppercase tracking-[0.2em] text-slate-500">Velocidade</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => api.control({ speed: s })}
                    className={`rounded px-3 py-1.5 text-[12px] font-semibold transition ${
                      config.speed === s ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/5 text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </Card>

            <Card title="Regime de mercado">
              <select
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] uppercase tracking-wider text-slate-200 outline-none"
                value={config.regime}
                onChange={(e) => api.control({ regime: e.target.value, autoRegime: false })}
              >
                {REGIMES.map((r) => (
                  <option key={r} value={r} className="bg-[#0b1016]">
                    {r.replace('_', ' ')}
                  </option>
                ))}
              </select>
              <label className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                <input
                  type="checkbox"
                  checked={config.autoRegime}
                  onChange={(e) => api.control({ autoRegime: e.target.checked })}
                  className="accent-emerald-400"
                />
                deixar o motor trocar de regime sozinho
              </label>
            </Card>

            <Card title="Câmera" hint="Mesmo controle da barra inferior; aqui ele fica fixo para a live.">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['director', '🎬 Direção'],
                    ['follow', '🎯 Eventos'],
                    ['manual', '🖐 Manual'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setCameraMode(id)}
                    className={`rounded-lg px-3 py-2 text-[12px] transition ${
                      cameraMode === id ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Card>

            <Card
              title="Sala de descanso"
              hint="Quando o mercado do ativo está fechado (fim de semana, pausa diária), o agente sai da mesa e vai para o lounge — sofá, copa e sinuca."
            >
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['auto', '🕒 Automático', 'segue o horário real do ativo'],
                    ['always', '🛋 Forçar descanso', 'todo mundo no lounge (bom para conferir a sala)'],
                    ['never', '💼 Sempre na mesa', 'ignora o horário de mercado'],
                  ] as [RestMode, string, string][]
                ).map(([id, label, hint]) => (
                  <button
                    key={id}
                    title={hint}
                    onClick={() => setRestMode(id)}
                    className={`rounded-lg px-3 py-2 text-[12px] transition ${
                      restMode === id ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Card>

            <Card
              title="Qualidade gráfica"
              hint="Se a cena travar ou aparecer rasgada na sua máquina, baixe um nível. Vale na hora para a aba do escritório."
            >
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['alta', '◆ Alta', 'reflexo no piso, bloom e DPR até 1.9'],
                    ['media', '◈ Média', 'reflexo leve, bloom menor, DPR até 1.4'],
                    ['baixa', '◇ Baixa', 'sem reflexo nem pós-processamento'],
                  ] as [Quality, string, string][]
                ).map(([id, label, hint]) => (
                  <button
                    key={id}
                    title={hint}
                    onClick={() => setQuality(id)}
                    className={`rounded-lg px-3 py-2 text-[12px] transition ${
                      quality === id ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Card>

            <Card title="Conta" hint="Espelho do que a HUD mostra no escritório.">
              {account ? (
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  {[
                    ['Saldo', money(account.balance)],
                    ['Equity', money(account.equity)],
                    ['P&L do dia', money(account.dayPnl)],
                    ['Posições', String(account.openPositions)],
                    ['Trades hoje', String(account.tradesToday)],
                    ['Win rate', `${Math.round((account.winRate ?? 0) * 100)}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                      <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">{k}</div>
                      <div className="mono mt-0.5 text-slate-200">{v}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">aguardando o engine…</div>
              )}
            </Card>
          </div>
        )}

        {section === 'integracoes' && (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title="MetaTrader 5"
              hint="Usa a conta já logada no terminal: o sistema puxa conta, saldo e a lista de ativos disponíveis. Nada de senha aqui."
            >
              <div className="mb-3 flex items-center gap-2 text-[12px]">
                <span className={`h-2 w-2 rounded-full ${mt5Connected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                {mt5Connected ? 'terminal conectado' : 'terminal não conectado'}
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">{config.executionMode}</span>
              </div>
              <button className="btn btn-accent" onClick={() => setModal('mt5')}>
                Abrir assistente de conexão
              </button>
            </Card>

            <Card
              title="Diagnóstico de execução"
              hint="Responde por que a ordem não entra no terminal: roteamento, AutoTrading, permissão da conta, símbolo, volume, stops e margem — incluindo o order_check oficial do MT5."
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={diagSymbol}
                  onChange={(e) => setDiagSymbol(e.target.value.toUpperCase())}
                  placeholder={watchlist[0] ?? 'EURUSD'}
                  className="w-[130px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] uppercase text-slate-200 outline-none focus:border-emerald-400/40"
                />
                <button
                  className="btn btn-accent"
                  disabled={diagBusy}
                  onClick={async () => {
                    setDiagBusy(true);
                    setTestMsg(null);
                    try {
                      setDiag(await api.mt5Diagnose(diagSymbol || undefined));
                    } catch (err: any) {
                      setTestMsg({ tone: 'err', text: err?.message ?? 'falhou' });
                    } finally {
                      setDiagBusy(false);
                    }
                  }}
                >
                  {diagBusy ? 'checando…' : '🩺 Rodar diagnóstico'}
                </button>
                <button
                  className="btn"
                  title="Envia uma ordem REAL de volume mínimo (0.01) para provar a rota"
                  onClick={async () => {
                    setTestMsg(null);
                    try {
                      const out = await api.mt5TestOrder(diagSymbol || undefined);
                      setTestMsg(
                        out?.ok
                          ? { tone: 'ok', text: `ordem executada · ticket ${out.order ?? out.deal} · preço ${out.price}` }
                          : { tone: 'err', text: `recusada · retcode ${out?.retcode} · ${out?.comment ?? ''}` },
                      );
                    } catch (err: any) {
                      setTestMsg({ tone: 'err', text: err?.message ?? 'falhou' });
                    }
                  }}
                >
                  🧪 Ordem de teste (0.01)
                </button>
              </div>

              {testMsg && (
                <div
                  className={`mt-3 rounded-lg px-3 py-2 text-[11px] ${
                    testMsg.tone === 'ok' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
                  }`}
                >
                  {testMsg.text}
                </div>
              )}

              {diag && (
                <ul className="mt-3 space-y-1.5">
                  {diag.checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                      <span className={`mt-[3px] text-[11px] ${c.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{c.ok ? '✓' : '✕'}</span>
                      <span className="min-w-0">
                        <span className="block text-[12px] text-slate-200">{c.label}</span>
                        <span className="block break-words text-[10px] leading-snug text-slate-500">{c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Modos de execução" hint="Resumo do que cada modo faz.">
              <ul className="space-y-2 text-[11px] leading-snug text-slate-400">
                <li>
                  <span className="text-slate-200">SIMULAÇÃO</span> — preços sintéticos, conta fictícia, execução simulada.
                </li>
                <li>
                  <span className="text-slate-200">MT5 · PAPEL</span> — preços e conta reais do terminal, ordens simuladas.
                </li>
                <li>
                  <span className="text-rose-300">MT5 · LIVE</span> — ordens enviadas de verdade para o MetaTrader 5.
                </li>
              </ul>
            </Card>
          </div>
        )}

        {section === 'ia' && (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title="Provider de IA"
              hint="LM Studio local, Ollama, OpenAI, NVIDIA NIM, Groq, OpenRouter ou um endpoint personalizado compatível com OpenAI."
            >
              <div className="mb-3 space-y-1 text-[12px]">
                <div>
                  <span className="text-slate-500">estado:</span>{' '}
                  <span className={ai?.enabled ? 'text-emerald-300' : 'text-slate-400'}>{ai?.enabled ? 'ligada' : 'desligada'}</span>
                </div>
                <div>
                  <span className="text-slate-500">provider:</span> <span className="mono">{ai?.provider ?? '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500">modelo:</span> <span className="mono">{ai?.model ?? '—'}</span>
                </div>
              </div>
              <button className="btn btn-accent" onClick={() => setModal('ai')}>
                Configurar provider
              </button>
            </Card>

            <Card title="Onde a IA entra" hint="Ela nunca bloqueia a mesa: se o modelo cair, o motor heurístico assume.">
              <ul className="space-y-1.5 text-[11px] leading-snug text-slate-400">
                <li>• opinião dos analistas (técnico, macro, quant) sobre cada oportunidade;</li>
                <li>• briefing macro a partir das manchetes do crawler;</li>
                <li>• comentários dos agentes na mesa (viram legenda na live).</li>
              </ul>
            </Card>
          </div>
        )}

        {section === 'agentes' && (
          <div className="grid gap-4">
            <Card title="Quadro de agentes" hint="Cada agente opera no máximo uma entrada por vez no ativo dele.">
              <button className="btn btn-accent" onClick={() => setHire(true)}>
                + Contratar agente
              </button>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="text-[9px] uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="py-1.5">Agente</th>
                      <th>Função</th>
                      <th>Ativo</th>
                      <th>Estado</th>
                      <th className="text-right">Dia</th>
                      <th className="text-right">Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a) => (
                      <tr key={a.id} className="border-t border-white/5">
                        <td className="py-1.5 text-slate-200">{a.name}</td>
                        <td className="text-slate-400">{a.role.replace('_', ' ').toLowerCase()}</td>
                        <td className="mono text-slate-400">{a.symbol ?? '—'}</td>
                        <td className="text-slate-400">{a.state.toLowerCase()}</td>
                        <td className={`mono text-right ${(a.daily?.realized ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {money(a.daily?.realized ?? 0)}
                        </td>
                        <td className="mono text-right text-slate-400">{a.daily?.trades ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {section === 'marca' && (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Telão central" hint="O painel de LED grande da parede do escritório.">
              <label className="flex items-center gap-2 text-[12px] text-slate-300">
                <input type="checkbox" checked={tvEnabled} onChange={(e) => setTv(e.target.checked)} className="accent-emerald-400" />
                mostrar a arte da marca (desmarcado = gráfico do ativo em foco)
              </label>
              <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
                <img src="/brand/axe-wall.jpg" alt="arte do telão" className="w-full" />
              </div>
            </Card>

            <Card
              title="Carrossel de anúncios"
              hint="Edite frontend/public/brand/playlist.json, jogue as artes 16:9 em public/brand e recarregue a aba do escritório."
            >
              {slides.length ? (
                <ul className="space-y-1.5 text-[11px]">
                  {slides.map((s, i) => (
                    <li key={i} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-1.5">
                      <span className="mono truncate text-slate-300">{s.src}</span>
                      <span className="text-slate-500">{s.seconds}s</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[11px] text-slate-500">playlist.json não encontrado — o telão usa a arte padrão.</div>
              )}
            </Card>

            <Card title="Marca d'água" hint="Fica no vídeo em todos os modos, inclusive com a HUD desligada.">
              <Toggle
                checked={!!prefs.watermark}
                onChange={(v) => setHudPref('watermark', v)}
                label="mostrar a marca d'água"
                hint="atalho W no escritório"
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Handle / site</span>
                  <input
                    value={handle}
                    onChange={(e) => {
                      setHandle(e.target.value);
                      localStorage.setItem('axe.watermark.handle', e.target.value);
                    }}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-emerald-400/40"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Canto</span>
                  <select
                    value={corner}
                    onChange={(e) => {
                      setCorner(e.target.value);
                      localStorage.setItem('axe.watermark.corner', e.target.value);
                    }}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-slate-200 outline-none"
                  >
                    {CORNERS.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[#0b1016]">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">
                a aba do escritório aplica handle e canto no próximo F5; ligar/desligar é na hora.
              </p>
            </Card>
          </div>
        )}

        {section === 'acesso' && (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title="Trocar senha"
              hint="A senha fica com hash scrypt em data/admin.json, dentro da pasta da instalação. Trocar derruba todas as sessões abertas."
            >
              <div className="grid gap-3">
                {(
                  [
                    ['current', 'Senha atual'],
                    ['next', 'Nova senha'],
                    ['confirm', 'Repita a nova senha'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="block">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
                    <input
                      type="password"
                      value={pwd[k]}
                      onChange={(e) => setPwd((v) => ({ ...v, [k]: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-emerald-400/40"
                    />
                  </label>
                ))}
              </div>
              {pwdMsg && (
                <div
                  className={`mt-3 rounded-lg px-3 py-2 text-[11px] ${
                    pwdMsg.tone === 'ok' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
                  }`}
                >
                  {pwdMsg.text}
                </div>
              )}
              <button
                className="btn btn-accent mt-3"
                onClick={async () => {
                  if (pwd.next !== pwd.confirm) return setPwdMsg({ tone: 'err', text: 'as senhas novas não batem' });
                  try {
                    await api.adminPassword(pwd.current, pwd.next);
                    setPwd({ current: '', next: '', confirm: '' });
                    setPwdMsg({ tone: 'ok', text: 'senha trocada — entre de novo com a nova senha' });
                    setTimeout(logout, 1600);
                  } catch (err: any) {
                    setPwdMsg({ tone: 'err', text: err?.message ?? 'não foi possível trocar' });
                  }
                }}
              >
                Salvar nova senha
              </button>
            </Card>

            <Card title="Como funciona o acesso" hint="Pensado para rodar na sua máquina ou na sua rede local.">
              <ul className="space-y-2 text-[11px] leading-snug text-slate-400">
                <li>
                  <span className="text-slate-200">Usuário de fábrica:</span> <span className="mono">admin</span> · senha{' '}
                  <span className="mono">axecapital</span>.
                </li>
                <li>Dá para sobrescrever no primeiro boot com as variáveis AXE_ADMIN_USER e AXE_ADMIN_PASSWORD.</li>
                <li>A sessão dura 12h e fica só neste navegador; o escritório (/) continua aberto, sem login.</li>
                <li>
                  Esqueceu a senha? Apague <span className="mono">data/admin.json</span> na pasta da instalação e reinicie o
                  engine — ele recria o usuário padrão.
                </li>
              </ul>
            </Card>
          </div>
        )}
      </main>

      {modal && <SettingsModal initialTab={modal} onClose={() => setModal(null)} />}
      {hire && <HireAgentModal onClose={() => setHire(false)} />}
    </div>
  );
}

export default function AdminApp() {
  return <AdminGate>{({ user, logout }) => <Backoffice user={user} logout={logout} />}</AdminGate>;
}

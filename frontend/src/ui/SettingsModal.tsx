import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api } from '../lib/api';
import { useStore } from '../state/store';
import type { AIConfig } from '../types';

const PRESETS: Record<string, { label: string; baseUrl: string; apiKey: string; model: string; hint: string }> = {
  lmstudio: {
    label: 'LM Studio (local)',
    baseUrl: 'http://127.0.0.1:1234/v1',
    apiKey: 'lm-studio',
    model: 'local-model',
    hint: 'No LM Studio: aba Developer → Start Server. A porta padrão é 1234.',
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: 'ollama',
    model: 'llama3.1',
    hint: 'Rode `ollama serve`. A API compatível com OpenAI fica em /v1.',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    hint: 'Precisa de uma API key válida da OpenAI.',
  },
  custom: {
    label: 'Provider personalizado',
    baseUrl: '',
    apiKey: '',
    model: '',
    hint: 'Qualquer endpoint compatível com /chat/completions da OpenAI (vLLM, LocalAI, OpenRouter, Groq, LiteLLM, sua API…).',
  },
};

type Check = { id: string; label: string; ok: boolean; detail: string };

export function SettingsModal({ onClose, initialTab = 'mt5' }: { onClose: () => void; initialTab?: 'mt5' | 'ai' }) {
  const config = useStore((s) => s.config);
  const mt5Connected = useStore((s) => s.mt5Connected);
  const [tab, setTab] = useState<'mt5' | 'ai'>(initialTab);

  // ── MT5 ────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<any>(null);
  const [bridgeUrl, setBridgeUrl] = useState('http://127.0.0.1:8788');
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [connecting, setConnecting] = useState(false);

  // ── AI ─────────────────────────────────────────────────────────────────
  const [ai, setAi] = useState<AIConfig | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.aiConfig().then(setAi).catch(() => void 0);
    refreshMt5();
  }, []);

  const refreshMt5 = () =>
    api
      .mt5Status()
      .then((s) => {
        setStatus(s);
        if (s.bridgeUrl) setBridgeUrl(s.bridgeUrl);
      })
      .catch(() => setStatus({ connected: false, error: 'ponte offline' }));

  const connect = async () => {
    setConnecting(true);
    setChecks(null);
    try {
      const r = await api.mt5Connect();
      setChecks(r.checks);
      setStatus({ connected: r.ok, account: r.account, bridgeUrl: r.bridgeUrl, error: r.ok ? undefined : 'verificação falhou' });
    } catch (e: any) {
      setChecks([{ id: 'error', label: 'Falha ao verificar', ok: false, detail: e.message ?? 'erro' }]);
    } finally {
      setConnecting(false);
    }
  };

  const save = async (patch: Partial<AIConfig>) => setAi(await api.setAiConfig(patch));

  return (
    <Modal
      title="Desk setup"
      subtitle="Conecte o MetaTrader 5 local e escolha qual IA pensa pelos agentes."
      onClose={onClose}
      wide
    >
      <div className="mb-4 flex gap-1 rounded-md border border-white/10 bg-black/30 p-1">
        {([
          ['mt5', `MetaTrader 5 ${mt5Connected ? '· conectado' : '· offline'}`],
          ['ai', `Provider de IA ${ai?.enabled ? '· ligado' : '· desligado'}`],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition ${
              tab === id ? 'bg-white/10 text-slate-100' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════ MT5 ══════════════════════════════ */}
      {tab === 'mt5' && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-300">Conexão</h3>
              <span className={`chip ${mt5Connected ? 'border-emerald-400/40 text-emerald-300' : 'border-slate-500/40 text-slate-400'}`}>
                {mt5Connected ? 'conectado' : 'offline'}
              </span>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-500">
              O desk nunca pede login. A ponte roda ao lado do seu terminal e usa a conta <b>que já está logada</b>,
              lista os instrumentos dela e envia as ordens por ela.
            </p>

            <button className={`btn w-full justify-center ${mt5Connected ? '' : 'btn-accent'}`} disabled={connecting} onClick={connect}>
              {connecting ? 'Verificando terminal…' : '🔌 Conectar MT5 (verificar e ativar live)'}
            </button>

            {checks && (
              <div className="space-y-1 rounded-md border border-white/8 bg-black/30 p-2">
                {checks.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 text-[11px]">
                    <span className={c.ok ? 'text-emerald-400' : 'text-rose-400'}>{c.ok ? '✓' : '✕'}</span>
                    <div className="min-w-0">
                      <div className={c.ok ? 'text-slate-200' : 'text-rose-300'}>{c.label}</div>
                      <div className="break-words text-[10px] text-slate-500">{c.detail}</div>
                    </div>
                  </div>
                ))}
                <div className={`mt-1 border-t border-white/5 pt-1 text-[11px] font-semibold ${checks.every((c) => c.ok) ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {checks.every((c) => c.ok)
                    ? 'Tudo certo — execução roteada para o MetaTrader 5.'
                    : 'Ainda não dá para ir ao vivo. Resolva os itens acima e clique de novo.'}
                </div>
              </div>
            )}

            <div>
              <div className="panel-title mb-1">URL da ponte</div>
              <div className="flex gap-2">
                <input className="field" value={bridgeUrl} onChange={(e) => setBridgeUrl(e.target.value)} />
                <button
                  className="btn"
                  onClick={async () => {
                    await api.setBridgeUrl(bridgeUrl);
                    refreshMt5();
                  }}
                >
                  Salvar
                </button>
              </div>
            </div>

            <div className="rounded-md border border-white/8 bg-black/30 p-2 font-mono text-[10px] leading-relaxed text-slate-400">
              cd mt5-bridge
              <br />
              pip install -r requirements.txt
              <br />
              python bridge.py
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-300">Conta e roteamento</h3>

            {status?.account ? (
              <div className="space-y-1 rounded-md border border-emerald-400/20 bg-emerald-400/5 p-2 text-[11px]">
                {[
                  ['Conta', `${status.account.login} · ${status.account.name}`],
                  ['Servidor', `${status.account.server} (${status.account.company})`],
                  ['Saldo', `${status.account.balance} ${status.account.currency}`],
                  ['Equity', `${status.account.equity} ${status.account.currency}`],
                  ['Alavancagem', `1:${status.account.leverage}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-slate-500">{k}</span>
                    <span className="mono text-slate-200">{v as string}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5 rounded-md border border-sky-400/20 bg-sky-400/5 p-2 text-[11px] leading-relaxed text-slate-400">
                <div className="font-semibold text-sky-300">Sem MetaTrader 5? Está tudo certo.</div>
                <div>
                  O escritório roda inteiro no motor interno: preços, candles, spreads, notícias, oportunidades, risco,
                  execução e P&amp;L — tudo marcado como <span className="chip">SIMULATION</span>.
                </div>
                <div className="text-slate-600">{status?.error ?? `ponte não encontrada em ${bridgeUrl}`}</div>
              </div>
            )}

            <div>
              <div className="panel-title mb-1">Roteamento de execução</div>
              <div className="flex gap-2">
                {(['SIMULATION', 'MT5_LIVE'] as const).map((m) => (
                  <button
                    key={m}
                    disabled={m === 'MT5_LIVE' && !mt5Connected}
                    title={m === 'MT5_LIVE' && !mt5Connected ? 'Use "Conectar MT5" primeiro' : ''}
                    className={`btn flex-1 justify-center ${config.executionMode === m ? (m === 'MT5_LIVE' ? 'btn-danger' : 'btn-accent') : ''}`}
                    onClick={() => (m === 'MT5_LIVE' ? connect() : api.mt5Disconnect())}
                  >
                    {m === 'SIMULATION' ? 'Paper desk' : 'Enviar ao MT5'}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-amber-400/80">
                {config.executionMode === 'MT5_LIVE'
                  ? 'As ordens dos agentes vão para o seu terminal. Comece por uma conta demo.'
                  : mt5Connected
                    ? 'Tudo fica no motor interno. Nenhum dinheiro real envolvido.'
                    : 'Sem MT5 detectado: tudo fica no motor interno. Nenhum dinheiro real envolvido.'}
              </p>
            </div>

            <button className="btn w-full justify-center" onClick={refreshMt5}>
              ⟳ Re-checar terminal
            </button>
          </section>
        </div>
      )}

      {/* ══════════════════════════════ AI ═══════════════════════════════ */}
      {tab === 'ai' && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-300">Provider</h3>
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <input type="checkbox" checked={!!ai?.enabled} onChange={(e) => save({ enabled: e.target.checked })} className="accent-violet-400" />
                camada de IA ligada
              </label>
            </div>

            <div>
              <div className="panel-title mb-1">Escolha o provider</div>
              <select
                className="field"
                value={ai?.provider ?? 'lmstudio'}
                onChange={(e) => {
                  const p = e.target.value as AIConfig['provider'];
                  save({ provider: p, ...PRESETS[p] });
                  setModels([]);
                  setMsg('');
                }}
              >
                {Object.entries(PRESETS).map(([id, p]) => (
                  <option key={id} value={id} className="bg-[#0b1016]">
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{PRESETS[ai?.provider ?? 'lmstudio'].hint}</p>
            </div>

            <div>
              <div className="panel-title mb-1">Base URL (compatível com OpenAI)</div>
              <input
                className="field"
                placeholder="http://127.0.0.1:1234/v1"
                value={ai?.baseUrl ?? ''}
                onChange={(e) => setAi({ ...(ai as AIConfig), baseUrl: e.target.value })}
                onBlur={(e) => save({ baseUrl: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="panel-title mb-1">API key</div>
                <input
                  className="field"
                  placeholder="opcional em modelos locais"
                  value={ai?.apiKey ?? ''}
                  onChange={(e) => setAi({ ...(ai as AIConfig), apiKey: e.target.value })}
                  onBlur={(e) => save({ apiKey: e.target.value })}
                />
              </div>
              <div>
                <div className="panel-title mb-1">Modelo</div>
                <input
                  className="field"
                  value={ai?.model ?? ''}
                  onChange={(e) => setAi({ ...(ai as AIConfig), model: e.target.value })}
                  onBlur={(e) => save({ model: e.target.value })}
                />
              </div>
            </div>

            {!!models.length && (
              <div>
                <div className="panel-title mb-1">Modelos encontrados no provider</div>
                <select className="field" value={ai?.model} onChange={(e) => save({ model: e.target.value })}>
                  {models.map((m) => (
                    <option key={m} value={m} className="bg-[#0b1016]">
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2">
              <button
                className="btn flex-1 justify-center"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setMsg('');
                  try {
                    const r = await api.aiModels();
                    setModels(r.models);
                    setMsg(r.models.length ? `${r.models.length} modelos encontrados` : 'provider respondeu, mas sem modelos');
                  } catch (e: any) {
                    setMsg(`✕ ${e.message ?? 'não consegui falar com o provider'}`);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                ⟳ Listar modelos
              </button>
              <button
                className="btn flex-1 justify-center"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setMsg('');
                  try {
                    const r = await api.aiTest();
                    setMsg(r.ok ? `✓ ${r.text}` : `✕ ${r.error}`);
                  } catch (e: any) {
                    setMsg(`✕ ${e.message}`);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                ⚡ Testar prompt
              </button>
            </div>
            {msg && <div className="rounded border border-white/8 bg-black/30 p-2 text-[11px] text-slate-300">{msg}</div>}
          </section>

          <section className="space-y-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-300">Comportamento</h3>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">
                Temperatura {ai?.temperature?.toFixed(2)}
                <input
                  type="range"
                  min={0}
                  max={1.4}
                  step={0.05}
                  value={ai?.temperature ?? 0.7}
                  onChange={(e) => save({ temperature: Number(e.target.value) })}
                  className="w-full accent-violet-400"
                />
              </label>
              <label className="text-[10px] uppercase tracking-wider text-slate-400">
                Máx. tokens {ai?.maxTokens}
                <input
                  type="range"
                  min={48}
                  max={512}
                  step={16}
                  value={ai?.maxTokens ?? 160}
                  onChange={(e) => save({ maxTokens: Number(e.target.value) })}
                  className="w-full accent-violet-400"
                />
              </label>
            </div>

            <div className="rounded-md border border-white/8 bg-black/30 p-2">
              <div className="panel-title mb-1">Aplicar à equipe</div>
              <div className="flex gap-2">
                <button className="btn flex-1 justify-center" onClick={() => api.aiForAll(true)}>
                  Ligar IA em todos
                </button>
                <button className="btn flex-1 justify-center" onClick={() => api.aiForAll(false)}>
                  Só heurísticas
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Também dá para ligar/desligar agente por agente no <b>Agent inspector</b>.
              </p>
            </div>

            <p className="text-[10px] leading-relaxed text-slate-500">
              O modelo recebe o contexto da oportunidade (par, lado, spread, regime, momentum, scores e próximo evento macro)
              e responde em JSON com score, viés e um comentário curto. A chamada é não-bloqueante: se o provider cair ou
              demorar, a mesa continua operando pelas heurísticas e pelo cérebro de aprendizado.
            </p>
          </section>
        </div>
      )}
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api } from '../lib/api';
import { useStore } from '../state/store';
import type { AIConfig } from '../types';

const PRESETS: Record<string, { baseUrl: string; apiKey: string; model: string }> = {
  lmstudio: { baseUrl: 'http://127.0.0.1:1234/v1', apiKey: 'lm-studio', model: 'local-model' },
  ollama: { baseUrl: 'http://127.0.0.1:11434/v1', apiKey: 'ollama', model: 'llama3.1' },
  openai: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
  custom: { baseUrl: '', apiKey: '', model: '' },
};

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const config = useStore((s) => s.config);
  const mt5Connected = useStore((s) => s.mt5Connected);
  const [ai, setAi] = useState<AIConfig | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [bridgeUrl, setBridgeUrl] = useState('http://127.0.0.1:8788');
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
      .catch(() => setStatus({ connected: false, error: 'bridge offline' }));

  const save = async (patch: Partial<AIConfig>) => {
    const next = await api.setAiConfig(patch);
    setAi(next);
  };

  return (
    <Modal title="Desk setup" subtitle="Connect the local MetaTrader 5 terminal and the AI provider that powers the agents." onClose={onClose} wide>
      <div className="grid gap-5 md:grid-cols-2">
        {/* ───────────────────────── MT5 ───────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-300">MetaTrader 5</h3>
            <span className={`chip ${mt5Connected ? 'border-emerald-400/40 text-emerald-300' : 'border-slate-500/40 text-slate-400'}`}>
              {mt5Connected ? 'connected' : 'offline'}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            The desk never asks for your login. Run the bridge next to your terminal and it reads the account that is already logged in,
            lists the instruments available to it and sends orders through it.
          </p>
          <div className="rounded-md border border-white/8 bg-black/30 p-2 font-mono text-[10px] leading-relaxed text-slate-400">
            cd mt5-bridge
            <br />
            pip install -r requirements.txt
            <br />
            python bridge.py
          </div>

          <div>
            <div className="panel-title mb-1">Bridge URL</div>
            <div className="flex gap-2">
              <input className="field" value={bridgeUrl} onChange={(e) => setBridgeUrl(e.target.value)} />
              <button
                className="btn"
                onClick={async () => {
                  await api.setBridgeUrl(bridgeUrl);
                  refreshMt5();
                }}
              >
                Save
              </button>
            </div>
          </div>

          {status?.account ? (
            <div className="space-y-1 rounded-md border border-emerald-400/20 bg-emerald-400/5 p-2 text-[11px]">
              {[
                ['Account', `${status.account.login} · ${status.account.name}`],
                ['Server', `${status.account.server} (${status.account.company})`],
                ['Balance', `${status.account.balance} ${status.account.currency}`],
                ['Equity', `${status.account.equity} ${status.account.currency}`],
                ['Leverage', `1:${status.account.leverage}`],
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
                O escritório roda inteiro no motor interno: preços, candles, spreads, notícias, oportunidades,
                risco, execução e P&amp;L — tudo simulado e marcado como <span className="chip">SIMULATION</span>.
              </div>
              <div>
                Você pode contratar agentes, escolher entre os ativos simulados, acelerar o dia e ver os cérebros
                aprendendo. Quando quiser, instale o MT5, rode a ponte e o mesmo escritório passa a usar a conta
                logada — sem reconfigurar nada.
              </div>
              <div className="text-slate-600">{status?.error ? `detalhe técnico: ${status.error}` : 'ponte não encontrada em ' + bridgeUrl}</div>
            </div>
          )}

          <div>
            <div className="panel-title mb-1">Execution routing</div>
            <div className="flex gap-2">
              {(['SIMULATION', 'MT5_LIVE'] as const).map((m) => (
                <button
                  key={m}
                  disabled={m === 'MT5_LIVE' && !mt5Connected}
                  title={m === 'MT5_LIVE' && !mt5Connected ? 'Disponível quando a ponte do MetaTrader 5 estiver online' : ''}
                  className={`btn flex-1 ${config.executionMode === m ? (m === 'MT5_LIVE' ? 'btn-danger' : 'btn-accent') : ''}`}
                  onClick={() => api.control({ executionMode: m })}
                >
                  {m === 'SIMULATION' ? 'Paper desk' : 'Send to MT5'}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-amber-400/80">
              {config.executionMode === 'MT5_LIVE'
                ? 'Orders generated by the agents will be sent to your terminal. Use a demo account first.'
                : mt5Connected
                  ? 'All orders stay inside the simulation engine. No real money involved.'
                  : 'Sem MT5 detectado: todas as ordens ficam no motor interno. Nenhum dinheiro real envolvido.'}
            </p>
          </div>
          <button className="btn w-full" onClick={refreshMt5}>
            ⟳ Re-check terminal
          </button>
        </section>

        {/* ───────────────────────── AI ───────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-300">AI provider</h3>
            <label className="flex items-center gap-2 text-[11px] text-slate-400">
              <input
                type="checkbox"
                checked={!!ai?.enabled}
                onChange={(e) => save({ enabled: e.target.checked })}
                className="accent-violet-400"
              />
              enabled
            </label>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {Object.keys(PRESETS).map((p) => (
              <button
                key={p}
                className={`btn justify-center ${ai?.provider === p ? 'btn-accent' : ''}`}
                onClick={() => save({ provider: p as AIConfig['provider'], ...PRESETS[p] })}
              >
                {p}
              </button>
            ))}
          </div>

          <div>
            <div className="panel-title mb-1">Base URL (OpenAI-compatible)</div>
            <input className="field" value={ai?.baseUrl ?? ''} onChange={(e) => setAi({ ...(ai as AIConfig), baseUrl: e.target.value })} onBlur={(e) => save({ baseUrl: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="panel-title mb-1">API key</div>
              <input className="field" value={ai?.apiKey ?? ''} onChange={(e) => setAi({ ...(ai as AIConfig), apiKey: e.target.value })} onBlur={(e) => save({ apiKey: e.target.value })} />
            </div>
            <div>
              <div className="panel-title mb-1">Model</div>
              <input className="field" value={ai?.model ?? ''} onChange={(e) => setAi({ ...(ai as AIConfig), model: e.target.value })} onBlur={(e) => save({ model: e.target.value })} />
            </div>
          </div>

          {!!models.length && (
            <select className="field" value={ai?.model} onChange={(e) => save({ model: e.target.value })}>
              {models.map((m) => (
                <option key={m} value={m} className="bg-[#0b1016]">
                  {m}
                </option>
              ))}
            </select>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-400">
              Temperature {ai?.temperature?.toFixed(2)}
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
              Max tokens {ai?.maxTokens}
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

          <div className="flex gap-2">
            <button
              className="btn flex-1"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMsg('');
                try {
                  const r = await api.aiModels();
                  setModels(r.models);
                  setMsg(`${r.models.length} models found`);
                } catch (e: any) {
                  setMsg(e.message ?? 'cannot reach provider');
                } finally {
                  setBusy(false);
                }
              }}
            >
              ⟳ List models
            </button>
            <button
              className="btn flex-1"
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
              ⚡ Test prompt
            </button>
          </div>
          {msg && <div className="rounded border border-white/8 bg-black/30 p-2 text-[11px] text-slate-300">{msg}</div>}
          <p className="text-[10px] leading-relaxed text-slate-500">
            With LM Studio, start the local server (Developer → Start server) and keep the default URL. Any OpenAI-compatible endpoint works —
            enable “Use local LLM” per agent in the inspector to let the model write the analysis.
          </p>
        </section>
      </div>
    </Modal>
  );
}

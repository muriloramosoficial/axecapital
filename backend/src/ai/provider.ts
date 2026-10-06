import type { AgentRole } from '../core/types.js';

export interface AIConfig {
  enabled: boolean;
  /** all OpenAI-compatible /chat/completions endpoints */
  provider: 'lmstudio' | 'ollama' | 'openai' | 'nvidia' | 'groq' | 'openrouter' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export const defaultAIConfig = (): AIConfig => ({
  enabled: false,
  provider: 'lmstudio',
  baseUrl: process.env.AI_BASE_URL || 'http://127.0.0.1:1234/v1',
  apiKey: process.env.AI_API_KEY || 'lm-studio',
  model: process.env.AI_MODEL || 'local-model',
  temperature: 0.7,
  maxTokens: 160,
  timeoutMs: 12000,
});

/**
 * Accepts anything the user pasted and turns it into a usable OpenAI-style
 * base URL: trims spaces/quotes, drops a trailing slash or /chat/completions
 * and appends /v1 when the host clearly needs it.
 */
export function normalizeBaseUrl(raw: string): string {
  let url = String(raw ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/(chat\/completions|completions|models)$/i, '');
  if (!/\/v\d+$/.test(url) && /(api\.openai\.com|integrate\.api\.nvidia\.com|api\.groq\.com\/openai|openrouter\.ai\/api|127\.0\.0\.1:1234|localhost:1234|:11434)$/i.test(url)) {
    url = `${url}/v1`;
  }
  return url;
}

async function describe(res: Response): Promise<string> {
  let body = '';
  try {
    body = (await res.text()).slice(0, 400);
  } catch {
    /* ignore */
  }
  try {
    const json = JSON.parse(body);
    body = json?.error?.message ?? json?.detail ?? json?.message ?? body;
  } catch {
    /* plain text */
  }
  const hint =
    res.status === 401 || res.status === 403
      ? ' — verifique a API key (NVIDIA usa chaves nvapi-…)'
      : res.status === 404
        ? ' — verifique a Base URL (ela deve terminar em /v1) e o nome do modelo'
        : res.status === 422 || res.status === 400
          ? ' — o provider recusou o payload (normalmente nome de modelo inválido)'
          : '';
  return `HTTP ${res.status} ${res.statusText}${body ? ` · ${body}` : ''}${hint}`;
}

export interface AIAnalysis {
  score: number; // 0..100
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  comment: string;
  source: 'ai' | 'heuristic';
}

const ROLE_PROMPT: Record<AgentRole, string> = {
  MARKET_SCOUT: 'You are a forex market scout watching tick flow for unusual momentum.',
  TECHNICAL_ANALYST: 'You are a technical analyst reading price action, structure, RSI and moving averages.',
  MACRO_ANALYST: 'You are a macro analyst weighing rates, central banks and the economic calendar.',
  QUANT_ANALYST: 'You are a quant estimating edge, win probability and expected move.',
  RISK_MANAGER: 'You are a strict risk manager protecting the book from correlation and event risk.',
  PORTFOLIO_MANAGER: 'You are a portfolio manager sizing positions across the book.',
  TRADER: 'You are an execution trader working orders with minimal slippage.',
  NEWS_ANALYST: 'You monitor the economic calendar and breaking headlines.',
};

export class AIProviderClient {
  constructor(public config: AIConfig = defaultAIConfig()) {}

  update(patch: Partial<AIConfig>) {
    this.config = { ...this.config, ...patch };
    if (patch.baseUrl !== undefined) this.config.baseUrl = normalizeBaseUrl(this.config.baseUrl);
    if (patch.model !== undefined) this.config.model = String(this.config.model ?? '').trim();
    if (patch.apiKey !== undefined) this.config.apiKey = String(this.config.apiKey ?? '').trim();
    return this.config;
  }

  get ready() {
    return this.config.enabled && !!this.config.baseUrl && !!this.config.model;
  }

  update_url() {
    this.config.baseUrl = normalizeBaseUrl(this.config.baseUrl);
  }

  /** Effective config: stored config + an optional one-off override (form values). */
  private effective(override?: Partial<AIConfig>): AIConfig {
    const merged = { ...this.config, ...(override ?? {}) } as AIConfig;
    if (!override?.apiKey || override.apiKey === '***') merged.apiKey = this.config.apiKey;
    merged.baseUrl = normalizeBaseUrl(merged.baseUrl);
    merged.model = String(merged.model ?? '').trim();
    return merged;
  }

  async listModels(override?: Partial<AIConfig>): Promise<string[]> {
    const cfg = this.effective(override);
    if (!cfg.baseUrl) throw new Error('informe a Base URL do provider (ex.: https://integrate.api.nvidia.com/v1)');
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/models`, {
        headers: this.headers(cfg),
        signal: AbortSignal.timeout(20000),
      });
    } catch (err: any) {
      throw new Error(`não consegui falar com ${cfg.baseUrl} (${err?.cause?.code ?? err?.name ?? 'erro de rede'})`);
    }
    if (!res.ok) throw new Error(await describe(res));
    const json: any = await res.json();
    const list = json.data || json.models || [];
    return list.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
  }

  private headers(cfg: AIConfig = this.config) {
    const h: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
    if (cfg.apiKey) h.authorization = `Bearer ${cfg.apiKey}`;
    return h;
  }

  async chat(system: string, user: string, override?: Partial<AIConfig>): Promise<string> {
    const cfg = this.effective(override);
    if (!cfg.baseUrl) throw new Error('informe a Base URL do provider');
    if (!cfg.model) throw new Error('informe o nome do modelo (use “Listar modelos” para descobrir)');
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(cfg),
        signal: AbortSignal.timeout(Math.max(cfg.timeoutMs, override ? 45000 : 0)),
        body: JSON.stringify({
          model: cfg.model,
          temperature: cfg.temperature,
          max_tokens: cfg.maxTokens,
          stream: false,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
    } catch (err: any) {
      const reason = err?.name === 'TimeoutError' ? 'tempo esgotado' : err?.cause?.code ?? err?.name ?? 'erro de rede';
      throw new Error(`não consegui falar com ${cfg.baseUrl} (${reason})`);
    }
    if (!res.ok) throw new Error(await describe(res));
    const json: any = await res.json();
    const choice = json.choices?.[0]?.message;
    // alguns modelos NIM/Nemotron devolvem o texto em reasoning_content
    return choice?.content || choice?.reasoning_content || json.choices?.[0]?.text || '';
  }

  /**
   * Ask the local model for a desk-style opinion. Always resilient: if the
   * model is offline/slow the caller falls back to the heuristic engine.
   */
  async analyse(role: AgentRole, context: Record<string, unknown>): Promise<AIAnalysis | null> {
    if (!this.ready) return null;
    const system = `${ROLE_PROMPT[role]} Reply ONLY with compact JSON: {"score":0-100,"bias":"BULLISH|BEARISH|NEUTRAL","comment":"max 14 words"}. This is a SIMULATION, no real money.`;
    try {
      const raw = await this.chat(system, JSON.stringify(context));
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      const score = Number(parsed.score);
      if (!Number.isFinite(score)) return null;
      return {
        score: Math.max(0, Math.min(100, score)),
        bias: ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(parsed.bias) ? parsed.bias : 'NEUTRAL',
        comment: String(parsed.comment ?? '').slice(0, 120) || 'No comment.',
        source: 'ai',
      };
    } catch {
      return null;
    }
  }
}

export const ai = new AIProviderClient();

import type { AgentRole } from '../core/types.js';

export interface AIConfig {
  enabled: boolean;
  /** 'lmstudio' | 'ollama' | 'openai' | 'custom' — all OpenAI-compatible /chat/completions */
  provider: 'lmstudio' | 'ollama' | 'openai' | 'custom';
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
    return this.config;
  }

  get ready() {
    return this.config.enabled && !!this.config.baseUrl && !!this.config.model;
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/models`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    return (json.data || json.models || []).map((m: any) => m.id || m.name).filter(Boolean);
  }

  private headers() {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.config.apiKey || 'none'}`,
    };
  }

  async chat(system: string, user: string): Promise<string> {
    const res = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      signal: AbortSignal.timeout(this.config.timeoutMs),
      body: JSON.stringify({
        model: this.config.model,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
    const json: any = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
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

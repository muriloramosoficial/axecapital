/**
 * Briefing da mesa — resume as manchetes do crawler em um texto curto que vai
 * para o telão, para o painel lateral e para a boca do Macro/News Analyst.
 *
 * Usa o modelo de IA configurado quando ele está disponível; se não estiver
 * (ou se falhar), cai num resumo determinístico montado a partir das próprias
 * manchetes — o escritório nunca fica sem briefing.
 */

import { ai } from '../ai/provider.js';
import { wire, type Headline } from './news-crawler.js';

export interface Briefing {
  at: number;
  source: 'AI' | 'RULES';
  model?: string;
  headline: string;
  text: string;
  bias: { currency: string; stance: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; why: string }[];
  watch: string[];
  version: number;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'XAU'];

const BULL_WORDS = ['hawkish', 'surges', 'jumps', 'beats', 'stronger', 'rally', 'higher', 'rises', 'hike'];
const BEAR_WORDS = ['dovish', 'plunge', 'falls', 'misses', 'weaker', 'slump', 'lower', 'cut', 'slows', 'recession'];

function tone(title: string) {
  const t = title.toLowerCase();
  const up = BULL_WORDS.filter((w) => t.includes(w)).length;
  const down = BEAR_WORDS.filter((w) => t.includes(w)).length;
  return up === down ? 0 : up > down ? 1 : -1;
}

function rulesBriefing(items: Headline[]): Briefing {
  const scores = new Map<string, number>();
  const why = new Map<string, string>();
  for (const h of items) {
    const w = h.impact === 'HIGH' ? 2 : h.impact === 'MEDIUM' ? 1 : 0.5;
    const s = tone(h.title) * w;
    for (const c of h.currencies) {
      scores.set(c, (scores.get(c) ?? 0) + s);
      if (!why.has(c) || h.impact === 'HIGH') why.set(c, h.title.slice(0, 90));
    }
  }
  const bias = CURRENCIES.filter((c) => scores.has(c))
    .map((c) => {
      const v = scores.get(c) ?? 0;
      return {
        currency: c,
        stance: (v > 0.6 ? 'BULLISH' : v < -0.6 ? 'BEARISH' : 'NEUTRAL') as Briefing['bias'][number]['stance'],
        why: why.get(c) ?? 'fluxo sem direção clara nas manchetes',
      };
    })
    .slice(0, 5);

  const lead = items.find((h) => h.impact === 'HIGH') ?? items[0];
  const highs = items.filter((h) => h.impact === 'HIGH').length;
  return {
    at: Date.now(),
    source: 'RULES',
    headline: lead ? lead.title.slice(0, 110) : 'Mesa sem manchetes relevantes no momento',
    text: lead
      ? `${highs ? `${highs} manchete(s) de alto impacto no radar` : 'Sem manchete de alto impacto no radar'}. Destaque: ${lead.title} (${lead.source}). ` +
        `A mesa opera com atenção redobrada nos pares que envolvem ${(lead.currencies[0] ?? 'USD')}; ` +
        `tamanho de posição reduzido até o mercado digerir a notícia.`
      : 'Fluxo de notícias fraco. A mesa segue o plano técnico, sem ajuste de exposição por macro.',
    bias,
    watch: items.slice(0, 3).map((h) => h.title.slice(0, 80)),
    version: 0,
  };
}

export class BriefingDesk {
  current: Briefing | null = null;
  private version = 0;
  private running = false;
  intervalMs = 10 * 60_000;

  start() {
    if (this.running) return;
    this.running = true;
    setTimeout(() => void this.refresh(), 15_000);
    setInterval(() => void this.refresh(), this.intervalMs).unref?.();
  }

  async refresh(): Promise<Briefing> {
    const items = wire.headlines.slice(0, 12);
    let out = rulesBriefing(items);

    if (ai.ready && items.length) {
      try {
        const system =
          'Você é o macro strategist de uma mesa institucional de câmbio. Responda SOMENTE com JSON compacto: ' +
          '{"headline":"frase de até 12 palavras","text":"2 a 3 frases, português do Brasil, objetivo, sem floreio",' +
          '"bias":[{"currency":"USD","stance":"BULLISH|BEARISH|NEUTRAL","why":"até 10 palavras"}],' +
          '"watch":["o que observar nas próximas horas"]}. Isto é uma SIMULAÇÃO, nenhuma recomendação real.';
        const user = JSON.stringify({
          agora: new Date().toISOString(),
          manchetes: items.map((h) => ({ t: h.title, fonte: h.source, impacto: h.impact, moedas: h.currencies })),
        });
        const raw = await ai.chat(system, user);
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.text) {
            out = {
              at: Date.now(),
              source: 'AI',
              model: ai.config.model,
              headline: String(parsed.headline ?? out.headline).slice(0, 120),
              text: String(parsed.text).slice(0, 520),
              bias: Array.isArray(parsed.bias)
                ? parsed.bias
                    .filter((b: any) => b && b.currency)
                    .slice(0, 5)
                    .map((b: any) => ({
                      currency: String(b.currency).toUpperCase().slice(0, 4),
                      stance: ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(String(b.stance).toUpperCase())
                        ? String(b.stance).toUpperCase()
                        : 'NEUTRAL',
                      why: String(b.why ?? '').slice(0, 70),
                    }))
                : out.bias,
              watch: Array.isArray(parsed.watch) ? parsed.watch.slice(0, 4).map((w: any) => String(w).slice(0, 90)) : out.watch,
              version: 0,
            } as Briefing;
          }
        }
      } catch (err: any) {
        console.warn('[briefing] IA indisponível:', err?.message);
      }
    }

    out.version = ++this.version;
    this.current = out;
    return out;
  }

  summary(): Briefing | null {
    return this.current;
  }
}

export const briefing = new BriefingDesk();

/**
 * News wire — um crawler simples de feeds RSS financeiros.
 *
 * Roda no backend (a máquina do usuário tem internet; o ambiente de
 * desenvolvimento pode não ter). Se nenhum feed responder, o escritório
 * continua funcionando com manchetes sintéticas, marcadas como `SIM`,
 * para que as telas de notícias nunca fiquem vazias.
 */

export interface Headline {
  id: string;
  title: string;
  source: string;
  url: string;
  at: number;
  currencies: string[];
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  live: boolean;
}

export interface WireSummary {
  online: boolean;
  lastFetch: number;
  nextFetch: number;
  sources: { name: string; ok: boolean; items: number; error?: string }[];
  headlines: Headline[];
  version: number;
}

const FEEDS: { name: string; url: string }[] = [
  { name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
  { name: 'Investing', url: 'https://www.investing.com/rss/news_1.rss' },
  { name: 'Investing FX', url: 'https://www.investing.com/rss/news_1064.rss' },
  { name: 'DailyFX', url: 'https://www.dailyfx.com/feeds/market-news' },
  { name: 'CNBC Econ', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258' },
  { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { name: 'Google News FX', url: 'https://news.google.com/rss/search?q=forex+OR+%22central+bank%22+when:1d&hl=en-US&gl=US&ceid=US:en' },
];

const CUR_HINTS: Record<string, string[]> = {
  USD: ['fed', 'fomc', 'powell', 'dollar', 'u.s.', 'us ', 'treasury', 'nfp', 'payroll', 'cpi', 'pce'],
  EUR: ['ecb', 'euro', 'lagarde', 'eurozone', 'germany', 'german', 'france'],
  GBP: ['boe', 'bank of england', 'sterling', 'pound', 'uk ', 'britain', 'bailey'],
  JPY: ['boj', 'bank of japan', 'yen', 'japan', 'ueda'],
  CHF: ['snb', 'franc', 'swiss'],
  AUD: ['rba', 'aussie', 'australia'],
  NZD: ['rbnz', 'kiwi', 'new zealand'],
  CAD: ['boc', 'bank of canada', 'loonie', 'canada', 'crude', 'oil'],
  XAU: ['gold', 'bullion'],
};

const HIGH_HINTS = [
  'rate decision', 'rate cut', 'rate hike', 'fomc', 'cpi', 'inflation', 'payrolls', 'nfp', 'gdp',
  'emergency', 'intervention', 'war', 'tariff', 'default', 'crash', 'surges', 'plunge', 'shock',
];
const MED_HINTS = ['pmi', 'retail sales', 'jobless', 'sentiment', 'minutes', 'speech', 'outlook', 'forecast'];

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : null;
}

function classify(title: string) {
  const t = ` ${title.toLowerCase()} `;
  const currencies = Object.entries(CUR_HINTS)
    .filter(([, hints]) => hints.some((h) => t.includes(h)))
    .map(([cur]) => cur)
    .slice(0, 3);
  const impact: Headline['impact'] = HIGH_HINTS.some((h) => t.includes(h))
    ? 'HIGH'
    : MED_HINTS.some((h) => t.includes(h))
      ? 'MEDIUM'
      : 'LOW';
  return { currencies, impact };
}

function hashId(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hl${h.toString(36)}`;
}

const SIM_TITLES = [
  'Dólar firme antes da leitura de inflação; mercado precifica corte adiante',
  'Rendimento dos Treasuries de 10 anos testa resistência com leilão fraco',
  'Euro oscila após falas de dirigente do BCE sobre juros restritivos',
  'Iene se recupera com especulação de intervenção do Ministério das Finanças',
  'Petróleo avança com corte de oferta; CAD acompanha o movimento',
  'Ouro busca máxima semanal enquanto investidores buscam proteção',
  'Libra sob pressão após dado de varejo abaixo do esperado no Reino Unido',
  'Ações globais em compasso de espera antes do payroll americano',
  'Volatilidade implícita sobe em opções de FX de curto prazo',
  'Fluxo institucional reduz posições vendidas em dólar, mostra relatório',
];

export class NewsWire {
  headlines: Headline[] = [];
  online = false;
  lastFetch = 0;
  version = 0;
  sources: WireSummary['sources'] = [];
  intervalMs = 180_000;
  private running = false;

  /** Dispara o ciclo contínuo de coleta. */
  start() {
    if (this.running) return;
    this.running = true;
    void this.refresh();
    setInterval(() => void this.refresh(), this.intervalMs).unref?.();
  }

  async refresh() {
    const collected: Headline[] = [];
    const sources: WireSummary['sources'] = [];

    await Promise.all(
      FEEDS.map(async (feed) => {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 9000);
          const res = await fetch(feed.url, {
            signal: ctrl.signal,
            headers: { 'user-agent': 'Mozilla/5.0 (AxeCapital news wire)' },
          });
          clearTimeout(timer);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const xml = await res.text();
          const items = xml.split(/<item[\s>]/i).slice(1, 16);
          let n = 0;
          for (const raw of items) {
            const chunk = raw.split(/<\/item>/i)[0];
            const title = tag(chunk, 'title');
            if (!title || title.length < 12) continue;
            const link = tag(chunk, 'link') ?? '';
            const date = tag(chunk, 'pubDate') ?? tag(chunk, 'dc:date') ?? '';
            const at = date ? Date.parse(date) || Date.now() : Date.now();
            const { currencies, impact } = classify(title);
            collected.push({
              id: hashId(title),
              title: title.slice(0, 180),
              source: feed.name,
              url: link,
              at,
              currencies,
              impact,
              live: true,
            });
            n++;
          }
          sources.push({ name: feed.name, ok: true, items: n });
        } catch (err: any) {
          sources.push({ name: feed.name, ok: false, items: 0, error: String(err?.message ?? err).slice(0, 80) });
        }
      }),
    );

    this.sources = sources;
    this.lastFetch = Date.now();

    if (collected.length) {
      const seen = new Set<string>();
      this.headlines = collected
        .filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)))
        .sort((a, b) => b.at - a.at)
        .slice(0, 60);
      this.online = true;
    } else {
      this.online = false;
      if (!this.headlines.length || this.headlines.every((h) => !h.live)) this.headlines = this.synthetic();
    }
    this.version++;
    return this.headlines;
  }

  /** Manchetes de contingência quando a máquina está sem internet. */
  private synthetic(): Headline[] {
    const now = Date.now();
    return SIM_TITLES.map((title, i) => {
      const { currencies, impact } = classify(title);
      return {
        id: hashId(title),
        title,
        source: 'SIM WIRE',
        url: '',
        at: now - i * 7 * 60_000,
        currencies: currencies.length ? currencies : ['USD'],
        impact,
        live: false,
      };
    });
  }

  /** Manchetes relevantes para um par específico (EURUSD → EUR ou USD). */
  forSymbol(symbol: string, limit = 6): Headline[] {
    const curs = [symbol.slice(0, 3), symbol.slice(3, 6)];
    const hit = this.headlines.filter((h) => h.currencies.some((c) => curs.includes(c)));
    return (hit.length ? hit : this.headlines).slice(0, limit);
  }

  summary(limit = 28): WireSummary {
    return {
      online: this.online,
      lastFetch: this.lastFetch,
      nextFetch: this.lastFetch + this.intervalMs,
      sources: this.sources,
      headlines: this.headlines.slice(0, limit),
      version: this.version,
    };
  }
}

export const wire = new NewsWire();

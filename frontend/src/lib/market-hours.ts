/**
 * Horário de mercado por ativo (aproximado, em UTC).
 *
 * FX e metais rodam 24×5: abrem domingo 21:00 UTC e fecham sexta 21:00 UTC.
 * Índices e petróleo têm pausa diária; cripto não fecha nunca. É o suficiente
 * para a mesa saber quem está operando e quem deveria estar no descanso.
 */

export type MarketClass = 'FX' | 'METAL' | 'INDEX' | 'ENERGY' | 'CRYPTO';

export function classOf(symbol: string): MarketClass {
  const s = (symbol ?? '').toUpperCase();
  if (/^(BTC|ETH|XRP|SOL|DOGE|LTC|ADA)/.test(s)) return 'CRYPTO';
  if (/^XAU|^XAG|GOLD|SILVER/.test(s)) return 'METAL';
  if (/^(US30|US100|US500|NAS|SPX|DJI|GER|DE30|DAX|UK100|JP225)/.test(s)) return 'INDEX';
  if (/^(WTI|BRENT|USOIL|UKOIL|XTI|XBR)/.test(s)) return 'ENERGY';
  return 'FX';
}

/** Mercado aberto para este ativo no instante informado (ms epoch). */
export function isMarketOpen(symbol: string | undefined, at: number = Date.now()): boolean {
  if (!symbol) return true;
  const kind = classOf(symbol);
  if (kind === 'CRYPTO') return true;

  const d = new Date(at);
  const day = d.getUTCDay(); // 0 = domingo
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60;

  // fim de semana: fecha sexta 21:00 UTC, abre domingo 21:00 UTC
  if (day === 6) return false;
  if (day === 5 && hour >= 21) return false;
  if (day === 0 && hour < 21) return false;

  // índices e energia param no intervalo diário de manutenção
  if ((kind === 'INDEX' || kind === 'ENERGY') && hour >= 20.75 && hour < 22) return false;
  return true;
}

/** Texto curto para a HUD/legenda. */
export function marketStatusLabel(symbol: string | undefined, at: number = Date.now()) {
  return isMarketOpen(symbol, at) ? 'mercado aberto' : 'mercado fechado';
}

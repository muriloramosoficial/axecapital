import { uid } from '../core/event-bus.js';
import type { NewsEvent } from '../core/types.js';

const TEMPLATES: { currency: string; title: string; impact: NewsEvent['impact'] }[] = [
  { currency: 'USD', title: 'CPI y/y', impact: 'HIGH' },
  { currency: 'USD', title: 'Non-Farm Payrolls', impact: 'HIGH' },
  { currency: 'USD', title: 'FOMC Rate Decision', impact: 'HIGH' },
  { currency: 'USD', title: 'Core PCE m/m', impact: 'HIGH' },
  { currency: 'USD', title: 'ISM Manufacturing PMI', impact: 'MEDIUM' },
  { currency: 'USD', title: 'Unemployment Claims', impact: 'MEDIUM' },
  { currency: 'EUR', title: 'ECB Rate Decision', impact: 'HIGH' },
  { currency: 'EUR', title: 'Flash CPI y/y', impact: 'MEDIUM' },
  { currency: 'EUR', title: 'German Flash PMI', impact: 'MEDIUM' },
  { currency: 'GBP', title: 'BoE Bank Rate', impact: 'HIGH' },
  { currency: 'GBP', title: 'GDP m/m', impact: 'MEDIUM' },
  { currency: 'JPY', title: 'BoJ Policy Statement', impact: 'HIGH' },
  { currency: 'JPY', title: 'Tokyo Core CPI', impact: 'LOW' },
  { currency: 'CAD', title: 'BoC Rate Statement', impact: 'HIGH' },
  { currency: 'AUD', title: 'RBA Rate Statement', impact: 'HIGH' },
  { currency: 'CHF', title: 'SNB Policy Assessment', impact: 'MEDIUM' },
];

export function buildCalendar(simNow: number, hours = 9): NewsEvent[] {
  const out: NewsEvent[] = [];
  let t = simNow + (22 + Math.random() * 25) * 60_000;
  while (t < simNow + hours * 3600_000) {
    const tpl = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    out.push({
      id: uid('news'),
      currency: tpl.currency,
      title: tpl.title,
      impact: tpl.impact,
      at: Math.round(t),
      forecast: fmt(),
      previous: fmt(),
      released: false,
    });
    t += (18 + Math.random() * 45) * 60_000;
  }
  return out;
}

export function makeBreakingNews(simNow: number, currency = 'USD'): NewsEvent {
  const titles = [
    'Surprise central bank commentary',
    'Flash headline: policy maker speech',
    'Unscheduled liquidity operation',
    'Geopolitical headline hits the wires',
    'Large sovereign flow reported',
  ];
  return {
    id: uid('news'),
    currency,
    title: titles[Math.floor(Math.random() * titles.length)],
    impact: 'HIGH',
    at: simNow + 60_000,
    released: false,
  };
}

const fmt = () => `${(Math.random() * 4).toFixed(1)}%`;
export const actualFor = () => `${(Math.random() * 4).toFixed(1)}%`;

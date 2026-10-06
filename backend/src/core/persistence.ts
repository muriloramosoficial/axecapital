import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Local, human-readable persistence of everything the USER configured:
 * AI provider, MT5 bridge URL, execution routing, watchlist and the staff that
 * was hired. Kept out of git (see .gitignore) so an update never wipes it.
 */

const here = path.dirname(fileURLToPath(import.meta.url)); // backend/{src,dist}/core
export const ROOT = path.resolve(here, '../../..');
export const DATA_DIR = process.env.AXE_DATA_DIR || path.join(ROOT, 'data');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export interface PersistedAgent {
  role: string;
  name: string;
  symbol?: string;
  deskId: string;
  config: { aggressiveness: number; maxRiskPct: number; useAI: boolean };
}

export interface PersistedState {
  version: 1;
  savedAt: string;
  ai?: Record<string, unknown>;
  bridgeUrl?: string;
  sim?: {
    speed?: number;
    running?: boolean;
    regime?: string;
    autoRegime?: boolean;
    maxExposurePct?: number;
    executionMode?: 'SIMULATION' | 'MT5_LIVE';
  };
  watchlist?: string[];
  agents?: PersistedAgent[];
}

export function loadState(): PersistedState | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as PersistedState;
    if (!raw || raw.version !== 1) return null;
    return raw;
  } catch (err) {
    console.warn('[persistence] could not read config.json:', (err as Error).message);
    return null;
  }
}

let pending: PersistedState | null = null;
let timer: NodeJS.Timeout | null = null;

/** Debounced write — safe to call on every mutation. */
export function saveState(state: Omit<PersistedState, 'version' | 'savedAt'>) {
  pending = { version: 1, savedAt: new Date().toISOString(), ...state };
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const data = pending;
    pending = null;
    if (!data) return;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.warn('[persistence] could not write config.json:', (err as Error).message);
    }
  }, 800);
}

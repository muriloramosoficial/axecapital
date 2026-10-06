import type { AIConfig, Agent, AgentRole, SymbolInfo } from '../types';

const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText })))?.error ?? 'request failed');
  return res.json();
};

export const api = {
  snapshot: () => json<any>('/api/snapshot'),
  symbols: () => json<{ source: string; symbols: SymbolInfo[] }>('/api/symbols'),
  mt5Status: () => json<any>('/api/mt5/status'),
  setBridgeUrl: (url: string) => json<any>('/api/mt5/bridge-url', { method: 'POST', body: JSON.stringify({ url }) }),
  hire: (body: { role: AgentRole; name?: string; symbol?: string; deskId?: string; aggressiveness?: number; maxRiskPct?: number; useAI?: boolean }) =>
    json<Agent>('/api/agents', { method: 'POST', body: JSON.stringify(body) }),
  fire: (id: string) => json<any>(`/api/agents/${id}`, { method: 'DELETE' }),
  updateAgent: (id: string, patch: any) => json<Agent>(`/api/agents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  agents: () => json<any>('/api/agents'),
  control: (body: Record<string, unknown>) => json<any>('/api/sim/control', { method: 'POST', body: JSON.stringify(body) }),
  reset: () => json<any>('/api/sim/reset', { method: 'POST' }),
  injectEvent: () => json<any>('/api/sim/event', { method: 'POST' }),
  closePosition: (id: string) => json<any>(`/api/positions/${id}/close`, { method: 'POST' }),
  aiConfig: () => json<AIConfig>('/api/ai/config'),
  setAiConfig: (patch: Partial<AIConfig>) => json<AIConfig>('/api/ai/config', { method: 'POST', body: JSON.stringify(patch) }),
  aiModels: () => json<{ models: string[] }>('/api/ai/models'),
  aiTest: () => json<{ ok: boolean; text?: string; error?: string }>('/api/ai/test', { method: 'POST' }),
};

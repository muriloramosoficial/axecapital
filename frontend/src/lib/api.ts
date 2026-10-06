import type { AIConfig, Agent, AgentRole, BrainSummary, SymbolInfo } from '../types';

/** Token de sessão do backoffice (guardado pelo /admin). */
export const adminToken = {
  get: () => (typeof localStorage === 'undefined' ? null : localStorage.getItem('axe.admin.token')),
  set: (v: string | null) => (v ? localStorage.setItem('axe.admin.token', v) : localStorage.removeItem('axe.admin.token')),
};

const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const token = adminToken.get();
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText })))?.error ?? 'request failed');
  return res.json();
};

export const api = {
  snapshot: () => json<any>('/api/snapshot'),
  symbols: () => json<{ source: string; symbols: SymbolInfo[] }>('/api/symbols'),
  mt5Status: () => json<any>('/api/mt5/status'),
  mt5Connect: (paper = false) =>
    json<{ ok: boolean; paper: boolean; mode: string; checks: { id: string; label: string; ok: boolean; detail: string }[]; account: any; bridgeUrl: string }>(
      '/api/mt5/connect',
      { method: 'POST', body: JSON.stringify({ paper }) },
    ),
  mt5Disconnect: () => json<any>('/api/mt5/disconnect', { method: 'POST' }),
  aiForAll: (useAI: boolean) => json<any>('/api/agents/ai-all', { method: 'POST', body: JSON.stringify({ useAI }) }),
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
  brain: (id: string) => json<{ agent: any; brain: BrainSummary }>(`/api/agents/${id}/brain`),
  resetBrain: (id: string) => json<any>(`/api/agents/${id}/brain/reset`, { method: 'POST' }),
  brains: () => json<{ brains: any[] }>('/api/brains'),
  aiConfig: () => json<AIConfig>('/api/ai/config'),
  setAiConfig: (patch: Partial<AIConfig>) => json<AIConfig>('/api/ai/config', { method: 'POST', body: JSON.stringify(patch) }),
  /** draft = valores atuais do formulário, testados sem precisar salvar antes */
  aiModels: (draft?: Partial<AIConfig>) =>
    json<{ models: string[] }>('/api/ai/models', { method: 'POST', body: JSON.stringify(draft ?? {}) }),
  adminInfo: () => json<{ user: string; mustChangePassword: boolean }>('/api/admin/info'),
  adminLogin: (user: string, password: string) =>
    json<{ token: string; user: string; mustChangePassword: boolean }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ user, password }),
    }),
  adminSession: () => json<{ ok: boolean; user: string }>('/api/admin/session'),
  adminLogout: () => json<{ ok: boolean }>('/api/admin/logout', { method: 'POST' }),
  adminPassword: (currentPassword: string, newPassword: string, user?: string) =>
    json<{ ok: boolean; error?: string }>('/api/admin/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, user }),
    }),
  aiTest: (draft?: Partial<AIConfig>) =>
    json<{ ok: boolean; text?: string; error?: string; ms?: number }>('/api/ai/test', {
      method: 'POST',
      body: JSON.stringify(draft ?? {}),
    }),
};

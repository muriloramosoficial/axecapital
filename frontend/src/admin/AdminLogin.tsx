import { useEffect, useState } from 'react';
import { adminToken, api } from '../lib/api';

/**
 * Porta de entrada do backoffice.
 *
 * Proteção simples para instalação local/LAN: usuário + senha validados no
 * engine (hash scrypt em `data/admin.json`) e token de sessão de 12h guardado
 * no navegador. Credenciais de fábrica: admin / axecapital.
 */
export function AdminGate({ children }: { children: (ctx: { user: string; logout: () => void }) => React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
  const [user, setUser] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<{ user: string; mustChangePassword: boolean } | null>(null);

  useEffect(() => {
    document.title = 'Axe Capital · Backoffice';
    api
      .adminInfo()
      .then((i) => {
        setHint(i);
        setUser(i.user);
      })
      .catch(() => {});
    if (!adminToken.get()) {
      setState('out');
      return;
    }
    api
      .adminSession()
      .then((s) => {
        setUser(s.user);
        setState('in');
      })
      .catch(() => {
        adminToken.set(null);
        setState('out');
      });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const out = await api.adminLogin(user, password);
      adminToken.set(out.token);
      setUser(out.user);
      setPassword('');
      setState('in');
    } catch (err: any) {
      setError(err?.message ?? 'não foi possível entrar');
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    api.adminLogout().catch(() => {});
    adminToken.set(null);
    setState('out');
  };

  if (state === 'checking') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#070b11] text-[11px] uppercase tracking-[0.3em] text-slate-500">
        verificando sessão…
      </div>
    );
  }

  if (state === 'in') return <>{children({ user, logout })}</>;

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#070b11] px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.07),transparent_60%)]" />
      <form
        onSubmit={submit}
        className="relative w-full max-w-[340px] rounded-2xl border border-white/8 bg-[#0c121a] p-6 shadow-panel"
      >
        <div className="text-[14px] font-semibold uppercase tracking-[0.34em] text-slate-100">Axe Capital</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.26em] text-emerald-400/80">Backoffice</div>

        <label className="mt-6 block text-[10px] uppercase tracking-[0.2em] text-slate-500">Usuário</label>
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          autoFocus
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-emerald-400/50"
        />

        <label className="mt-4 block text-[10px] uppercase tracking-[0.2em] text-slate-500">Senha</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-emerald-400/50"
        />

        {error && <div className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-emerald-400/15 px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.2em] text-emerald-300 transition hover:bg-emerald-400/25 disabled:opacity-50"
        >
          {busy ? 'entrando…' : 'entrar'}
        </button>

        {hint?.mustChangePassword && (
          <p className="mt-4 text-[10px] leading-snug text-slate-500">
            Primeiro acesso: usuário <span className="text-slate-300">{hint.user}</span> · senha{' '}
            <span className="text-slate-300">axecapital</span>. Troque em <span className="text-slate-300">Acesso</span> depois
            de entrar.
          </p>
        )}

        <a href="/" className="mt-4 block text-center text-[10px] uppercase tracking-[0.2em] text-slate-600 hover:text-slate-300">
          ← voltar ao escritório
        </a>
      </form>
    </div>
  );
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './persistence.js';

/**
 * Autenticação do backoffice (/admin).
 *
 * É uma proteção simples, pensada para uma instalação local/LAN: usuário +
 * senha com hash scrypt em `data/admin.json` e tokens de sessão em memória.
 * Não substitui um IdP; serve para ninguém mexer na mesa sem permissão e para
 * o painel não ficar aberto numa live.
 *
 * Credenciais padrão (primeiro boot): admin / axecapital
 * Podem ser sobrescritas por AXE_ADMIN_USER / AXE_ADMIN_PASSWORD.
 */

const FILE = path.join(DATA_DIR, 'admin.json');
const TTL_MS = 12 * 60 * 60 * 1000; // 12h de sessão

export const DEFAULT_USER = process.env.AXE_ADMIN_USER || 'admin';
export const DEFAULT_PASSWORD = process.env.AXE_ADMIN_PASSWORD || 'axecapital';

interface AdminFile {
  version: 1;
  user: string;
  salt: string;
  hash: string;
  /** true enquanto a senha ainda for a padrão — a UI pede a troca */
  isDefault: boolean;
  updatedAt: string;
}

function hash(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

function write(file: AdminFile) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(file, null, 2), 'utf8');
}

function read(): AdminFile {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as AdminFile;
    if (raw?.version === 1 && raw.salt && raw.hash) return raw;
  } catch {
    /* primeiro boot ou arquivo corrompido → recria */
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const fresh: AdminFile = {
    version: 1,
    user: DEFAULT_USER,
    salt,
    hash: hash(DEFAULT_PASSWORD, salt),
    isDefault: true,
    updatedAt: new Date().toISOString(),
  };
  write(fresh);
  console.log(`[axe-capital] backoffice: usuário "${DEFAULT_USER}" / senha "${DEFAULT_PASSWORD}" (troque em /admin#conta)`);
  return fresh;
}

const sessions = new Map<string, { user: string; expires: number }>();

function sweep() {
  const now = Date.now();
  for (const [t, s] of sessions) if (s.expires < now) sessions.delete(t);
}

export const adminAuth = {
  /** Usuário configurado + se a senha ainda é a de fábrica. */
  info() {
    const f = read();
    return { user: f.user, mustChangePassword: f.isDefault };
  },

  login(user: string, password: string) {
    const f = read();
    const okUser = (user ?? '').trim().toLowerCase() === f.user.toLowerCase();
    const candidate = hash(password ?? '', f.salt);
    const okPass =
      candidate.length === f.hash.length &&
      crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(f.hash, 'hex'));
    if (!okUser || !okPass) return null;
    sweep();
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { user: f.user, expires: Date.now() + TTL_MS });
    return { token, user: f.user, mustChangePassword: f.isDefault, expiresIn: TTL_MS };
  },

  verify(token?: string | null) {
    if (!token) return null;
    sweep();
    const s = sessions.get(token);
    if (!s) return null;
    s.expires = Date.now() + TTL_MS; // sessão deslizante
    return { user: s.user };
  },

  logout(token?: string | null) {
    if (token) sessions.delete(token);
  },

  changePassword(currentPassword: string, nextPassword: string, nextUser?: string) {
    const f = read();
    if (hash(currentPassword ?? '', f.salt) !== f.hash) return { ok: false, error: 'senha atual incorreta' };
    if (!nextPassword || nextPassword.length < 6) return { ok: false, error: 'a nova senha precisa de ao menos 6 caracteres' };
    const salt = crypto.randomBytes(16).toString('hex');
    write({
      version: 1,
      user: (nextUser ?? f.user).trim() || f.user,
      salt,
      hash: hash(nextPassword, salt),
      isDefault: false,
      updatedAt: new Date().toISOString(),
    });
    sessions.clear();
    return { ok: true };
  },
};

/** Middleware: exige `Authorization: Bearer <token>`. */
export function requireAdmin(req: any, res: any, next: any) {
  const header = String(req.headers.authorization ?? '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-axe-token'] as string | undefined);
  const session = adminAuth.verify(token);
  if (!session) return res.status(401).json({ error: 'não autenticado' });
  req.admin = session;
  next();
}

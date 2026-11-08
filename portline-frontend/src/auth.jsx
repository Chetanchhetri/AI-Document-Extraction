import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokens } from './api.js';
const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!tokens.access);
  const loadMe = useCallback(async () => { const u = await api.me(); setUser(u); return u; }, []);
  useEffect(() => {
    if (tokens.access) loadMe().catch(() => tokens.clear()).finally(() => setReady(true));
    const out = () => setUser(null);
    window.addEventListener('auth:expired', out);
    return () => window.removeEventListener('auth:expired', out);
  }, [loadMe]);
  const login = async (email, password) => {
    const d = await api.login({ email, password });
    tokens.set(d.access_token ?? d.accessToken, d.refresh_token ?? d.refreshToken);
    return loadMe();
  };
  const logout = async () => { try { await api.logout(); } catch { /* token may already be invalid */ } tokens.clear(); setUser(null); };
  const role = user?.role;
  return <Ctx.Provider value={{ user, ready, login, logout, isManager: role === 'manager' || role === 'super_admin', isAdmin: role === 'super_admin' }}>{children}</Ctx.Provider>;
}

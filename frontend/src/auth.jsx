import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setToken } from "./api/client";
import { setTz } from "./ui";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const tz = api("/api/health").then((h) => setTz(h.timezone)).catch(() => {});
    const me = sessionStorage.getItem("token") ? api("/api/auth/me").then(setUser).catch(() => setToken(null)) : Promise.resolve();
    Promise.all([tz, me]).finally(() => setReady(true));
    const expired = () => setUser(null);
    window.addEventListener("auth-expired", expired);
    return () => window.removeEventListener("auth-expired", expired);
  }, []);

  const login = useCallback(async (role, username, password) => {
    const r = await api("/api/auth/login", { method: "POST", body: { role, username, password } });
    setToken(r.access_token); setUser(r.user); return r.user;
  }, []);
  const logout = useCallback(() => { setToken(null); setUser(null); }, []);
  const refresh = useCallback(() => api("/api/auth/me").then(setUser), []);

  return <Ctx.Provider value={{ user, ready, login, logout, refresh }}>{children}</Ctx.Provider>;
}

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const API_BASE = import.meta.env.DEV ? "/api" : "";

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  needsSetup: boolean;
  username: string | null;
  token: string | null;
  login: (username: string, password: string) => Promise<string | null>;
  setup: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
  setUsername: (name: string) => void;
}

const AuthContext = createContext<AuthState>(null!);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [username, setUsernameState] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("echobus_session"));

  // Check auth status on mount
  useEffect(() => {
    (async () => {
      try {
        // First check if admin is set up
        const statusRes = await fetch(`${API_BASE}/auth/status`);
        const status = await statusRes.json();

        if (!status.setup) {
          setNeedsSetup(true);
          setIsLoading(false);
          return;
        }

        // Admin exists — verify stored session
        if (token) {
          const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (verifyRes.ok) {
            const data = await verifyRes.json();
            setIsAuthenticated(true);
            setUsernameState(data.username);
          } else {
            // Session expired
            localStorage.removeItem("echobus_session");
            setToken(null);
          }
        }
      } catch {
        // API not reachable — show login anyway
      }
      setIsLoading(false);
    })();
  }, [token]);

  const login = useCallback(async (user: string, pass: string): Promise<string | null> => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const data = await res.json();
    if (!res.ok) return data.error || "Login failed";
    localStorage.setItem("echobus_session", data.token);
    setToken(data.token);
    setIsAuthenticated(true);
    setUsernameState(data.username);
    return null;
  }, []);

  const setup = useCallback(async (user: string, pass: string): Promise<string | null> => {
    const res = await fetch(`${API_BASE}/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const data = await res.json();
    if (!res.ok) return data.error || "Setup failed";
    localStorage.setItem("echobus_session", data.token);
    setToken(data.token);
    setIsAuthenticated(true);
    setNeedsSetup(false);
    setUsernameState(data.username);
    return null;
  }, []);

  const logout = useCallback(() => {
    if (token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem("echobus_session");
    setToken(null);
    setIsAuthenticated(false);
    setUsernameState(null);
  }, [token]);

  const setUsername = useCallback((name: string) => {
    setUsernameState(name);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isLoading, isAuthenticated, needsSetup, username, token, login, setup, logout, setUsername }}
    >
      {children}
    </AuthContext.Provider>
  );
}

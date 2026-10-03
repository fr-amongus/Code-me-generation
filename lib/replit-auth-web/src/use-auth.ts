import { useCallback, useEffect, useState } from 'react';
export type AuthUser = {
  id: string;
  username: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

export type AuthMethod = 'password' | 'replit';

interface AuthState {
  user: AuthUser | null;
  authMethod: AuthMethod | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
}

function getBasePath() {
  return document.querySelector('base')?.getAttribute('href')?.replace(/\/+$/, '') || '/';
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/auth/user', { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { user: AuthUser | null; authMethod: AuthMethod | null };
    setUser(data.user ?? null);
    setAuthMethod(data.authMethod ?? null);
    setIsLoading(false);
    return data.user ?? null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    refresh()
      .then(() => undefined)
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setAuthMethod(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const login = useCallback(() => {
    const base = getBasePath();
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base)}`;
  }, []);

  const logout = useCallback(async () => {
    if (authMethod === 'password') {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setUser(null);
      setAuthMethod(null);
      return;
    }
    const base = getBasePath();
    window.location.href = `/api/logout?returnTo=${encodeURIComponent(base)}`;
  }, [authMethod]);

  return {
    user,
    authMethod,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refresh,
  };
}

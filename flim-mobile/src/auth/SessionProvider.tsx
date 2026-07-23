import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { flimApi } from "@/api/flimApi";
import type { CurrentUser } from "@/api/types";

interface SessionContextValue {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  refreshSession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, handle: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await flimApi.getSession();
      setUser(payload.user);
    } catch {
      setUser(null);
      setError("We could not refresh your Flim session.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await flimApi.signIn(email, password);
      setUser(payload.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, handle: string, displayName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await flimApi.signUp(email, password, handle, displayName);
      setUser(payload.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await flimApi.logout();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, refreshSession, signIn, signUp, logout }),
    [user, loading, error, refreshSession, signIn, signUp, logout]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}

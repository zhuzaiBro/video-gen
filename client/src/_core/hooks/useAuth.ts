import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { api, type AppUser } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null;
  user: AppUser | null;
  loading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAppUser = useCallback(async (accessToken: string | undefined) => {
    if (!accessToken) {
      setUser(null);
      return;
    }
    try {
      const appUser = await api.get<AppUser>("/auth/me");
      setUser(appUser);
      setError(null);
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err : new Error("Failed to fetch user"));
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      fetchAppUser(data.session?.access_token).finally(() => {
        if (mounted) setLoading(false);
      });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(true);
      fetchAppUser(nextSession?.access_token).finally(() => setLoading(false));
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [fetchAppUser]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  }, []);

  const state: AuthState = useMemo(
    () => ({
      session,
      user,
      loading,
      error,
      isAuthenticated: Boolean(session),
    }),
    [session, user, loading, error]
  );

  return {
    ...state,
    refresh: () => fetchAppUser(session?.access_token),
    logout,
  };
}

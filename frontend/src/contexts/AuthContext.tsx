import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import type { User } from "../api/types";
import { AuthContext } from "./authContextValue";

const APPLE_AUTH_URL = "https://appleid.apple.com/auth/authorize";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initialised = useRef(false);

  const fetchUser = useCallback(async () => {
    try {
      const data = await api.get<User>("/api/v1/users/me/");
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    fetchUser().finally(() => setIsLoading(false));
  }, [fetchUser]);

  const login = useCallback(() => {
    const params = new URLSearchParams({
      client_id: import.meta.env.VITE_APPLE_CLIENT_ID ?? "",
      redirect_uri: `${window.location.origin}/api/v1/auth/apple/callback`,
      response_type: "code id_token",
      scope: "email",
      response_mode: "form_post",
    });
    window.location.href = `${APPLE_AUTH_URL}?${params.toString()}`;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/v1/auth/logout/");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, logout, refreshUser: fetchUser }),
    [user, isLoading, login, logout, fetchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

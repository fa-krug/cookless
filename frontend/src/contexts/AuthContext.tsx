import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import type { User } from "../api/types";
import { loginWithPasskey, registerPasskey } from "../api/webauthn";
import { AuthContext } from "./authContextValue";

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

  const login = useCallback(async (email: string) => {
    const loggedInUser = await loginWithPasskey(email);
    setUser(loggedInUser);
  }, []);

  const register = useCallback(async (email: string, inviteCode: string) => {
    const newUser = await registerPasskey(email, inviteCode, navigator.userAgent);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/v1/auth/logout/");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout, refreshUser: fetchUser }),
    [user, isLoading, login, register, logout, fetchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

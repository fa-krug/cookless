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

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const loggedInUser = await api.post<User>("/api/v1/auth/login/password/", {
      email,
      password,
    });
    setUser(loggedInUser);
  }, []);

  const register = useCallback(async (email: string, inviteCode: string) => {
    const newUser = await registerPasskey(email, inviteCode, navigator.userAgent);
    setUser(newUser);
  }, []);

  const registerWithPassword = useCallback(
    async (email: string, password: string, inviteCode: string) => {
      const newUser = await api.post<User>("/api/v1/auth/register/password/", {
        email,
        password,
        invite_code: inviteCode,
      });
      setUser(newUser);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/api/v1/auth/logout/");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      login,
      loginWithPassword,
      register,
      registerWithPassword,
      logout,
      refreshUser: fetchUser,
    }),
    [user, isLoading, login, loginWithPassword, register, registerWithPassword, logout, fetchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

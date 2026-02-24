import { createContext } from "react";
import type { User } from "../api/types";

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string) => Promise<void>;
  register: (email: string, inviteCode: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

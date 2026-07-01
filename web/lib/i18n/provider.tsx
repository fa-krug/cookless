"use client";

import { createContext, useContext, useMemo } from "react";
import {
  translate,
  translateList,
  type Dictionary,
  type TVars,
} from "./translate";
import type { Locale } from "./config";

type Ctx = { locale: Locale; dict: Dictionary };

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within an I18nProvider");
  return {
    locale: ctx.locale,
    t: (key: string, vars?: TVars) => translate(ctx.dict, key, vars),
    tList: (key: string) => translateList(ctx.dict, key),
  };
}

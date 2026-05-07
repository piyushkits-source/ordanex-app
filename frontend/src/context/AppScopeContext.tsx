import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type AppScope = {
  clientId: string;
  clientName: string;
  verticalId: string;
  verticalName: string;
  environment: string;
};

type AppScopeContextType = {
  scope: AppScope;
  setClientScope: (payload: { clientId: string; clientName?: string }) => void;
  setVerticalScope: (payload: { verticalId: string; verticalName?: string }) => void;
  setEnvironmentScope: (environment: string) => void;
  clearScope: () => void;
};

const STORAGE_KEY = "ordanet_app_scope";

const defaultScope: AppScope = {
  clientId: "",
  clientName: "",
  verticalId: "",
  verticalName: "",
  environment: "PROD",
};

const AppScopeContext = createContext<AppScopeContextType | undefined>(undefined);

export function AppScopeProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<AppScope>(defaultScope);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setScope({
          clientId: parsed.clientId || "",
          clientName: parsed.clientName || "",
          verticalId: parsed.verticalId || "",
          verticalName: parsed.verticalName || "",
          environment: parsed.environment || "PROD",
        });
      }
    } catch {
      setScope(defaultScope);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scope));
  }, [scope]);

  const value = useMemo<AppScopeContextType>(
    () => ({
      scope,
      setClientScope: ({ clientId, clientName = "" }) => {
        setScope((prev) => ({
          ...prev,
          clientId,
          clientName,
          verticalId: "",
          verticalName: "",
        }));
      },
      setVerticalScope: ({ verticalId, verticalName = "" }) => {
        setScope((prev) => ({
          ...prev,
          verticalId,
          verticalName,
        }));
      },
      setEnvironmentScope: (environment: string) => {
        setScope((prev) => ({
          ...prev,
          environment: environment || "PROD",
        }));
      },
      clearScope: () => setScope(defaultScope),
    }),
    [scope]
  );

  return <AppScopeContext.Provider value={value}>{children}</AppScopeContext.Provider>;
}

export function useAppScope() {
  const ctx = useContext(AppScopeContext);
  if (!ctx) {
    throw new Error("useAppScope must be used inside AppScopeProvider");
  }
  return ctx;
}

"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { UserRole } from "@/lib/types";

type RoleContextValue = {
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({
  children,
  initialRole = "REP",
}: {
  children: React.ReactNode;
  initialRole?: UserRole;
}) {
  const [activeRole, setActiveRole] = useState<UserRole>(initialRole);

  useEffect(() => {
    let isActive = true;

    async function loadRole() {
      try {
        const response = await fetch("/api/profile", { cache: "no-store", credentials: "include" });
        if (!response.ok) return;

        const payload = (await response.json().catch(() => null)) as { role?: UserRole } | null;
        if (!isActive || !payload?.role) return;
        setActiveRole(payload.role);
      } catch {
        // Keep the UI usable with the default role if profile lookup fails.
      }
    }

    void loadRole();
    return () => {
      isActive = false;
    };
  }, []);

  const value = useMemo(() => ({ activeRole, setActiveRole }), [activeRole]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}

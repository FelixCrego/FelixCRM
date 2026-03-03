import { DashboardShell } from "@/components/dashboard-shell";
import { RoleProvider } from "@/components/role-context";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <DashboardShell>{children}</DashboardShell>
    </RoleProvider>
  );
}

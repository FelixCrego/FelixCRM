import { DashboardShell } from "@/components/dashboard-shell";
import { RoleProvider } from "@/components/role-context";
import { AmazonConnectProvider } from "@/components/amazon-connect-provider";
import { SessionActivityTracker } from "@/components/session-activity-tracker";
import { getAuthenticatedUser } from "@/lib/auth";
import { getEffectiveUserRole } from "@/lib/store";
import type { UserRole } from "@/lib/types";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser().catch(() => null);
  const initialRole: UserRole = user?.id
    ? await getEffectiveUserRole(user.id, user.email).catch(() => "REP" as UserRole)
    : "REP";

  return (
    <RoleProvider initialRole={initialRole}>
      <AmazonConnectProvider>
        <SessionActivityTracker />
        <DashboardShell>{children}</DashboardShell>
      </AmazonConnectProvider>
    </RoleProvider>
  );
}

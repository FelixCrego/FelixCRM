import { DashboardShell } from "@/components/dashboard-shell";
import { RoleProvider } from "@/components/role-context";
import { AmazonConnectProvider } from "@/components/amazon-connect-provider";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <AmazonConnectProvider>
        <DashboardShell>{children}</DashboardShell>
      </AmazonConnectProvider>
    </RoleProvider>
  );
}

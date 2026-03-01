-- Add RBAC roles for CRM users
CREATE TYPE "UserRole" AS ENUM ('REP', 'MANAGER', 'TEAM_LEAD', 'SUPER_ADMIN');

ALTER TABLE "User"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'REP';

CREATE INDEX "User_role_idx" ON "User"("role");

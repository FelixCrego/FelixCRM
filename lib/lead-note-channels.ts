import type { UserRole } from "@/lib/types";

export const MANAGER_CALL_REVIEW_CHANNEL = "manager_call_review";
export const TRAINING_HALL_OF_FAME_CHANNEL = "training_hall_of_fame";
export const TRAINING_HALL_OF_SHAME_CHANNEL = "training_hall_of_shame";

export type TrainingTapeBucket = "HALL_OF_FAME" | "HALL_OF_SHAME";

const LEADERSHIP_ROLES = new Set<UserRole>(["MANAGER", "TEAM_LEAD", "SUPER_ADMIN"]);

export function isLeadershipRole(role: string | null | undefined): role is UserRole {
  return typeof role === "string" && LEADERSHIP_ROLES.has(role as UserRole);
}

export function getTrainingBucketFromChannel(channel: string | null | undefined): TrainingTapeBucket | null {
  const normalized = typeof channel === "string" ? channel.trim().toLowerCase() : "";
  if (normalized === TRAINING_HALL_OF_FAME_CHANNEL) return "HALL_OF_FAME";
  if (normalized === TRAINING_HALL_OF_SHAME_CHANNEL) return "HALL_OF_SHAME";
  return null;
}

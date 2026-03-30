import type { Lead } from "@/lib/types";

export type LeadWorkspaceStatus =
  | "UNSET"
  | "NEW"
  | "ATTEMPTED"
  | "CONTACTED"
  | "DEMO_BOOKED"
  | "AWAITING_APPROVAL"
  | "PAYMENT_PENDING"
  | "CLOSED"
  | "DISQUALIFIED";

type LeadStatusShape = Pick<Lead, "status" | "workspaceStatus" | "demoBooking">;

function leadHasBookedDemo(lead: Pick<Lead, "demoBooking">) {
  return Boolean(lead.demoBooking?.date && lead.demoBooking?.time);
}

export function normalizeLeadWorkspaceStatus(input?: string | null): LeadWorkspaceStatus {
  const normalized = String(input ?? "").trim().toUpperCase().replace(/\s+/g, "_");

  if (!normalized || normalized === "NEW" || normalized === "IN_PROGRESS") return "UNSET";
  if (normalized === "ATTEMPTED") return "ATTEMPTED";
  if (normalized === "CONTACTED" || normalized === "PITCHED") return "CONTACTED";
  if (normalized === "DEMO_BOOKED") return "DEMO_BOOKED";
  if (normalized === "AWAITING_APPROVAL") return "AWAITING_APPROVAL";
  if (normalized === "PAYMENT_PENDING") return "PAYMENT_PENDING";
  if (normalized === "CLOSED" || normalized === "CLOSED_WON") return "CLOSED";
  if (normalized === "DISQUALIFIED" || normalized === "NO_SHOW") return "DISQUALIFIED";
  return "UNSET";
}

export function resolveLeadWorkspaceStatus(lead: LeadStatusShape): LeadWorkspaceStatus {
  const primaryStatus = normalizeLeadWorkspaceStatus(lead.status);
  const workspaceStatus = normalizeLeadWorkspaceStatus(lead.workspaceStatus);

  if (primaryStatus === "CLOSED" || workspaceStatus === "CLOSED") return "CLOSED";
  if (primaryStatus === "PAYMENT_PENDING" || workspaceStatus === "PAYMENT_PENDING") return "PAYMENT_PENDING";
  if (primaryStatus === "AWAITING_APPROVAL" || workspaceStatus === "AWAITING_APPROVAL") return "AWAITING_APPROVAL";
  if (primaryStatus === "DISQUALIFIED" || workspaceStatus === "DISQUALIFIED") return "DISQUALIFIED";
  if (leadHasBookedDemo(lead) || primaryStatus === "DEMO_BOOKED" || workspaceStatus === "DEMO_BOOKED") return "DEMO_BOOKED";
  if (workspaceStatus === "CONTACTED" || workspaceStatus === "ATTEMPTED") return workspaceStatus;
  if (primaryStatus === "CONTACTED" || primaryStatus === "ATTEMPTED") return primaryStatus;
  return "UNSET";
}

export function leadWorkspaceStatusFromDispositionChannel(channel: string): LeadWorkspaceStatus | null {
  const normalizedChannel = channel.trim().toLowerCase();
  if (!normalizedChannel.startsWith("disposition:")) return null;

  const disposition = normalizedChannel.slice("disposition:".length).replace(/\s+/g, "_");
  if (disposition === "booked_demo") return "DEMO_BOOKED";
  if (disposition === "wrong_number") return "DISQUALIFIED";
  if (disposition === "no_answer" || disposition === "left_voicemail" || disposition === "voicemail") return "ATTEMPTED";
  if (disposition === "interested" || disposition === "not_interested" || disposition === "call_back") return "CONTACTED";
  return null;
}

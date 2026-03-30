export const COMMISSION_FEE_HOLDBACK_RATE = 0.06;
export const DEFAULT_COMMISSION_RATE = 0.1;

export function getEffectiveCommissionRate(email: string | null | undefined, explicitRate: number | null | undefined) {
  if (typeof explicitRate === "number" && Number.isFinite(explicitRate) && explicitRate >= 0) {
    return explicitRate;
  }

  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (normalized === "eliot30523@gmail.com") {
    return 0.5;
  }

  return DEFAULT_COMMISSION_RATE;
}

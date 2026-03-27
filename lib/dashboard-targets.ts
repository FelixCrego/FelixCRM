export const SALES_DASHBOARD_TARGETS = {
  workdayStartHour: 9,
  workdayEndHour: 17,
  dialsPerDay: 80,
  dialsPerHour: 10,
  contactRatePct: 20,
  demosPerDay: 4,
} as const;

export const SALES_DASHBOARD_WORKDAY_HOURS =
  SALES_DASHBOARD_TARGETS.workdayEndHour - SALES_DASHBOARD_TARGETS.workdayStartHour;

export const SALES_DASHBOARD_TARGETS_BY_HOUR = {
  demosPerHour: SALES_DASHBOARD_TARGETS.demosPerDay / SALES_DASHBOARD_WORKDAY_HOURS,
} as const;

export const SALES_DASHBOARD_DERIVED_TARGETS = {
  demoConversionRatePct:
    (SALES_DASHBOARD_TARGETS.demosPerDay /
      (SALES_DASHBOARD_TARGETS.dialsPerDay * (SALES_DASHBOARD_TARGETS.contactRatePct / 100))) *
    100,
} as const;

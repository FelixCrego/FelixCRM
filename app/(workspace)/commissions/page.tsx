import { getAuthenticatedUser } from "@/lib/auth";
import { canUserViewAllLeads, listAssignableUsers, listLeads, prettyNameFromEmail } from "@/lib/store";
import type { Lead } from "@/lib/types";

const FEE_HOLDBACK_RATE = 0.06;
const DEFAULT_COMMISSION_RATE = 0.1;
const COMMISSION_RATE_BY_EMAIL: Record<string, number> = {
  "eliot30523@gmail.com": 0.5,
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getAttributedRepId(lead: Lead) {
  return lead.soldByUserId ?? lead.ownerId ?? null;
}

function getAttributedRepName(lead: Lead, repNameById: Map<string, string>) {
  const attributedRepId = getAttributedRepId(lead);
  if (lead.soldByName) return lead.soldByName;
  if (attributedRepId && repNameById.has(attributedRepId)) return repNameById.get(attributedRepId) as string;
  if (lead.soldByEmail) return prettyNameFromEmail(lead.soldByEmail);
  return "Lead Owner";
}

function getAttributedRepEmail(lead: Lead, repEmailById: Map<string, string | null>) {
  const attributedRepId = getAttributedRepId(lead);
  if (lead.soldByEmail) return lead.soldByEmail;
  if (attributedRepId && repEmailById.has(attributedRepId)) return repEmailById.get(attributedRepId) ?? null;
  return null;
}

function getCommissionRate(email: string | null | undefined) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  return COMMISSION_RATE_BY_EMAIL[normalized] ?? DEFAULT_COMMISSION_RATE;
}

function getClosedTimestamp(lead: Lead) {
  return lead.closedAt ? new Date(lead.closedAt).getTime() : 0;
}

type CommissionLedgerRow = {
  leadId: string;
  businessName: string;
  closedAt: string;
  grossRevenue: number;
  feeHoldback: number;
  netRevenue: number;
  commissionRate: number;
  commissionEarned: number;
  soldByName: string;
  soldByEmail: string | null;
};

function buildLedger(leads: Lead[], repNameById: Map<string, string>, repEmailById: Map<string, string | null>) {
  return leads
    .filter((lead) => lead.status === "CLOSED" && typeof lead.closedDealValue === "number" && lead.closedDealValue > 0 && lead.closedAt)
    .map((lead) => {
      const grossRevenue = lead.closedDealValue ?? 0;
      const feeHoldback = grossRevenue * FEE_HOLDBACK_RATE;
      const netRevenue = grossRevenue - feeHoldback;
      const soldByEmail = getAttributedRepEmail(lead, repEmailById);
      const commissionRate = getCommissionRate(soldByEmail);

      return {
        leadId: lead.id,
        businessName: lead.businessName,
        closedAt: lead.closedAt as string,
        grossRevenue,
        feeHoldback,
        netRevenue,
        commissionRate,
        commissionEarned: netRevenue * commissionRate,
        soldByName: getAttributedRepName(lead, repNameById),
        soldByEmail,
      } satisfies CommissionLedgerRow;
    })
    .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white tabular-nums">{value}</p>
      <p className="mt-2 text-sm text-zinc-400">{detail}</p>
    </article>
  );
}

export default async function CommissionsPage() {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">
        Unauthorized
      </div>
    );
  }

  const includeAll = await canUserViewAllLeads(user.id, user.email);
  const [allVisibleLeads, assignableUsers] = await Promise.all([
    listLeads(user.id, { includeAll }),
    listAssignableUsers().catch(() => []),
  ]);

  const repNameById = new Map(assignableUsers.map((rep) => [rep.id, rep.name]));
  const repEmailById = new Map(assignableUsers.map((rep) => [rep.id, rep.email]));
  const leadById = new Map(allVisibleLeads.map((lead) => [lead.id, lead]));
  const fullLedger = buildLedger(allVisibleLeads, repNameById, repEmailById);
  const personalLedger = fullLedger.filter((row) => {
    const lead = leadById.get(row.leadId);
    return lead ? getAttributedRepId(lead) === user.id : false;
  });
  const visibleLedger = includeAll ? fullLedger : personalLedger;

  const grossRevenue = visibleLedger.reduce((sum, row) => sum + row.grossRevenue, 0);
  const feeHoldback = visibleLedger.reduce((sum, row) => sum + row.feeHoldback, 0);
  const netRevenue = visibleLedger.reduce((sum, row) => sum + row.netRevenue, 0);
  const commissionEarned = visibleLedger.reduce((sum, row) => sum + row.commissionEarned, 0);
  const averageCommissionRate =
    visibleLedger.length > 0 ? visibleLedger.reduce((sum, row) => sum + row.commissionRate, 0) / visibleLedger.length : getCommissionRate(user.email);

  const groupedRepSummaries = includeAll
    ? Object.values(
        fullLedger.reduce<Record<string, { soldByName: string; soldByEmail: string | null; deals: number; gross: number; net: number; commission: number; rate: number }>>((acc, row) => {
          const key = row.soldByEmail ?? row.soldByName;
          if (!acc[key]) {
            acc[key] = {
              soldByName: row.soldByName,
              soldByEmail: row.soldByEmail,
              deals: 0,
              gross: 0,
              net: 0,
              commission: 0,
              rate: row.commissionRate,
            };
          }

          acc[key].deals += 1;
          acc[key].gross += row.grossRevenue;
          acc[key].net += row.netRevenue;
          acc[key].commission += row.commissionEarned;
          return acc;
        }, {}),
      ).sort((a, b) => b.commission - a.commission)
    : [];

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
          {includeAll ? "Team Commissions" : "My Commissions"}
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">
          {formatCurrency(commissionEarned)}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Based only on real closed deals. Commission is calculated from net revenue after a {formatPercent(FEE_HOLDBACK_RATE)} Stripe and bank fee holdback.
        </p>
      </header>

      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          label="Closed Deals"
          value={String(visibleLedger.length)}
          detail="Real deals only. Test closes removed."
        />
        <MetricCard
          label="Gross Revenue"
          value={formatCurrency(grossRevenue)}
          detail="Raw closed deal value before fees."
        />
        <MetricCard
          label="Net After Fees"
          value={formatCurrency(netRevenue)}
          detail={`${formatCurrency(feeHoldback)} held back for Stripe and bank fees.`}
        />
        <MetricCard
          label="Avg Commission Rate"
          value={formatPercent(averageCommissionRate)}
          detail={includeAll ? "Weighted by current rep mappings." : `Your current rate is ${formatPercent(getCommissionRate(user.email))}.`}
        />
      </section>

      {includeAll ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">Rep Breakdown</h2>
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950 text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Rep</th>
                  <th className="px-4 py-3">Rate</th>
                  <th className="px-4 py-3">Deals</th>
                  <th className="px-4 py-3">Gross</th>
                  <th className="px-4 py-3">Net</th>
                  <th className="px-4 py-3">Commission</th>
                </tr>
              </thead>
              <tbody>
                {groupedRepSummaries.length === 0 ? (
                  <tr className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-400">
                    <td className="px-4 py-3" colSpan={6}>
                      No closed deals with commission data yet.
                    </td>
                  </tr>
                ) : (
                  groupedRepSummaries.map((row) => (
                    <tr key={`${row.soldByName}-${row.soldByEmail ?? "no-email"}`} className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-200">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{row.soldByName}</span>
                          <span className="text-xs text-zinc-500">{row.soldByEmail ?? "No email on file"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatPercent(row.rate)}</td>
                      <td className="px-4 py-3">{row.deals}</td>
                      <td className="px-4 py-3">{formatCurrency(row.gross)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.net)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-300">{formatCurrency(row.commission)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Closed Deal Ledger</h2>
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-4 py-3">Deal</th>
                <th className="px-4 py-3">Closed</th>
                <th className="px-4 py-3">Sold By</th>
                <th className="px-4 py-3">Gross</th>
                <th className="px-4 py-3">Fee Holdback</th>
                <th className="px-4 py-3">Net</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Commission</th>
              </tr>
            </thead>
            <tbody>
              {visibleLedger.length === 0 ? (
                <tr className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-400">
                  <td className="px-4 py-3" colSpan={8}>
                    No real closed deals available for commission calculation yet.
                  </td>
                </tr>
              ) : (
                visibleLedger.map((row) => (
                  <tr key={row.leadId} className="border-t border-zinc-800 bg-zinc-900/80 text-zinc-200">
                    <td className="px-4 py-3 font-medium text-white">{row.businessName}</td>
                    <td className="px-4 py-3 text-zinc-400">{new Date(row.closedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span>{row.soldByName}</span>
                        <span className="text-xs text-zinc-500">{row.soldByEmail ?? "No email on file"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatCurrency(row.grossRevenue)}</td>
                    <td className="px-4 py-3 tabular-nums text-amber-300">-{formatCurrency(row.feeHoldback)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatCurrency(row.netRevenue)}</td>
                    <td className="px-4 py-3">{formatPercent(row.commissionRate)}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-300 tabular-nums">{formatCurrency(row.commissionEarned)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

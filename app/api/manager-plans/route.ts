import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type PostgrestError = {
  message?: string;
  details?: string;
};

const MISSING_TABLE_MESSAGE = "Could not find the table 'public.manager_plans' in the schema cache";

function getConfig() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return { supabaseUrl, serviceRoleKey };
}

function parsePostgrestError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return { message: fallback, isMissingManagerPlansTable: false };
  }

  const maybeError = payload as PostgrestError;
  const message = typeof maybeError.message === "string" ? maybeError.message : "";
  const details = typeof maybeError.details === "string" ? maybeError.details : "";
  const merged = message || details || fallback;

  if (message.includes(MISSING_TABLE_MESSAGE) || details.includes(MISSING_TABLE_MESSAGE)) {
    return {
      message: "Manager plans table is not installed in Supabase yet. Run supabase/manager_plans.sql and refresh PostgREST schema cache.",
      isMissingManagerPlansTable: true,
    };
  }

  return { message: merged, isMissingManagerPlansTable: false };
}

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { supabaseUrl: url, serviceRoleKey: key } = getConfig();
    const query = new URLSearchParams({
      select: "id,manager_id,week_start_date,locked_metrics_json,projected_income,created_at",
      manager_id: `eq.${userId}`,
      order: "created_at.desc",
      limit: "1",
    });

    const response = await fetch(`${url}/rest/v1/manager_plans?${query.toString()}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const parsed = parsePostgrestError(payload, "Unable to load manager plan.");
      if (parsed.isMissingManagerPlansTable) {
        return NextResponse.json({ plan: null, tableMissing: true, warning: parsed.message });
      }

      return NextResponse.json({ error: parsed.message }, { status: response.status });
    }

    const [plan] = Array.isArray(payload) ? payload : [];
    return NextResponse.json({ plan: plan ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load manager plan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => null)) as {
      weekStartDate?: string;
      projectedIncome?: number;
      lockedMetricsJson?: unknown;
    } | null;

    const weekStartDate = body?.weekStartDate?.trim();
    const projectedIncome = typeof body?.projectedIncome === "number" ? Math.max(0, Math.round(body.projectedIncome)) : null;

    if (!weekStartDate || projectedIncome === null || !body?.lockedMetricsJson) {
      return NextResponse.json({ error: "weekStartDate, projectedIncome, and lockedMetricsJson are required." }, { status: 400 });
    }

    const payload = {
      manager_id: userId,
      week_start_date: weekStartDate,
      locked_metrics_json: body.lockedMetricsJson,
      projected_income: projectedIncome,
    };

    const { supabaseUrl: url, serviceRoleKey: key } = getConfig();
    const response = await fetch(`${url}/rest/v1/manager_plans`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    const responsePayload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const parsed = parsePostgrestError(responsePayload, "Unable to lock manager plan.");
      if (parsed.isMissingManagerPlansTable) {
        return NextResponse.json(
          {
            error: parsed.message,
            code: "MANAGER_PLANS_TABLE_MISSING",
            setupSql: "supabase/manager_plans.sql",
          },
          { status: 503 },
        );
      }

      return NextResponse.json({ error: parsed.message }, { status: response.status });
    }

    const [plan] = Array.isArray(responsePayload) ? responsePayload : [];
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to lock manager plan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

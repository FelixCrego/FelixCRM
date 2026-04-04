import { Pool, type PoolClient } from "pg";

const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim() ||
  "";

const DEFAULT_SCOPE = "TEAM_OUTBOUND";
const DEFAULT_SPACING_MS = 4_000;
const DEFAULT_THROTTLE_COOLDOWN_MS = 30_000;

type GuardReason = "PACE" | "THROTTLED";

type GuardRow = {
  scope: string;
  blocked_until: Date | string | null;
  blocked_reason: GuardReason | null;
};

type GuardClientResult = {
  blockedUntil: string | null;
  reason: GuardReason | null;
  waitMs: number;
};

declare global {
  var __felixOutboundDialGuardPool: Pool | undefined;
  var __felixOutboundDialGuardSetupPromise: Promise<void> | undefined;
}

export const OUTBOUND_DIAL_GUARD_SETUP_SQL = `create extension if not exists pgcrypto;

create table if not exists public.outbound_dial_guard (
  scope text primary key,
  blocked_until timestamptz not null default now(),
  blocked_reason text check (blocked_reason in ('PACE', 'THROTTLED')),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid,
  updated_by_email text,
  last_dial_started_at timestamptz,
  last_throttle_at timestamptz
);

create index if not exists outbound_dial_guard_blocked_until_idx on public.outbound_dial_guard (blocked_until desc);
create index if not exists outbound_dial_guard_updated_at_idx on public.outbound_dial_guard (updated_at desc);`;

function clampPositiveMs(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1_000, Math.min(Math.round(parsed), 300_000));
}

function getSpacingMs() {
  return clampPositiveMs(process.env.FELIXCRM_TEAM_DIAL_SPACING_MS, DEFAULT_SPACING_MS);
}

function getThrottleCooldownMs() {
  return clampPositiveMs(process.env.FELIXCRM_TEAM_THROTTLE_COOLDOWN_MS, DEFAULT_THROTTLE_COOLDOWN_MS);
}

function getPool() {
  if (!databaseUrl) {
    throw new Error("Outbound dial guard requires DATABASE_URL or POSTGRES_URL.");
  }

  if (!globalThis.__felixOutboundDialGuardPool) {
    globalThis.__felixOutboundDialGuardPool = new Pool({
      connectionString: databaseUrl,
      max: 3,
      idleTimeoutMillis: 10_000,
      ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
    });
  }

  return globalThis.__felixOutboundDialGuardPool;
}

async function ensureSetup() {
  if (!globalThis.__felixOutboundDialGuardSetupPromise) {
    globalThis.__felixOutboundDialGuardSetupPromise = getPool()
      .query(OUTBOUND_DIAL_GUARD_SETUP_SQL)
      .then(() => undefined);
  }

  return globalThis.__felixOutboundDialGuardSetupPromise;
}

async function withClient<T>(callback: (client: PoolClient) => Promise<T>) {
  await ensureSetup();
  const client = await getPool().connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function normalizeReason(value: unknown): GuardReason | null {
  return value === "PACE" || value === "THROTTLED" ? value : null;
}

function toGuardResult(row: GuardRow | null | undefined, now = Date.now()): GuardClientResult {
  const blockedUntilValue = row?.blocked_until ? new Date(row.blocked_until).getTime() : 0;
  if (!blockedUntilValue || Number.isNaN(blockedUntilValue) || blockedUntilValue <= now) {
    return {
      blockedUntil: null,
      reason: null,
      waitMs: 0,
    };
  }

  return {
    blockedUntil: new Date(blockedUntilValue).toISOString(),
    reason: normalizeReason(row?.blocked_reason),
    waitMs: Math.max(blockedUntilValue - now, 0),
  };
}

async function ensureScopeRow(client: PoolClient, scope: string) {
  await client.query(
    `insert into public.outbound_dial_guard (scope, blocked_until, updated_at)
     values ($1, now(), now())
     on conflict (scope) do nothing`,
    [scope],
  );
}

export async function getOutboundDialGuard(scope = DEFAULT_SCOPE) {
  return withClient(async (client) => {
    await ensureScopeRow(client, scope);
    const result = await client.query<GuardRow>(
      `select scope, blocked_until, blocked_reason
       from public.outbound_dial_guard
       where scope = $1
       limit 1`,
      [scope],
    );

    return {
      ...toGuardResult(result.rows[0] ?? null),
      scope,
      spacingMs: getSpacingMs(),
      throttleCooldownMs: getThrottleCooldownMs(),
    };
  });
}

export async function reserveOutboundDialSlot(input: {
  scope?: string;
  userId: string;
  userEmail?: string | null;
}) {
  const scope = input.scope ?? DEFAULT_SCOPE;
  const spacingMs = getSpacingMs();

  return withClient(async (client) => {
    await client.query("begin");
    try {
      await ensureScopeRow(client, scope);
      const result = await client.query<GuardRow>(
        `select scope, blocked_until, blocked_reason
         from public.outbound_dial_guard
         where scope = $1
         for update`,
        [scope],
      );

      const current = toGuardResult(result.rows[0] ?? null);
      if (current.waitMs > 0) {
        await client.query("commit");
        return {
          allowed: false as const,
          ...current,
          scope,
          spacingMs,
          throttleCooldownMs: getThrottleCooldownMs(),
        };
      }

      const blockedUntil = new Date(Date.now() + spacingMs).toISOString();
      await client.query(
        `update public.outbound_dial_guard
         set blocked_until = $2,
             blocked_reason = 'PACE',
             updated_at = now(),
             updated_by_user_id = $3,
             updated_by_email = $4,
             last_dial_started_at = now()
         where scope = $1`,
        [scope, blockedUntil, input.userId, input.userEmail ?? null],
      );

      await client.query("commit");
      return {
        allowed: true as const,
        blockedUntil,
        reason: "PACE" as const,
        waitMs: 0,
        scope,
        spacingMs,
        throttleCooldownMs: getThrottleCooldownMs(),
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

export async function reportOutboundThrottle(input: {
  scope?: string;
  userId: string;
  userEmail?: string | null;
}) {
  const scope = input.scope ?? DEFAULT_SCOPE;
  const throttleCooldownMs = getThrottleCooldownMs();

  return withClient(async (client) => {
    await client.query("begin");
    try {
      await ensureScopeRow(client, scope);
      const result = await client.query<GuardRow>(
        `select scope, blocked_until, blocked_reason
         from public.outbound_dial_guard
         where scope = $1
         for update`,
        [scope],
      );

      const now = Date.now();
      const currentBlockedUntil = result.rows[0]?.blocked_until ? new Date(result.rows[0].blocked_until).getTime() : 0;
      const nextBlockedUntil = new Date(Math.max(now + throttleCooldownMs, currentBlockedUntil)).toISOString();

      await client.query(
        `update public.outbound_dial_guard
         set blocked_until = $2,
             blocked_reason = 'THROTTLED',
             updated_at = now(),
             updated_by_user_id = $3,
             updated_by_email = $4,
             last_throttle_at = now()
         where scope = $1`,
        [scope, nextBlockedUntil, input.userId, input.userEmail ?? null],
      );

      await client.query("commit");
      return {
        blockedUntil: nextBlockedUntil,
        reason: "THROTTLED" as const,
        waitMs: Math.max(new Date(nextBlockedUntil).getTime() - now, 0),
        scope,
        spacingMs: getSpacingMs(),
        throttleCooldownMs,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

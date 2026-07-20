import { Pool } from "pg";
import crypto from "node:crypto";

const pool = new Pool({ connectionString: process.env.POSTGRES_URL, max: 4, ssl: { rejectUnauthorized: false } });
let ready: Promise<void> | null = null;

export type CampaignStep = { delayDays: number; subject: string; body: string };

async function ensureSchema() {
  if (!ready) ready = (async () => {
    await pool.query(`
      create table if not exists email_campaigns (
        id uuid primary key default gen_random_uuid(), owner_id text not null, name text not null,
        status text not null default 'DRAFT', daily_limit int not null default 25,
        timezone text not null default 'America/New_York', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      create table if not exists email_campaign_steps (
        id uuid primary key default gen_random_uuid(), campaign_id uuid not null references email_campaigns(id) on delete cascade,
        step_order int not null, delay_days int not null default 0, subject text not null, body text not null,
        unique(campaign_id, step_order)
      );
      create table if not exists email_campaign_enrollments (
        id uuid primary key default gen_random_uuid(), campaign_id uuid not null references email_campaigns(id) on delete cascade,
        lead_id text not null, email text not null, status text not null default 'ACTIVE', current_step int not null default 0,
        next_send_at timestamptz not null default now(), unsubscribe_token text not null unique,
        last_sent_at timestamptz, stopped_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        unique(campaign_id, lead_id)
      );
      create table if not exists email_campaign_events (
        id uuid primary key default gen_random_uuid(), enrollment_id uuid references email_campaign_enrollments(id) on delete cascade,
        campaign_id uuid not null, lead_id text not null, event_type text not null, provider_message_id text,
        metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
      );
      create table if not exists email_suppressions (
        email text primary key, reason text not null, source text, created_at timestamptz not null default now()
      );
      create index if not exists idx_campaign_due on email_campaign_enrollments(status, next_send_at);
      create index if not exists idx_campaign_events_day on email_campaign_events(campaign_id, created_at);
    `);
  })();
  return ready;
}

export async function listCampaigns(ownerId: string) {
  await ensureSchema();
  const { rows } = await pool.query(`select c.*, count(e.id)::int as enrolled_count,
    count(e.id) filter (where e.status='ACTIVE')::int as active_count
    from email_campaigns c left join email_campaign_enrollments e on e.campaign_id=c.id
    where c.owner_id=$1 group by c.id order by c.created_at desc`, [ownerId]);
  return rows;
}

export async function createCampaign(ownerId: string, input: { name: string; dailyLimit?: number; steps: CampaignStep[] }) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(`insert into email_campaigns(owner_id,name,daily_limit) values($1,$2,$3) returning *`, [ownerId, input.name, Math.max(1, Math.min(input.dailyLimit ?? 25, 100))]);
    for (let i = 0; i < input.steps.length; i++) {
      const step = input.steps[i];
      await client.query(`insert into email_campaign_steps(campaign_id,step_order,delay_days,subject,body) values($1,$2,$3,$4,$5)`, [rows[0].id, i, Math.max(0, step.delayDays), step.subject, step.body]);
    }
    await client.query('commit');
    return rows[0];
  } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
}

export async function activateCampaign(ownerId: string, campaignId: string) {
  await ensureSchema();
  const { rows } = await pool.query(`update email_campaigns set status='ACTIVE',updated_at=now() where id=$1 and owner_id=$2 returning *`, [campaignId, ownerId]);
  return rows[0] ?? null;
}

export async function enrollLead(input: { ownerId: string; campaignId: string; leadId: string; email: string }) {
  await ensureSchema();
  const email = input.email.trim().toLowerCase();
  const suppressed = await pool.query(`select 1 from email_suppressions where email=$1`, [email]);
  if (suppressed.rowCount) throw new Error('Email is suppressed or unsubscribed.');
  const campaign = await pool.query(`select id,status from email_campaigns where id=$1 and owner_id=$2`, [input.campaignId, input.ownerId]);
  if (!campaign.rowCount) throw new Error('Campaign not found.');
  const token = crypto.randomBytes(24).toString('hex');
  const { rows } = await pool.query(`insert into email_campaign_enrollments(campaign_id,lead_id,email,unsubscribe_token)
    values($1,$2,$3,$4) on conflict(campaign_id,lead_id) do update set status='ACTIVE',email=excluded.email,next_send_at=now(),updated_at=now() returning *`, [input.campaignId,input.leadId,email,token]);
  return rows[0];
}

export async function getDueEnrollments(limit = 25) {
  await ensureSchema();
  const { rows } = await pool.query(`select e.*, c.owner_id,c.daily_limit,c.timezone,s.subject,s.body,s.delay_days
    from email_campaign_enrollments e join email_campaigns c on c.id=e.campaign_id
    join email_campaign_steps s on s.campaign_id=e.campaign_id and s.step_order=e.current_step
    left join email_suppressions x on x.email=e.email
    where e.status='ACTIVE' and c.status='ACTIVE' and e.next_send_at<=now() and x.email is null
    order by e.next_send_at asc limit $1`, [limit]);
  return rows;
}

export async function countCampaignSendsToday(campaignId: string) {
  await ensureSchema();
  const { rows } = await pool.query(`select count(*)::int as count from email_campaign_events where campaign_id=$1 and event_type='SENT' and created_at>=date_trunc('day',now())`, [campaignId]);
  return rows[0]?.count ?? 0;
}

export async function markSent(input: { enrollmentId: string; campaignId: string; leadId: string; providerMessageId?: string | null }) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`insert into email_campaign_events(enrollment_id,campaign_id,lead_id,event_type,provider_message_id) values($1,$2,$3,'SENT',$4)`, [input.enrollmentId,input.campaignId,input.leadId,input.providerMessageId ?? null]);
    const next = await client.query(`select delay_days from email_campaign_steps where campaign_id=$1 and step_order=(select current_step+1 from email_campaign_enrollments where id=$2)`, [input.campaignId,input.enrollmentId]);
    if (next.rowCount) {
      await client.query(`update email_campaign_enrollments set current_step=current_step+1,last_sent_at=now(),next_send_at=now()+($2||' days')::interval,updated_at=now() where id=$1`, [input.enrollmentId,next.rows[0].delay_days]);
    } else {
      await client.query(`update email_campaign_enrollments set status='COMPLETED',last_sent_at=now(),updated_at=now() where id=$1`, [input.enrollmentId]);
    }
    await client.query('commit');
  } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
}

export async function markFailed(enrollmentId: string, campaignId: string, leadId: string, error: string) {
  await ensureSchema();
  await pool.query(`insert into email_campaign_events(enrollment_id,campaign_id,lead_id,event_type,metadata) values($1,$2,$3,'FAILED',$4::jsonb)`, [enrollmentId,campaignId,leadId,JSON.stringify({error})]);
  await pool.query(`update email_campaign_enrollments set next_send_at=now()+interval '1 day',updated_at=now() where id=$1`, [enrollmentId]);
}

export async function unsubscribeByToken(token: string) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(`update email_campaign_enrollments set status='UNSUBSCRIBED',stopped_reason='recipient_unsubscribed',updated_at=now() where unsubscribe_token=$1 returning email`, [token]);
    if (rows[0]?.email) await client.query(`insert into email_suppressions(email,reason,source) values($1,'UNSUBSCRIBED','campaign_link') on conflict(email) do nothing`, [rows[0].email]);
    await client.query('commit');
    return Boolean(rows[0]);
  } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
}

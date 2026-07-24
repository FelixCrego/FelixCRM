import crypto from "node:crypto";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.POSTGRES_URL, max: 2, ssl: { rejectUnauthorized: false } });

function key() {
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not configured.");
  return crypto.createHash("sha256").update(secret).digest();
}

async function ensureTable() {
  await pool.query(`create table if not exists integration_credentials (
    name text primary key,
    ciphertext text not null,
    iv text not null,
    auth_tag text not null,
    updated_at timestamptz not null default now()
  )`);
}

export async function saveGoogleRefreshToken(refreshToken: string) {
  await ensureTable();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  await pool.query(`insert into integration_credentials(name,ciphertext,iv,auth_tag,updated_at)
    values('google_refresh_token',$1,$2,$3,now())
    on conflict(name) do update set ciphertext=excluded.ciphertext,iv=excluded.iv,auth_tag=excluded.auth_tag,updated_at=now()`,
    [ciphertext.toString("base64"), iv.toString("base64"), authTag.toString("base64")]);
}

export async function getGoogleRefreshToken() {
  await ensureTable();
  const result = await pool.query(`select ciphertext,iv,auth_tag from integration_credentials where name='google_refresh_token'`);
  if (!result.rowCount) return process.env.GOOGLE_REFRESH_TOKEN?.trim() || "";
  const row = result.rows[0];
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(row.iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

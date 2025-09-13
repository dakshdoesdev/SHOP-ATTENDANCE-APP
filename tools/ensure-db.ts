import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('No DATABASE_URL set; skipping DB ensure.');
    return;
  }

  const noSslVerify = (process.env.PG_NO_SSL_VERIFY || '').toLowerCase() === 'true';
  if (noSslVerify) {
    // As a last resort for networks with TLS MITM, disable verification
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  const pool = new Pool({
    connectionString: url,
    ...(noSslVerify ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  // Wake paused DBs (e.g., Supabase free tier)
  for (let i = 0; i < 10; i++) {
    try {
      await pool.query('select 1');
      break;
    } catch (e) {
      if (i === 9) throw e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // Verify users table exists
  const existsRes = await pool.query<{ exists: boolean }>(
    "select to_regclass('public.users') is not null as exists",
  );
  if (!existsRes.rows[0]?.exists) {
    console.warn('Users table not found. Skipping column add.');
    await pool.end();
    return;
  }

  // Apply minimal, safe DDL to match current app schema
  const ddl = [
    'alter table "public"."users" add column if not exists "default_start_time" text',
    'alter table "public"."users" add column if not exists "default_end_time" text',
  ];

  for (const stmt of ddl) {
    await pool.query(stmt);
  }

  console.log('DB ensure: users.default_start_time/default_end_time present.');
  await pool.end();
}

main().catch((err) => {
  console.error('DB ensure failed:', err?.message || err);
  process.exitCode = 1;
});

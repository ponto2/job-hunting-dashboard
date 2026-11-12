// Brings the database up to date. `npm run build` runs this first, so a
// deployment sets up its own database and applies later changes by itself.
//
//   - Empty database: runs supabase/schema.sql.
//   - Existing database: runs each file in supabase/migrations/ that
//     public.schema_migrations does not list yet, oldest first.
//
// It needs a direct PostgreSQL connection string (the Supabase integration
// for Vercel provides one). Without it nothing happens, and the SQL is run
// by hand in the Supabase SQL Editor instead, as described in the README.
// Any failure stops the build, so the previous deployment keeps serving.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const supabaseDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const log = (message) => console.log(`[database] ${message}`);

function connectionString() {
  return process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
}

// Preview deployments share the production database, so a branch that is
// still under review must not change it.
function skipReason() {
  if (!connectionString()) return 'no connection string (POSTGRES_URL_NON_POOLING), so the database is left as is';
  if (process.env.VERCEL && process.env.VERCEL_ENV !== 'production') return 'not a production deployment, so the database is left as is';
  return '';
}

function clientConfig() {
  const url = new URL(connectionString());
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  const sslDisabled = url.searchParams.get('sslmode') === 'disable';
  // pg would otherwise verify the server against Node's public CA list, which
  // Supabase's own certificate authority is not part of. The connection is
  // still encrypted.
  url.searchParams.delete('sslmode');
  return {
    connectionString: url.toString(),
    ssl: local || sslDisabled ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  };
}

async function migrationFiles() {
  const names = await readdir(path.join(supabaseDir, 'migrations'));
  return names.filter((name) => name.endsWith('.sql')).sort();
}

export async function migrate(client) {
  const { rows: [state] } = await client.query(`
    select to_regclass('public.companies') is not null as has_tables,
           to_regclass('public.schema_migrations') is not null as has_versions
  `);

  if (!state.has_tables) {
    await client.query(await readFile(path.join(supabaseDir, 'schema.sql'), 'utf8'));
    log('created the tables from supabase/schema.sql');
    return;
  }

  if (!state.has_versions) {
    throw new Error(
      'This database has a companies table but no public.schema_migrations, so supabase/schema.sql did not create it. '
      + 'Use an empty database, or bring this one to the current definition by hand first.',
    );
  }

  const { rows } = await client.query('select version from public.schema_migrations');
  const applied = new Set(rows.map((row) => row.version));
  const pending = (await migrationFiles()).filter((name) => !applied.has(name.replace(/\.sql$/, '')));
  if (pending.length === 0) {
    log('already up to date');
    return;
  }

  for (const name of pending) {
    // Each file is its own transaction and may be run again safely, so a
    // failure here leaves the earlier files applied and this one untouched.
    await client.query(await readFile(path.join(supabaseDir, 'migrations', name), 'utf8'));
    await client.query(
      'insert into public.schema_migrations (version) values ($1) on conflict (version) do nothing',
      [name.replace(/\.sql$/, '')],
    );
    log(`applied supabase/migrations/${name}`);
  }
}

async function main() {
  const reason = skipReason();
  if (reason) {
    log(`skipped: ${reason}`);
    return;
  }
  const { default: pg } = await import('pg');
  const client = new pg.Client(clientConfig());
  await client.connect();
  try {
    await migrate(client);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[database] failed: ${error.message}`);
    process.exit(1);
  });
}

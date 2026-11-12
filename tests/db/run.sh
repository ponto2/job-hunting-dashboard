#!/usr/bin/env bash
# Database tests against a disposable database on the configured test server:
#   1. supabase/schema.sql installs cleanly on an empty database
#   2. every file in supabase/migrations/ is a no-op on top of it, i.e.
#      schema.sql already contains each migration and migrations can be rerun
#   3. tests/db/integrity.sql: constraints, restore, access rights
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${PGHOST:?Set PGHOST to the test PostgreSQL server}"
: "${PGUSER:?Set PGUSER to the test PostgreSQL user}"
test_db="dashboard_test_${RANDOM}_${RANDOM}"
work_dir="$(mktemp -d)"
createdb "$test_db"
trap 'dropdb --if-exists "$test_db"; rm -rf "$work_dir"' EXIT
export PGDATABASE="$test_db"

run_sql() {
  psql -X -q -v ON_ERROR_STOP=1 -f "$1" > "$work_dir/psql.log" 2>&1 || { cat "$work_dir/psql.log"; exit 1; }
}

# The roles Supabase provides.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
SQL

run_sql supabase/schema.sql
psql -X -At -v ON_ERROR_STOP=1 -f tests/db/fingerprint.sql > "$work_dir/schema.txt"

shopt -s nullglob
for migration in supabase/migrations/*.sql; do
  run_sql "$migration"
done
psql -X -At -v ON_ERROR_STOP=1 -f tests/db/fingerprint.sql > "$work_dir/migrated.txt"

if ! diff -u "$work_dir/schema.txt" "$work_dir/migrated.txt"; then
  echo "FAIL: supabase/schema.sql does not match the result of supabase/migrations/." >&2
  echo "Apply the same change to supabase/schema.sql (lines marked + above are missing from it)." >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -f tests/db/integrity.sql

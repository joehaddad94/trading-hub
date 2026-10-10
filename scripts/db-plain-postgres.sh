#!/usr/bin/env bash
# Recreate a database on a plain Postgres with a Supabase stub and apply every migration.
# For environments without Docker; normally use `supabase db reset`.
# Usage: scripts/db-plain-postgres.sh postgresql://postgres@127.0.0.1:54322/trading_test
set -euo pipefail
url="${1:?database url}"
db="${url##*/}"
admin="${url%/*}/postgres"
psql "$admin" -qc "drop database if exists \"$db\" with (force)" -c "create database \"$db\""
psql "$url" -q -v ON_ERROR_STOP=1 -f packages/db/test/supabase-stub.sql
for f in supabase/migrations/*.sql; do
  psql "$url" -q -v ON_ERROR_STOP=1 -f "$f"
done
echo "migrated $db"

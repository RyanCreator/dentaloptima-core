# scripts

One-shot operator scripts.

## migrate-ops-data.mjs

Pulls outreach / email / support / leads / announcements / payments data from
the legacy registry Supabase project and inserts into dentaloptima-core's
`ops` schema. Preserves primary keys.

**Run once after applying migration `0017_operations_tables.sql`.**

```bash
cp scripts/.env.migration.example scripts/.env.migration
# Fill in REGISTRY_SERVICE_ROLE_KEY + CORE_SERVICE_ROLE_KEY
# (Supabase Dashboard → Project Settings → API → service_role)

cd admin
node ../scripts/migrate-ops-data.mjs

# When done:
rm ../scripts/.env.migration
```

The script is idempotent (upsert on PK). Safe to re-run if it fails partway.

We run from `admin/` because that's where `@supabase/supabase-js` is installed.

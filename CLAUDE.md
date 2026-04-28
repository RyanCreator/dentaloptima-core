# CLAUDE.md

This file provides guidance to Claude Code when working in `dentaloptima-core`.

## What this project is

**Dentaloptima Core** is the new shared multi-tenant database + apps for the Dentaloptima dental practice management platform. Replaces the previous "one Supabase project per tenant" model with a single shared database where every tenant (practice) is isolated by `practice_id` row-level security.

**Why it exists:** Per-tenant Supabase projects became cost-prohibitive. Single shared DB with strong RLS achieves the same isolation at a fraction of the cost.

**What's in scope:** new database, new admin app, new booking app, new edge functions. CQC + NHS FP17 ready from day one.

**What's out of scope:** the existing per-tenant deployments. They live in `../Dentaloptima Booking project/` and stay frozen — don't modify them. Future migration of those tenants into `dentaloptima-core` is a separate Phase 2 conversation.

## Project structure

```
dentaloptima-core/
├── supabase/
│   ├── migrations/         16 SQL files defining the entire schema
│   ├── functions/          Deno edge functions
│   │   └── create-practice-with-owner/
│   └── config.toml         Local Supabase CLI config
├── admin/                  Vite + React + TS + Tailwind operator dashboard
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/          shadcn primitives
│   │   │   └── ...
│   │   ├── pages/           Login, Overview, Tenants, TenantDetail
│   │   ├── hooks/
│   │   ├── integrations/supabase/
│   │   └── lib/
│   ├── package.json
│   └── .env.local           Operator token + anon key (gitignored)
└── web/                    NOT YET BUILT — booking app for practices
```

## Supabase project

- **Project ref:** `jvwuorwfzoutojpyjnfk`
- **URL:** https://jvwuorwfzoutojpyjnfk.supabase.co
- **Region:** London (eu-west-2)
- **Plan:** Pro (PITR + daily backups for CQC)
- **MCP:** `supabase-core` (defined in `.mcp.json`)

## Schema design rules — every migration MUST follow these

1. Every tenant table has `practice_id uuid NOT NULL REFERENCES practice(id) ON DELETE RESTRICT`
2. Every tenant index leads with `practice_id` (so RLS pruning is fast)
3. Every RLS USING clause is `practice_id = (select app_private.current_practice_id())` — wrapped in `(select ...)` for InitPlan caching
4. SECURITY DEFINER functions ONLY in `app_private` schema, never `public`
5. Soft delete via `deleted_at` everywhere; FK strategy = RESTRICT on clinical, SET NULL on audit columns
6. Operators (cross-tenant) gated via `app_private.is_operator()` reading from JWT `app_metadata`
7. Audit log tables (`audit`, `clinical_audit`) have NO FKs to source tables — they're append-only snapshots that outlive deletions

## Key tables (38 total)

**Identity (3):** `practice`, `practice_member`, `practice_role` enum
**Clinical core (6):** `patient`, `medical_history_entry`, `medical_alert`, `consent_record`, `document`, `note`
**Scheduling (12):** `service`, `staff_service`, `practice_hours`, `practice_closure`, `staff_availability`, `staff_break`, `staff_time_off`, `blocked_time`, `appointment`, `appointment_service`, `booking_request`, `waiting_list`
**Treatment + billing (5):** `treatment_plan`, `treatment_plan_item`, `referral`, `billing_item`, `recall`
**NHS FP17 (5):** `nhs_performer`, `nhs_claim`, `nhs_claim_treatment`, `nhs_claim_orthodontic`, `nhs_claim_billing_link`
**CQC governance (6):** `incident_report`, `complaint`, `safeguarding_concern`, `prescription`, `policy`, `policy_acknowledgement`
**Audit (2):** `audit`, `clinical_audit`
**Storage:** `patient-files` bucket with path-based RLS (`{practice_id}/{patient_id}/...`)

## Helpers in `app_private` schema

- `current_practice_id()` — caller's practice
- `current_member_id()` — caller's practice_member.id
- `is_member_of(practice_id)` — bool
- `has_role(role)` — bool
- `is_practice_admin()` — OWNER or ADMIN
- `is_operator()` — operator (Dentaloptima staff with cross-tenant access)
- `fn_set_audit_columns()` — trigger fn for created_by/updated_by/updated_at
- `fn_audit_log()` — generic trigger fn writing to audit/clinical_audit
- `fn_patient_retention_eligible(uuid)` — 11yr / age-25 / legal_hold check

## Auth model

- One user = one practice (UNIQUE on practice_member.user_id). Locum dentists at multiple practices use separate auth accounts.
- **Operators** are flagged via `auth.users.raw_app_meta_data.is_operator = true`. They have no practice_member row. Use the admin app at `dentaloptima-core/admin/`.
- **Practice members** (OWNER/ADMIN/DENTIST/HYGIENIST/NURSE/RECEPTIONIST) use the booking app (NOT YET BUILT).
- New practices created via `create-practice-with-owner` edge function (operator-token-gated, sends email invite to first OWNER).

## Edge functions

- `create-practice-with-owner` — operator-only, creates practice + invites owner. Auth: `X-Operator-Token` header.

## Development commands

```bash
# Admin app
cd admin
npm install
npm run dev          # http://localhost:8082
npm run build

# Schema changes — write a migration file in supabase/migrations/
# Apply via MCP: mcp__supabase-core__apply_migration
# Verify: mcp__supabase-core__get_advisors (security + performance)
```

## Best practices when adding to the schema

- Iterate via `mcp__supabase-core__execute_sql` while shaping a change
- Once stable, save to `supabase/migrations/NNNN_descriptive_name.sql` AND apply via `mcp__supabase-core__apply_migration` (so the migration history table stays in sync with the file)
- Run advisors after every migration: `mcp__supabase-core__get_advisors` for both `security` and `performance`
- Security advisor must be **0 lints** before considering a migration done
- Performance advisor INFOs on unindexed audit FKs are **accepted by design** — see `0005_fk_covering_indexes.sql` for the policy
- All RLS policies use `(select ...)` wrapping on auth/helper calls (InitPlan caching)
- Avoid `FOR ALL` policies that overlap with `FOR SELECT` — split into explicit FOR INSERT / FOR UPDATE (see `0007_split_for_all_policies.sql`)

## Important secrets (where they live)

- `OPERATOR_TOKEN` → Supabase edge function secret + admin app's `.env.local` as `VITE_OPERATOR_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY` → only in edge functions (auto-injected by Supabase)
- Anon key → admin app's `.env.local` as `VITE_SUPABASE_ANON_KEY`

## Things to never do

- Don't apply migrations directly via `execute_sql` for committed changes — use `apply_migration` so the history is recorded
- Don't put SECURITY DEFINER functions in the `public` schema (Supabase advisor will flag, and they're reachable via PostgREST)
- Don't add FKs to `audit` or `clinical_audit` — they must outlive what they reference (see migration 0016)
- Don't hardcode tenant-specific values anywhere — read from env vars or DB
- Don't touch the legacy `../Dentaloptima Booking project/` files — that's a separate frozen project
- Never assume an email belongs to the user — always confirm before sending invites

## Reference documentation

- Each migration file has a header comment explaining what it does and why
- The existing booking project at `../Dentaloptima Booking project/` has reusable React patterns (UI primitives, hooks) — copy as needed but don't modify the source

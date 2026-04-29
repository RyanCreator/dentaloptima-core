# dentaloptima-core — TODO

Living checklist. Tick as we go. Latest at top within each section.

## ✅ Done

### Schema (17 migrations)
- [x] 0001 identity layer (practice, practice_member, RLS helpers)
- [x] 0002 tighten function security
- [x] 0003 consolidate member update policies
- [x] 0004 patient + clinical core
- [x] 0005 FK covering indexes
- [x] 0006 services + schedule config
- [x] 0007 split FOR ALL policies
- [x] 0008 appointments + bookings (GiST overlap exclusion)
- [x] 0009 treatment + billing
- [x] 0010 NHS FP17
- [x] 0011 CQC governance
- [x] 0012 audit + retention
- [x] 0013 storage bucket + path-based RLS
- [x] 0014 operator role (app_metadata-driven)
- [x] 0015 audit FK SET NULL (precursor — 0016 dropped them entirely)
- [x] 0016 drop audit FKs entirely (audit must outlive what it references)
- [x] 0017 operations_tables (ops schema with outreach/email/support/leads/announcements/payments)

### Edge functions
- [x] create-practice-with-owner (operator-token auth, atomic create + invite)

### Admin app (MVP shell)
- [x] Vite + React + TS + Tailwind + shadcn scaffold
- [x] Supabase client wired with anon key + operator token
- [x] useAuth + ProtectedRoute (operator-only via is_operator RPC)
- [x] Login page (password + magic link)
- [x] Layout shell + Sidebar (mobile drawer)
- [x] Tenants list + NewTenantSheet
- [x] TenantDetail (read-only + members list)
- [x] Overview (4 stat cards)

### Smoke testing
- [x] End-to-end: practice + member + patient + service + appt + recall + audit + RLS isolation all verified

### Project setup
- [x] Git initialized, 4 commits on main
- [x] CLAUDE.md + .mcp.json for self-contained Claude Code sessions

---

## 🚧 Admin app — gaps to fill

### Edit + actions
- [x] **Edit tenant**: name, contact, NHS/CQC IDs (EditTenantSheet)
- [x] **Suspend tenant** action with confirm prompt (TenantDetail)
- [x] **Restore tenant** action (same control flips status)
- [ ] **Status change audit context tag** (currently logs as generic UPDATE, no special action code)
- [ ] **Trial expiry banner** on tenant rows nearing expiry
- [ ] **Operator impersonate** — view one tenant's clinical data via session-mode helper (needs schema work — `app_private.set_impersonate_practice(uuid)` style)

### Pages still to build
- [x] **Audit log** — combined audit + clinical_audit, search, paginated
- [x] **Practice members** invite — InviteMemberSheet on TenantDetail
- [ ] **Settings → Admins** — list operators, grant/revoke `is_operator` flag (needs new edge function)
- [ ] **Settings → Onboarding checklist** — per-tenant 8-item progress (NHS performer set up, services configured, hours set, etc.)

### Modules to migrate from the existing admin-dashboard
- [x] **Outreach → Contacts** (lifted to ops schema, supabaseOps client)
- [x] **Outreach → Templates** (lifted)
- [x] **Outreach → Campaigns + detail** (lifted)
- [x] **Leads** (with new-leads-count green pill badge)
- [x] **Email inbox / Messaging** (lifted)
- [x] **Support inbox + bell** (lifted; bell badge component copied)
- [x] **Announcements** (lifted)
- [ ] **Cross-tenant aggregates** richer version (MRR, trial pipeline, etc.) — Overview has 4 cards; richer version pending
- [ ] **Payment history** UI — schema migrated, no UI yet (RecordPaymentDialog needs rewrite for non-admin_user model)
- [ ] **Admins management** — needs full rewrite (legacy uses admin_user table; new model uses auth.users.raw_app_meta_data.is_operator)
- [ ] **Operator impersonate** — needs schema work (`app_private.set_impersonate_practice` GUC) + new dialog
- [ ] **Onboarding checklist** on TenantDetail — needs rewrite (legacy model used per-tenant health; new model is one-DB)
- [ ] **Trial expiry banner** on tenant rows — small rewrite (Tenant → Practice type)

### Polish
- [ ] **Sonner toast styling** — dark mode follow-up if needed
- [ ] **Empty states** for each list page
- [ ] **Loading skeletons** instead of plain "Loading…" text
- [ ] **Error boundaries** on each top-level route
- [ ] **Keyboard shortcuts** (cmd-K command palette)

---

## 🚧 Edge functions still to build

- [x] **invite-member** — auth-required edge function; operator OR practice OWNER/ADMIN can invite
- [ ] **accept-invite** — handler called from invite link landing page; sets up password, links auth.users to practice_member
- [ ] **request-password-reset** — for operators
- [ ] **change-tenant-status** — wraps status updates with audit context tagging
- [ ] **suspend-tenant** — soft-suspend (block all logins for that practice's members)
- [ ] **export-patient-sar** — GDPR Subject Access Request: returns all data for one patient as JSON + signed URLs for documents
- [ ] **submit-fp17-claim** — formats nhs_claim row to NHSBSA payload, submits, captures response
- [ ] **send-appointment-reminder** — cron-driven, T-24h and T-1h reminders
- [ ] **send-recall-reminder** — cron-driven, recalls due in 14d
- [ ] **stripe-webhook-handler** — for self-serve billing later

---

## 🚧 Booking app — entirely TODO

The day-to-day app practices use. Lives at `dentaloptima-core/web/`.

### Foundation
- [ ] Vite + React scaffold (mirror admin app)
- [ ] Supabase client (anon key + auth flow)
- [ ] useAuth — practice_member based, NOT operator-based
- [ ] PracticeContext provider (current_practice_id once at session start)
- [ ] Layout + Sidebar (booking-app sections)
- [ ] Login page (different from admin — accepts invites + password reset)

### Core pages (MVP)
- [ ] Dashboard / Today's schedule
- [ ] Calendar (week + day views)
- [ ] Patients list (with search, filters, pagination)
- [ ] Patient detail (tabs: clinical, history, appts, billing, documents)
- [ ] New booking flow (existing availability engine logic — port over)
- [ ] Booking requests inbox
- [ ] Waiting list

### NHS / CQC modules
- [ ] FP17 claim form (creates nhs_claim + treatment + optional ortho)
- [ ] FP17 submission queue (status workflow)
- [ ] Consent capture (digital signature, version snapshot)
- [ ] Prescription writer
- [ ] Treatment plan builder (sequence + tooth chart)
- [ ] Medical alert banner (top of patient record)
- [ ] Incident reporting form
- [ ] Complaint logging
- [ ] Safeguarding concern (admin-restricted)
- [ ] Policy library + ack tracking

### Settings (per-practice)
- [ ] Practice details (hours, closures)
- [ ] Staff management (availability, breaks, time off)
- [ ] Services catalogue
- [ ] Communication templates
- [ ] Reminder timing config

### Reports
- [ ] Daily appt summary
- [ ] NHS claim status report
- [ ] Recall due list
- [ ] Outstanding billing
- [ ] Patient retention list (using `fn_list_retention_eligible_patients`)

---

## 🚧 Schema follow-ups

- [ ] Add `date_of_death` column to `patient` (currently retention falls back to `last_visited_at` which is approximate)
- [ ] Add `app_private.set_impersonate_practice(uuid)` for operator impersonation (sets a session GUC that `current_practice_id()` checks first)
- [ ] Add operator-only RLS policies on more tables for legitimate cross-tenant queries (e.g. cross-tenant revenue reports)
- [ ] `pg_cron` jobs:
  - [ ] T-24h appointment reminder dispatcher
  - [ ] T-1h appointment reminder dispatcher
  - [ ] Recall reminder dispatcher (14d before due_date)
  - [ ] Retention eligible flag refresh (nightly summary)
- [ ] Consider `pg_partman` for `audit` + `clinical_audit` if they grow large (monthly partitions)

---

## 🚧 Operations / DevOps

- [ ] Push `dentaloptima-core` repo to GitHub (private)
- [ ] Set up Vercel / Cloudflare Pages deployment for admin app (admin.dentaloptima.com or similar)
- [ ] Set up DNS for the booking app domain pattern (`*.dentaloptima.app` or per-practice subdomain)
- [ ] Configure Supabase Auth → Site URL + redirect URLs for production domains
- [ ] Switch Auth → DB Connection Pool from "Absolute (10)" to "Percentage based" in dashboard
- [ ] Enable HaveIBeenPwned leaked-password protection in Auth settings
- [ ] Set ALLOWED_ORIGINS env var on edge functions in production
- [ ] CI: lint + type-check on every PR
- [ ] Backup verification cron — restore-test the daily backup monthly

---

## 🚧 Future (Phase 2+)

- [ ] **Migrate Optima Dental** off legacy per-tenant DB into dentaloptima-core
- [ ] **Stripe self-serve billing** integration (subscription + invoicing)
- [ ] **SMS reminders via Twilio**
- [ ] **Patient portal** (read-only patient login)
- [ ] **Two-factor auth** for OWNER/ADMIN roles
- [ ] **Data export tool** (per-practice full export for offboarding)
- [ ] **NHSBSA certification** + actual FP17 submission integration
- [ ] **CQC inspector portal** (read-only, time-limited credential)

---

## Notes

- Schema design rules + helpers documented in `CLAUDE.md`
- All migrations are source-controlled — never edit a migration after applying. Add a new one.
- Test practice from initial smoke test was deleted on 2026-04-28
- Operator account: `ryan_salter92@hotmail.com` (set via `raw_app_meta_data.is_operator = true`)

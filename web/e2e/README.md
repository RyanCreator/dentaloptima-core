# Booking app tests

Two layers:

- **Unit tests (Vitest)** — fast, pure-logic coverage of validators/mappers.
  Files: `src/**/*.test.ts`. `npm run test:unit` (or `test:unit:watch`).
- **E2E tests (Playwright)** — drive the real app in a browser against the
  shared `dentaloptima-core` DB. Files: `e2e/*.spec.ts`.

```bash
cd web
npm run test:unit          # Vitest (no browser, milliseconds)
npm run test:e2e           # Playwright, read-only suite (headless)
npm run test:e2e:ui        # Playwright UI mode
npm run test:e2e:report    # open the last HTML report
```

The Playwright config auto-starts the Vite dev server if one isn't running,
logs in once (session saved to `e2e/.auth/`), then runs the specs.

## Credentials & tenant

The app resolves its tenant from the hostname; `localhost` has none, so tests
inject a dev-hostname override (`fixtures.ts`) and log in with credentials from
a **gitignored** `web/.env.e2e.local`:

```
E2E_EMAIL / E2E_PASSWORD / E2E_DEV_HOSTNAME        # demo practice (read-only)
E2E_TP_EMAIL / E2E_TP_PASSWORD / E2E_TP_HOSTNAME   # isolated test practice
E2E_TP_PRACTICE_ID / E2E_TP_PATIENT_ID             # seeded ids
```

Never commit real credentials. `.env.*.local` is gitignored.

## Read-only suite (default, safe)

Runs against the demo practice and never writes:

- `smoke.spec.ts` — every route loads, shell renders, no genuine console errors.
- `fp17.spec.ts` — claims dashboard + activity-line detail + the validation gate.
- `patient-detail.spec.ts` — patient detail + all tabs render error-free.

## Mutating suite (opt-in, isolated)

Mutating specs (`*.mutating.spec.ts`) run **only** with `E2E_ALLOW_MUTATIONS=1`,
against a dedicated **isolated test practice** so real/demo data is never
touched. Pattern: do the action through the UI, assert it in the UI **and** the
DB (service-role `db.ts` helper), then clean up in `afterEach`.

```bash
# 1. Seed the isolated test practice (idempotent). Needs service-role creds:
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... E2E_TP_PASSWORD=... \
  npm run test:e2e:seed

# 2. Run the mutating suite (service-role creds power setup/teardown):
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... E2E_ALLOW_MUTATIONS=1 \
  npx playwright test --project=mutating
```

Worked example: `patient-notes.mutating.spec.ts` adds a note via the UI, asserts
it renders and persists, then deletes it. To extend coverage to every form,
add one `*.mutating.spec.ts` per area following the same UI-action / DB-verify /
cleanup pattern, and add stable `data-testid`s to the inputs you drive (see
`patient-note-input` / `patient-note-submit` in `PatientDetail.tsx`).

## Notes

- Tenant-specific demo records (e.g. a completed "Dental10" NHS appointment) are
  referenced by the read-only FP17 spec; if the demo data changes that test
  skips rather than failing.
- `e2e/.auth/`, `test-results/`, `playwright-report/` are gitignored.

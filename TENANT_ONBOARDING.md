# Tenant onboarding — DNS + SiteGround setup

What you (an operator) do every time a new dental practice is added to dentaloptima-core.

The booking app is **one** static deployment on SiteGround at `app.dentaloptima.co.uk`. Each tenant practice gets their own `app.<their-domain>` that CNAMEs to ours. The single deployment serves all hostnames; the booking app reads `window.location.hostname` to figure out which tenant the request is for.

**A tenant is dead in the water until both the DNS and SiteGround steps below are done.** The booking app refuses to load for any hostname that doesn't resolve to a practice in the database.

---

## Pre-flight checklist (before doing anything)

- [ ] Practice has been created in the admin app (`/tenants` → New tenant). You have a tenant in the list with status `TRIAL` or `ACTIVE`.
- [ ] You know what hostname they want — convention is `app.<their-existing-domain>` (e.g. `app.optimadental.co.uk`).
- [ ] The practice owner has access to their domain registrar / DNS host (123-Reg, GoDaddy, Cloudflare, etc.) and can add a DNS record themselves, **or** you have access on their behalf.

---

## Step 1 — Assign the hostname in the admin app

1. Open the tenant in the admin app: `https://admin.dentaloptima.co.uk/tenants/<id>`.
2. Click **Edit**.
3. In the **Booking app hostname** field, enter the full hostname (e.g. `app.optimadental.co.uk`). Lowercase only. No `https://`, no trailing slash.
4. Save.

The TenantDetail page should now show the hostname with a DNS-instructions block. The Tenants list will swap the amber `unset` pill for the actual hostname.

> If two tenants accidentally try to claim the same hostname, the DB rejects the second one with a unique-constraint error. Pick a different hostname.

---

## Step 2 — Practice owner adds the DNS CNAME

The practice owner needs to log into their DNS host and add **one** record:

| Field | Value |
|---|---|
| Type | `CNAME` |
| Name / Host | `app` |
| Value / Target | `app.dentaloptima.co.uk` |
| TTL | Default (300–3600s is fine) |

**Don't add an A record.** The CNAME lets us swap our infrastructure later without every tenant having to redo their DNS.

If their domain is managed by Cloudflare, make sure the orange-cloud proxy is **off** (DNS-only / grey-cloud), otherwise SSL provisioning in step 3 will loop.

### Verifying propagation

From your terminal:

```bash
dig +short app.optimadental.co.uk CNAME
```

You should get back `app.dentaloptima.co.uk.` once it's live. Usually 5–15 minutes. Up to 24h in the wild.

Or use https://dnschecker.org/ → type their hostname → CNAME.

---

## Step 3 — Add the hostname to SiteGround so SSL is provisioned

This is the part you (the operator) do, on our SiteGround account.

1. Log in to SiteGround.
2. Go to **Site Tools → the site hosting `app.dentaloptima.co.uk`**.
3. **Domain → Parked Domains** (or "Aliases" depending on the SiteGround UI version).
4. Click **Add new parked domain**, enter the tenant's hostname (e.g. `app.optimadental.co.uk`), confirm.
5. SiteGround needs to verify domain ownership before issuing the SSL cert. It does this automatically by checking the CNAME points back at us — which is why step 2 must complete before this step.
6. Go to **Security → SSL Manager**. Find the new hostname in the list. Click **Install** (or wait — SiteGround usually auto-issues a Let's Encrypt cert within 5–10 minutes once DNS is verified).
7. Verify status reads "Active" with a green tick.

### Sanity-check the cert

```bash
curl -I https://app.optimadental.co.uk
```

Should return a `200` (or `404`/`200` from the SPA — anything that proves SSL terminated cleanly). If you see SSL handshake errors, give Let's Encrypt another 5 minutes and retry.

---

## Step 4 — Tell the practice owner they're live

Once `https://<their-hostname>` loads the booking-app login page:

- They use the **owner email** that the original invite was sent to (from `/tenants/<id>` → Members table) and whatever password they set when accepting the invite.
- Login from any other tenant's hostname with their credentials will be **rejected** by the booking app — sessions are bound to the hostname's practice.

---

## When something goes wrong

### "DNS_PROBE_FINISHED_NXDOMAIN" or "site can't be reached"

- DNS hasn't propagated yet, or the CNAME is wrong. Check `dig +short <hostname> CNAME`.

### "Your connection is not private" / SSL warnings

- SiteGround hasn't issued the cert yet. Check Security → SSL Manager. If it's been >30 minutes since DNS propagated and SiteGround still hasn't issued, manually click **Install** in the SSL Manager UI.
- If their DNS is on Cloudflare with the orange-cloud proxy on, SiteGround can't see the real CNAME. Tell them to switch the record to grey-cloud (DNS-only).

### "Wrong domain for this account" toast on login

- The practice the user belongs to (`practice_member.practice_id`) doesn't match the practice that owns the hostname they're trying to log in from. Either they typed the wrong URL or they're trying the wrong account. Check the user's practice via the admin app: `/tenants/<id>` → Members table.

### Booking app shows "Practice unavailable"

- The practice is `SUSPENDED` or `OFFBOARDED`. Flip it back to `ACTIVE` (or `TRIAL` if still on trial) via the **Reactivate** button on TenantDetail.

### Booking app shows "Domain not configured"

- The hostname in `window.location.hostname` doesn't match any `practice.custom_hostname` in the DB. Either:
  - The hostname wasn't assigned in step 1, or
  - It was assigned with a typo (e.g. trailing whitespace, `https://` prefix, capital letters)
- Edit the tenant and verify the hostname field exactly matches what the user is typing into the address bar.

---

## Decommissioning a tenant

When a practice leaves:

1. Admin app → tenant → **Suspend** (immediate; blocks login).
2. Or for a hard offboard: edit the tenant, set `status = OFFBOARDED`, **clear the custom_hostname field**.
3. In SiteGround, remove the parked domain so the hostname stops resolving to us.
4. The practice owner can then delete or repoint the CNAME at their leisure.

The DB row is kept (soft-delete via `deleted_at`) for audit/retention purposes — never hard-delete a practice via SQL.

---

## FAQ — things people ask

**Q: Can a practice use a non-`app.` subdomain like `booking.X` or just root `X`?**
Currently no — the convention is `app.<root>`. The DB allows any hostname, so technically you could enter `booking.optimadental.co.uk`, but the practice would still have to set up DNS + SiteGround the same way. Stick to `app.` unless there's a strong reason.

**Q: Can a practice have multiple hostnames (e.g. `app.optimadental.co.uk` and `book.optimadental.co.uk`)?**
Not yet. One hostname per practice. If they need both, set the new one and either retire the old or have it 301-redirect at their DNS layer.

**Q: How many parked domains does SiteGround allow?**
Depends on the plan. The GrowBig and GoGeek plans allow effectively unlimited; Startup is capped. Confirm against current SiteGround plan limits before onboarding the 30th tenant.

**Q: Do I need separate Supabase projects per tenant?**
No. Everything lives in `dentaloptima-core` (Supabase project ref `jvwuorwfzoutojpyjnfk`). RLS isolates data by `practice_id`. The hostname is purely a UX/access-control layer at the booking app.

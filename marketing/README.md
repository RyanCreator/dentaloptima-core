# Template: Modern Premium

A polished, modern dental-practice website template. Config-driven, so a single
file (`src/config/practice.config.ts`) drives every piece of visible content.

This is a **template**, not a deployed site. Clone it into `client-sites/clients/<slug>/`
for each real practice.

---

## Stack

- **Vite + React + TypeScript** (SWC)
- **Tailwind CSS** with CSS-variable theming so a config change rebrands the site
- **Framer Motion** (`prefers-reduced-motion` aware)
- **React Hook Form + Zod** for secure, validated forms
- **Self-hosted fonts**: Inter Variable (body) + Fraunces Variable (display) via `@fontsource-variable/*`
- **@supabase/supabase-js** — booking + contact forms post to the tenant's Supabase

No external CDN calls, no Google Fonts, no ad-tech. GDPR-clean by default.

---

## Quick start

```bash
npm install
npm run dev       # dev server at localhost:5175
npm run build     # production build → dist/
npm run preview   # preview the built dist at localhost:5176
npm run typecheck # strict TS check
```

Additional scripts:

```bash
npm run placeholders   # regenerate all demo SVG placeholders in public/
```

---

## File layout

```
template-modern-premium/
├── public/
│   ├── hero/              hero images (desktop + mobile)
│   ├── services/          service card + hero + gallery images
│   ├── team/              clinician portraits
│   ├── gallery/           practice interior photos
│   ├── about/             about section photo
│   ├── logo-light.svg     white logo (used on dark backgrounds)
│   ├── logo-dark.svg      dark logo (used on light backgrounds)
│   ├── favicon.svg
│   ├── og.svg             open-graph social-share image
│   ├── .htaccess          SiteGround/Apache SPA fallback + security headers
│   └── _redirects         Netlify / CF-Pages SPA fallback
├── src/
│   ├── config/
│   │   ├── types.ts              PracticeConfig TS type
│   │   ├── schema.ts             Runtime Zod validation
│   │   └── practice.config.ts    THE FILE operators edit per client
│   ├── components/        Header, Footer, Hero, BookingForm, ContactForm, etc.
│   ├── pages/             Home, Services, ServiceDetail, About, Contact, Book, Privacy, Cookies
│   ├── lib/               seo.ts, branding.ts, supabase.ts, cn.ts
│   └── App.tsx, main.tsx, index.css
├── scripts/
│   ├── generate-placeholders.mjs    Demo SVG placeholders
│   └── generate-seo-files.mjs       sitemap.xml + robots.txt + llms.txt (runs on build)
├── package.json
├── tailwind.config.ts
├── vite.config.ts
└── tsconfig.json
```

---

## Onboarding a new client

See the full walkthrough in `../docs/CLIENT_SITE_ONBOARDING.md`. The short version:

### 1. Clone the template

```bash
cp -r client-sites/template-modern-premium client-sites/clients/<slug>
cd client-sites/clients/<slug>
```

### 2. Fill `src/config/practice.config.ts`

Every field has a TS type and a Zod validator. If you miss something, the
browser console will log the exact path (e.g. `services[2].cardImage: required`).

Critical fields:

| Field | Example |
|---|---|
| `name`, `legalName`, `tagline` | "Smile Co Dental Practice" etc |
| `contact.phone` | "01422 000 000" |
| `contact.email` | "hello@smile-co.co.uk" |
| `contact.bookingHostname` | "smile-co.co.uk" (hostname only, no scheme) |
| `branding.primaryRgb` | `"15 118 110"` (three space-separated 0-255 numbers) |
| `hero.image` / `imageMobile` | `/hero/hero-desktop.webp` |
| `services[]` | Each with a URL-safe slug (lowercase + hyphens) |
| `supabase.url` / `anonKey` | The tenant's Supabase project |

### 3. Drop in their images

Replace the placeholder SVGs in `public/` with real WebP photos using the same
filenames and folder structure. The config references them by path; no code
change needed.

### 4. Update the tenant's `allowed_origins`

On the tenant's Supabase, add the new hostname to `app_settings.allowed_origins`
so the booking + contact edge functions accept requests from that domain.

### 5. Deployment checklist

- [ ] Set `branding.*` to match the practice's brand colours
- [ ] All placeholder SVGs in `public/` replaced with real photos
- [ ] `practice.config.ts` passes validation in dev (check the browser console)
- [ ] `contact.bookingHostname` matches the actual domain they'll use
- [ ] Tenant's `supabase.url` / `anonKey` correct
- [ ] Tenant's `app_settings.allowed_origins` includes the new hostname
- [ ] Tenant has the `contact-form-submit` edge function deployed
- [ ] **Remove the `<meta name="robots" content="noindex">` tags from `index.html`** (they're there to keep the template hidden from crawlers; real practice sites need to be indexable)
- [ ] `npm run build` succeeds cleanly
- [ ] `npm run preview` — visit every page, submit booking + contact forms
- [ ] Upload `dist/` to the client's host

---

## Config validation

On every dev-server start + prod build, `assertConfigSane()` runs the Zod
schema against `practice.config.ts`. If anything's wrong you'll see something
like:

```
[practice.config] ❌ Config validation failed. Fix these before deploying:
  • services.2.cardImage: must be an absolute path (/foo) or full URL
  • contact.email: Invalid email
  • branding.primaryRgb: must be three space-separated 0-255 numbers
```

The site still renders, but the errors are loud so nothing ships silently
broken.

---

## Performance

Targets Lighthouse ≥90 on Performance / Accessibility / SEO. Included
out-of-the-box:

- Hero image + mobile variant preloaded in `index.html` (big LCP win)
- Font files preloaded with swap
- Vendor-chunk splitting (react, framer-motion, supabase, forms, icons)
  so first-load JS is small and cache hits are warm across routes
- Lazy `loading="lazy"` on all non-hero images
- `prefers-reduced-motion` respected
- No external script calls

---

## Accessibility

- Skip-to-main-content link (first focusable element)
- All form inputs wired to their error messages via `aria-describedby`
- `aria-invalid` on any field that fails validation
- Form errors use `role="alert"` so screen readers announce them
- Focus-visible rings on every interactive element
- Landmarks: `<header>`, `<main id="main">`, `<footer>` on every page

---

## SEO

- Per-page `<title>` + meta description + canonical, set from route + config
- Open Graph + Twitter card per page
- JSON-LD: `Organization`, `Dentist`/`LocalBusiness` (with geo + opening hours)
  site-wide; `Service` + `FAQPage` + `BreadcrumbList` per service page
- `sitemap.xml` auto-generated at build from routes + services
- `robots.txt` explicitly allows major AI crawlers (GPTBot, ClaudeBot, etc.)
- `llms.txt` practice summary for LLM-powered search tools
- `<html lang="en-GB">`

---

## Why a config file and not a CMS?

For 20-ish practice sites a file-per-client is genuinely simpler than a CMS.
Everything is in git, reviewable, typed, and deployable by one operator in
minutes. When you hit 50+ clients we'd look at hoisting the config into the
tenant's Supabase so the practice can edit their own website copy.

---

## Template hiding

The template ships with a `noindex, nofollow` robots meta tag to keep it
invisible to search engines while it's a template. **Remove that meta from
`index.html` before deploying a real client site** — it's in the deployment
checklist above.

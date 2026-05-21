// CSV import for patients. Far stricter validation than services because
// patient records carry PII / clinical weight — a malformed phone or DOB
// has consequences. Friendly headers (no DB column names exposed); we
// translate to the schema on commit.
//
// Duplicate detection: a row is treated as a duplicate of an existing
// patient when first + last name match AND either phone or email match.
// Duplicates are skipped (not overwritten); the operator can edit them
// after import. Only ACTIVE rows on the patient table count — soft-deleted
// records don't block re-importing.

import { parseCsv, toCsvRow } from "./csv";

// ---------------------------------------------------------------------------
// Friendly headers
// ---------------------------------------------------------------------------

export const CSV_COLUMNS = [
  { header: "First name", required: true, key: "first_name", hint: null },
  { header: "Last name", required: true, key: "last_name", hint: null },
  { header: "Title", required: false, key: "title", hint: "e.g. Mr, Mrs, Dr" },
  { header: "Preferred name", required: false, key: "preferred_name", hint: null },
  { header: "Date of birth", required: false, key: "dob", hint: "DD/MM/YYYY or YYYY-MM-DD" },
  { header: "Gender", required: false, key: "gender", hint: "Male, Female, Other, Prefer not to say" },
  { header: "NHS number", required: false, key: "nhs_number", hint: "10 digits, spaces optional" },
  { header: "Email", required: false, key: "email", hint: null },
  { header: "Phone", required: false, key: "phone", hint: "UK format, e.g. 07700 900123" },
  { header: "Phone (alternate)", required: false, key: "phone_alt", hint: null },
  { header: "Address line 1", required: false, key: "address_line1", hint: null },
  { header: "Address line 2", required: false, key: "address_line2", hint: null },
  { header: "City", required: false, key: "city", hint: null },
  { header: "Postcode", required: false, key: "postcode", hint: "e.g. SW1A 1AA" },
  { header: "Emergency contact name", required: false, key: "emergency_contact_name", hint: null },
  { header: "Emergency contact phone", required: false, key: "emergency_contact_phone", hint: null },
  { header: "Emergency contact relation", required: false, key: "emergency_contact_relation", hint: "e.g. Spouse, Parent" },
  { header: "GP name", required: false, key: "gp_name", hint: null },
  { header: "GP practice name", required: false, key: "gp_practice_name", hint: null },
] as const;

const GENDER_ALIASES: Record<string, string> = {
  m: "MALE",
  male: "MALE",
  f: "FEMALE",
  female: "FEMALE",
  o: "OTHER",
  other: "OTHER",
  "non-binary": "OTHER",
  nonbinary: "OTHER",
  "prefer not to say": "PREFER_NOT_TO_SAY",
  "rather not say": "PREFER_NOT_TO_SAY",
  unknown: "PREFER_NOT_TO_SAY",
};

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

// Headers only — no example rows. We deliberately avoid pre-filled
// patient data in case the sample value happens to match a real person's
// details. Format hints live on each CSV_COLUMNS entry and are surfaced
// in the import sheet's column reference instead.
export function buildTemplateCsv(): string {
  const headers = CSV_COLUMNS.map((c) => c.header);
  return toCsvRow(headers) + "\n";
}

// ---------------------------------------------------------------------------
// Parsed patient draft
// ---------------------------------------------------------------------------

// Subset of patient columns the importer writes. Extra columns get DB
// defaults (registration_status=PROSPECT, country=GB, etc.).
export interface PatientDraft {
  first_name: string;
  last_name: string;
  title: string | null;
  preferred_name: string | null;
  dob: string | null; // YYYY-MM-DD
  gender: string | null;
  nhs_number: string | null;
  email: string | null;
  phone: string | null;
  phone_alt: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  gp_name: string | null;
  gp_practice_name: string | null;
}

export interface ParsedRow {
  rowNumber: number;
  raw: Record<string, string>;
  draft: PatientDraft | null;
  errors: string[];
}

export interface ParseResult {
  fileError: string | null;
  headerWarnings: string[];
  rows: ParsedRow[];
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

export function parsePatientsCsv(text: string): ParseResult {
  const grid = parseCsv(text).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (grid.length === 0) {
    return { fileError: "The file is empty.", headerWarnings: [], rows: [] };
  }

  const rawHeaders = grid[0].map((h) => h.trim());
  const normalised = rawHeaders.map((h) => h.toLowerCase());
  const knownHeaderLookup = new Map(
    CSV_COLUMNS.map((c) => [c.header.toLowerCase(), c]),
  );

  const colIndex: Record<string, number> = {};
  for (const c of CSV_COLUMNS) colIndex[c.key] = -1;
  const headerWarnings: string[] = [];
  for (let i = 0; i < normalised.length; i++) {
    const known = knownHeaderLookup.get(normalised[i]);
    if (known) {
      colIndex[known.key] = i;
    } else if (rawHeaders[i] !== "") {
      headerWarnings.push(`Ignoring unknown column "${rawHeaders[i]}".`);
    }
  }

  const missingRequired = CSV_COLUMNS.filter(
    (c) => c.required && colIndex[c.key] === -1,
  );
  if (missingRequired.length > 0) {
    return {
      fileError: `Missing required column(s): ${missingRequired
        .map((c) => `"${c.header}"`)
        .join(", ")}. Download the template for the expected layout.`,
      headerWarnings,
      rows: [],
    };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i];
    const raw: Record<string, string> = {};
    for (const c of CSV_COLUMNS) {
      const idx = colIndex[c.key];
      raw[c.header] = idx === -1 ? "" : (cells[idx] ?? "").trim();
    }
    const { draft, errors } = validateRow(raw);
    rows.push({ rowNumber: i, raw, draft, errors });
  }
  return { fileError: null, headerWarnings, rows };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateRow(raw: Record<string, string>): {
  draft: PatientDraft | null;
  errors: string[];
} {
  const errors: string[] = [];

  const first = raw["First name"] ?? "";
  const last = raw["Last name"] ?? "";
  if (!first) errors.push(`"First name" is required.`);
  if (!last) errors.push(`"Last name" is required.`);

  const dobRaw = (raw["Date of birth"] ?? "").trim();
  const dob = dobRaw ? parseFlexibleDate(dobRaw) : null;
  if (dobRaw && !dob) {
    errors.push(`"Date of birth" must look like 12/04/1980 or 1980-04-12.`);
  } else if (dob && new Date(dob) > new Date()) {
    errors.push(`"Date of birth" can't be in the future.`);
  }

  const genderRaw = (raw["Gender"] ?? "").trim();
  let gender: string | null = null;
  if (genderRaw) {
    const mapped = GENDER_ALIASES[genderRaw.toLowerCase()];
    if (!mapped) {
      errors.push(`"Gender" must be Male, Female, Other, or Prefer not to say.`);
    } else {
      gender = mapped;
    }
  }

  const nhsRaw = (raw["NHS number"] ?? "").trim();
  let nhsNumber: string | null = null;
  if (nhsRaw) {
    const digits = nhsRaw.replace(/\D/g, "");
    if (digits.length !== 10) {
      errors.push(`"NHS number" must be 10 digits.`);
    } else {
      nhsNumber = digits;
    }
  }

  const emailRaw = (raw["Email"] ?? "").trim().toLowerCase();
  let email: string | null = null;
  if (emailRaw) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      errors.push(`"Email" doesn't look right.`);
    } else {
      email = emailRaw;
    }
  }

  const phone = normalisePhone(raw["Phone"] ?? "") || null;
  const phoneAlt = normalisePhone(raw["Phone (alternate)"] ?? "") || null;

  const postcode = (raw["Postcode"] ?? "").toUpperCase().replace(/\s+/g, " ").trim() || null;

  if (errors.length > 0) {
    return { draft: null, errors };
  }

  return {
    draft: {
      first_name: first,
      last_name: last,
      title: nullify(raw["Title"]),
      preferred_name: nullify(raw["Preferred name"]),
      dob,
      gender,
      nhs_number: nhsNumber,
      email,
      phone,
      phone_alt: phoneAlt,
      address_line1: nullify(raw["Address line 1"]),
      address_line2: nullify(raw["Address line 2"]),
      city: nullify(raw["City"]),
      postcode,
      emergency_contact_name: nullify(raw["Emergency contact name"]),
      emergency_contact_phone: normalisePhone(raw["Emergency contact phone"] ?? "") || null,
      emergency_contact_relation: nullify(raw["Emergency contact relation"]),
      gp_name: nullify(raw["GP name"]),
      gp_practice_name: nullify(raw["GP practice name"]),
    },
    errors: [],
  };
}

function nullify(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
}

// Accepts: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, D/M/YYYY (UK).
// Returns ISO YYYY-MM-DD, or null if unparseable.
export function parseFlexibleDate(raw: string): string | null {
  const trimmed = raw.trim();

  // ISO first
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    return formatYmd(+y, +m, +d);
  }

  // UK: D[/-]M[/-]YYYY
  const uk = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (uk) {
    const [, d, m, y] = uk;
    return formatYmd(+y, +m, +d);
  }

  return null;
}

function formatYmd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Validate via Date to catch e.g. Feb 30
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Normalise a UK phone for storage + duplicate matching.
//   - strip spaces, parens, dashes
//   - +44 → 0 (so +44 7700 900123 and 07700 900123 match)
// Returns "" if input has too few digits to be useful.
export function normalisePhone(raw: string): string {
  if (!raw) return "";
  let s = raw.replace(/[^\d+]/g, "");
  if (s.startsWith("+44")) s = "0" + s.slice(3);
  if (s.startsWith("0044")) s = "0" + s.slice(4);
  if (s.length < 6) return "";
  return s;
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export interface ExistingPatientLite {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

// Returns the set of CSV row numbers that match an existing patient on
// (name + phone) OR (name + email). Caller skips these on insert.
export function findDuplicateRowNumbers(
  drafts: { rowNumber: number; draft: PatientDraft | null }[],
  existing: ExistingPatientLite[],
): Map<number, ExistingPatientLite> {
  const out = new Map<number, ExistingPatientLite>();
  // Pre-index existing by (name, phone) and (name, email). Cheap, even for
  // 50k patients.
  const byNamePhone = new Map<string, ExistingPatientLite>();
  const byNameEmail = new Map<string, ExistingPatientLite>();
  for (const p of existing) {
    const nameKey = nameKey2(p.first_name, p.last_name);
    if (p.phone) {
      byNamePhone.set(`${nameKey}|${normalisePhone(p.phone)}`, p);
    }
    if (p.email) {
      byNameEmail.set(`${nameKey}|${p.email.trim().toLowerCase()}`, p);
    }
  }
  for (const r of drafts) {
    if (!r.draft) continue;
    const nameKey = nameKey2(r.draft.first_name, r.draft.last_name);
    const phoneKey = r.draft.phone ? `${nameKey}|${r.draft.phone}` : null;
    const emailKey = r.draft.email ? `${nameKey}|${r.draft.email}` : null;
    const match =
      (phoneKey && byNamePhone.get(phoneKey)) ||
      (emailKey && byNameEmail.get(emailKey));
    if (match) out.set(r.rowNumber, match);
  }
  return out;
}

function nameKey2(first: string, last: string): string {
  return `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}`;
}

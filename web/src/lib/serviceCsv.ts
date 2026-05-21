// CSV import support for services. The CSV uses friendly column headers
// rather than raw DB column names — operators populate the file in Excel
// or Google Sheets and don't need to know our schema.
//
// Friendly → DB mapping is below. Anything we accept here, the existing
// ServiceForm also accepts; the import path is just bulk plumbing on top
// of useServiceManagement's createService.

import type { Service } from "@/types/entities";
import { parseCsv, toCsvRow } from "./csv";

// ---------------------------------------------------------------------------
// Friendly headers + mapping
// ---------------------------------------------------------------------------

// Order here also drives the order in the downloaded template. Required
// columns come first so they're visually obvious.
export const CSV_COLUMNS = [
  { header: "Service name", required: true, key: "name" },
  { header: "Duration (minutes)", required: true, key: "duration_minutes" },
  { header: "Price (£)", required: false, key: "price_pence" },
  { header: "Treatment type", required: false, key: "treatment_type" },
  { header: "NHS service", required: false, key: "is_nhs" },
  { header: "NHS band", required: false, key: "nhs_band" },
  { header: "Recall interval (months)", required: false, key: "recall_months" },
  { header: "Buffer before (minutes)", required: false, key: "buffer_before_minutes" },
  { header: "Buffer after (minutes)", required: false, key: "buffer_after_minutes" },
  { header: "Calendar colour (hex)", required: false, key: "color_hex" },
  { header: "Publicly bookable", required: false, key: "is_publicly_bookable" },
  { header: "Active", required: false, key: "is_active" },
] as const;

// Friendly enum values an operator might type, mapped to our DB enums.
// Lowercase comparison; values not in this map fail validation.
const TREATMENT_TYPE_ALIASES: Record<string, string> = {
  examination: "EXAMINATION",
  hygiene: "HYGIENE",
  restorative: "RESTORATIVE",
  endodontic: "ENDODONTIC",
  prosthodontic: "PROSTHODONTIC",
  orthodontic: "ORTHODONTIC",
  periodontal: "PERIODONTAL",
  "oral surgery": "ORAL_SURGERY",
  cosmetic: "COSMETIC",
  emergency: "EMERGENCY",
  consultation: "CONSULTATION",
  "x-ray": "X_RAY",
  "x ray": "X_RAY",
  xray: "X_RAY",
  other: "OTHER",
};

const NHS_BAND_ALIASES: Record<string, string> = {
  "band 1": "BAND_1",
  "band 2": "BAND_2",
  "band 3": "BAND_3",
  "1": "BAND_1",
  "2": "BAND_2",
  "3": "BAND_3",
};

// ---------------------------------------------------------------------------
// Template generation
// ---------------------------------------------------------------------------

// CSV the operator downloads as a starting point. Pre-filled with a
// representative set of UK general-dentistry services so a new practice
// has something to edit rather than a blank canvas. NHS prices reflect
// the patient-facing band fee (Band 1 / 2 / 3) — practices update these
// each April when NHSBSA publishes the new charges. Private prices are
// indicative; every practice tweaks these on the way in.
//
// Calendar colours follow the broad treatment families:
//   exam / consult — blue            hygiene — teal
//   restorative — green              extraction — orange
//   endodontic — violet              prosthetic — indigo
//   x-ray — cyan                     emergency — red
//   cosmetic — pink
export function buildTemplateCsv(): string {
  const headers = CSV_COLUMNS.map((c) => c.header);
  const rows: string[][] = [
    // name, duration, price, type, isNhs, band, recall, before, after, colour, public, active
    ["Routine examination",   "30",  "27",  "Examination",   "Yes", "Band 1", "6", "0", "0", "#3B82F6", "Yes", "Yes"],
    ["New patient consultation","45", "80",  "Consultation",  "No",  "",       "",  "0", "0", "#3B82F6", "Yes", "Yes"],
    ["Hygiene appointment",   "30",  "75",  "Hygiene",       "No",  "",       "6", "0", "0", "#14B8A6", "Yes", "Yes"],
    ["Composite filling",     "45",  "75",  "Restorative",   "Yes", "Band 2", "",  "5", "5", "#22C55E", "Yes", "Yes"],
    ["Extraction (simple)",   "30",  "75",  "Oral surgery",  "Yes", "Band 2", "",  "5", "5", "#F97316", "Yes", "Yes"],
    ["Root canal treatment",  "60",  "75",  "Endodontic",    "Yes", "Band 2", "",  "5", "10","#8B5CF6", "Yes", "Yes"],
    ["Crown",                 "60",  "326", "Prosthodontic", "Yes", "Band 3", "",  "5", "10","#6366F1", "Yes", "Yes"],
    ["X-ray (single)",        "15",  "27",  "X-ray",         "Yes", "Band 1", "",  "0", "0", "#06B6D4", "No",  "Yes"],
    ["Emergency appointment", "30",  "85",  "Emergency",     "No",  "",       "",  "0", "5", "#EF4444", "Yes", "Yes"],
    ["Teeth whitening",       "60",  "400", "Cosmetic",      "No",  "",       "",  "0", "0", "#EC4899", "Yes", "Yes"],
  ];
  return [headers, ...rows].map(toCsvRow).join("\n");
}

// ---------------------------------------------------------------------------
// Row → service draft validation
// ---------------------------------------------------------------------------

export type ServiceDraft = Partial<Service>;

export interface ParsedRow {
  rowNumber: number; // 1-based, excluding header
  raw: Record<string, string>;
  draft: ServiceDraft | null; // null when row has errors
  errors: string[];
}

export interface ParseResult {
  // null when the file itself is unusable (missing headers, no rows, etc).
  // Otherwise we always return per-row results — even if every row errored.
  fileError: string | null;
  headerWarnings: string[]; // e.g. unknown extra columns
  rows: ParsedRow[];
}

// Top-level entry point: text → validated rows ready to insert.
export function parseServicesCsv(text: string): ParseResult {
  const grid = parseCsv(text).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (grid.length === 0) {
    return { fileError: "The file is empty.", headerWarnings: [], rows: [] };
  }

  const rawHeaders = grid[0].map((h) => h.trim());
  const normalisedHeaders = rawHeaders.map((h) => h.toLowerCase());
  const knownHeaderLookup = new Map(
    CSV_COLUMNS.map((c) => [c.header.toLowerCase(), c]),
  );

  // Index of each known column within the row, or -1 if missing.
  const colIndex: Record<string, number> = {};
  for (const c of CSV_COLUMNS) colIndex[c.key] = -1;
  const headerWarnings: string[] = [];
  for (let i = 0; i < normalisedHeaders.length; i++) {
    const known = knownHeaderLookup.get(normalisedHeaders[i]);
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

// Per-row validator — pure, reused by the preview UI.
function validateRow(raw: Record<string, string>): {
  draft: ServiceDraft | null;
  errors: string[];
} {
  const errors: string[] = [];

  const name = raw["Service name"] ?? "";
  if (!name) errors.push(`"Service name" is required.`);

  const durationStr = raw["Duration (minutes)"] ?? "";
  const duration = parseInt(durationStr, 10);
  if (!durationStr) {
    errors.push(`"Duration (minutes)" is required.`);
  } else if (Number.isNaN(duration) || duration <= 0) {
    errors.push(`"Duration (minutes)" must be a positive whole number.`);
  }

  const priceStr = raw["Price (£)"] ?? "";
  let pricePence: number | null = null;
  if (priceStr !== "") {
    const cleaned = priceStr.replace(/^£\s*/, "");
    const pounds = Number(cleaned);
    if (Number.isNaN(pounds) || pounds < 0) {
      errors.push(`"Price (£)" must be a positive number (e.g. 65 or 120.50).`);
    } else {
      pricePence = Math.round(pounds * 100);
    }
  }

  let treatmentType: string = "OTHER";
  const ttRaw = (raw["Treatment type"] ?? "").trim();
  if (ttRaw) {
    const mapped = TREATMENT_TYPE_ALIASES[ttRaw.toLowerCase()];
    if (!mapped) {
      errors.push(
        `"Treatment type" must be one of: ${Object.keys(TREATMENT_TYPE_ALIASES)
          .filter((v) => !v.includes(" ") || v === "oral surgery")
          .map(humanCase)
          .join(", ")}, etc.`,
      );
    } else {
      treatmentType = mapped;
    }
  }

  const isNhs = parseYesNo(raw["NHS service"], false);

  let nhsBand: string | null = null;
  const bandRaw = (raw["NHS band"] ?? "").trim();
  if (bandRaw) {
    const mapped = NHS_BAND_ALIASES[bandRaw.toLowerCase()];
    if (!mapped) {
      errors.push(`"NHS band" must be Band 1, Band 2, or Band 3.`);
    } else {
      nhsBand = mapped;
    }
  }
  if (isNhs === true && !nhsBand) {
    // NHS but no band: defaulting silently would be wrong because the
    // band determines the FP17 line. Force the operator to pick.
    errors.push(`"NHS band" is required when "NHS service" is Yes.`);
  }
  if (isNhs === false && nhsBand) {
    // Band set but service isn't NHS — let it through but null the band
    // since it'd be ignored anyway. No error.
    nhsBand = null;
  }

  const recallStr = raw["Recall interval (months)"] ?? "";
  let recallMonths: number | null = null;
  if (recallStr !== "") {
    const r = parseInt(recallStr, 10);
    if (Number.isNaN(r) || r <= 0 || r > 24) {
      errors.push(`"Recall interval (months)" must be between 1 and 24.`);
    } else {
      recallMonths = r;
    }
  }

  const beforeStr = raw["Buffer before (minutes)"] ?? "";
  const bufferBefore = beforeStr === "" ? 0 : parseInt(beforeStr, 10);
  if (beforeStr !== "" && (Number.isNaN(bufferBefore) || bufferBefore < 0)) {
    errors.push(`"Buffer before (minutes)" must be 0 or a positive whole number.`);
  }
  const afterStr = raw["Buffer after (minutes)"] ?? "";
  const bufferAfter = afterStr === "" ? 0 : parseInt(afterStr, 10);
  if (afterStr !== "" && (Number.isNaN(bufferAfter) || bufferAfter < 0)) {
    errors.push(`"Buffer after (minutes)" must be 0 or a positive whole number.`);
  }

  let colorHex: string | null = null;
  const colourRaw = (raw["Calendar colour (hex)"] ?? "").trim();
  if (colourRaw) {
    const withHash = colourRaw.startsWith("#") ? colourRaw : `#${colourRaw}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) {
      errors.push(`"Calendar colour (hex)" must be a 6-digit hex code, e.g. #3B82F6.`);
    } else {
      colorHex = withHash.toUpperCase();
    }
  }

  const isPubliclyBookable = parseYesNo(raw["Publicly bookable"], true);
  const isActive = parseYesNo(raw["Active"], true);

  if (errors.length > 0) {
    return { draft: null, errors };
  }

  const draft: ServiceDraft = {
    name: name,
    duration_minutes: duration,
    price_pence: pricePence,
    treatment_type: treatmentType as Service["treatment_type"],
    is_nhs: isNhs ?? false,
    nhs_band: nhsBand as Service["nhs_band"] | null,
    recall_months: recallMonths,
    buffer_before_minutes: Number.isNaN(bufferBefore) ? 0 : bufferBefore,
    buffer_after_minutes: Number.isNaN(bufferAfter) ? 0 : bufferAfter,
    color_hex: colorHex,
    is_publicly_bookable: isPubliclyBookable ?? true,
    is_active: isActive ?? true,
  };
  return { draft, errors: [] };
}

// "yes" / "true" / "1" → true. "no" / "false" / "0" → false. Empty → fallback.
function parseYesNo(raw: string | undefined, fallback: boolean): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "") return fallback;
  if (["yes", "y", "true", "t", "1"].includes(v)) return true;
  if (["no", "n", "false", "f", "0"].includes(v)) return false;
  return fallback;
}

function humanCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

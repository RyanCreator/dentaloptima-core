// Tiny RFC4180-ish CSV utilities shared by all importers (services,
// patients, etc.). Handles quoted fields, escaped double-quotes, CR/LF
// line endings, and the BOM Excel sometimes prepends. Doesn't try to
// cover every edge case (e.g. embedded newlines inside quoted fields)
// — operators pasting from Excel almost never trigger those.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      cur.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
      i++;
      if (text[i] === "\n") i++;
      continue;
    }
    if (ch === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}

export function toCsvRow(values: string[]): string {
  return values.map(escapeCsvCell).join(",");
}

export function escapeCsvCell(value: string): string {
  if (value === "") return "";
  if (/[",\n\r]/.test(value) || value !== value.trim()) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

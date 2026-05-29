/**
 * HUA BOOKINGS — read-only Office Script for Power Automate.
 * Update the copy in your Script Library when this file changes.
 */
function main(workbook: ExcelScript.Workbook): string {
  const events: {
    date: string;
    title: string;
    ticketsAvailable: number | null;
    sheetName: string;
  }[] = [];
  const skippedTabNames: string[] = [];

  for (const sheet of workbook.getWorksheets()) {
    const sheetName = sheet.getName();
    const parsed = parseSheetTabName(sheetName);
    if (!parsed) {
      skippedTabNames.push(sheetName);
      continue;
    }

    const used = sheet.getUsedRange();
    if (!used) {
      skippedTabNames.push(sheetName);
      continue;
    }

    const tickets = extractTicketsFromGrid(used.getValues() as (string | number | boolean)[][]);
    events.push({
      date: parsed.date,
      title: parsed.title,
      ticketsAvailable: tickets,
      sheetName,
    });
  }

  return JSON.stringify({ events, skippedTabNames });
}

const TICKET_LABELS = ["tickets available", "tickets avalible"];
const DEFAULT_YEAR = 2026;

function parseSheetTabName(sheetName: string): { title: string; date: string } | null {
  const trimmed = sheetName.trim();
  if (!trimmed || /^sheet\d+$/i.test(trimmed)) return null;

  // "Spring Gala 5/12/26" or "Spring Gala 5/12/2026"
  let match = trimmed.match(/^(.+?)\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) return buildParsed(match[1], match[2], match[3], match[4]);

  // "5/12/26 Spring Gala" or "5/12 Spring Gala"
  match = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(.+)$/);
  if (match) {
    const year = match[3] ? match[3] : String(DEFAULT_YEAR);
    return buildParsed(match[4], match[1], match[2], year);
  }

  // "5.12 Spring Gala" or "05.12 Spring Gala" at start
  match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\s+(.+)$/);
  if (match) return buildParsed(match[3], match[1], match[2], String(DEFAULT_YEAR));

  // "Spring Gala 5.12.26"
  match = trimmed.match(/^(.+?)\s+(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (match) return buildParsed(match[1], match[2], match[3], match[4]);

  // Date anywhere at end: "Something 5/12/26"
  match = trimmed.match(/^(.+?)\s(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) return buildParsed(match[1], match[2], match[3], match[4]);

  return null;
}

function buildParsed(
  titleRaw: string,
  monthRaw: string,
  dayRaw: string,
  yearRaw: string
): { title: string; date: string } | null {
  const title = titleRaw.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  const month = parseInt(monthRaw, 10);
  const day = parseInt(dayRaw, 10);
  let year = parseInt(yearRaw, 10);
  if (year < 100) year += 2000;

  if (!title || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { title, date: toISODate(year, month, day) };
}

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function cellText(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseTicketCount(value: string | number | boolean | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const n = parseInt(String(value).replace(/,/g, "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function extractTicketsFromGrid(values: (string | number | boolean)[][]): number | null {
  for (const row of values) {
    if (!row || !row.length) continue;
    for (let c = 0; c < row.length; c++) {
      const text = cellText(row[c]).toLowerCase();
      if (!TICKET_LABELS.some((label) => text.includes(label))) continue;
      if (c === 0) return null;
      return parseTicketCount(row[c - 1]);
    }
  }
  return null;
}

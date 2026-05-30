/**
 * HUA BOOKINGS — wave availability Office Script for Power Automate.
 * Copy into Excel Script Library on each Office 48 / Office 46 workbook.
 *
 * Workbook layout:
 * - One worksheet tab per day of the month (e.g. "1", "May 1", "5/1/26").
 * - Column B: wave time labels read from SharePoint (same time can repeat on multiple rows = multiple allotments).
 * - Column C: booking detail — empty cell = open allotment, any value = booked allotment.
 * Open count per wave time = rows for that time minus rows with text in column C.
 */
function main(
  workbook: ExcelScript.Workbook,
  monthYear: string,
  officeId: string
): string {
  const days: {
    day: number;
    date: string;
    sheetName: string;
    slots: {
      time: string;
      open: boolean;
      spotsOpen: number;
      totalSpots: number;
      detail: string | null;
    }[];
    openCount: number;
    totalCount: number;
  }[] = [];
  const skippedTabNames: string[] = [];

  const parsedMonth = parseMonthYear(monthYear);
  if (!parsedMonth) {
    return JSON.stringify({
      officeId,
      month: monthYear,
      error: "Invalid monthYear — use YYYY-MM",
      days: [],
      skippedTabNames,
    });
  }

  for (const sheet of workbook.getWorksheets()) {
    const sheetName = sheet.getName();
    const dayNum = parseDayFromSheetName(sheetName, parsedMonth.month);
    if (dayNum == null) {
      skippedTabNames.push(sheetName);
      continue;
    }

    const used = sheet.getUsedRange();
    if (!used) {
      skippedTabNames.push(sheetName);
      continue;
    }

    const values = used.getValues() as (string | number | boolean)[][];
    const slots = extractWaveSlots(values);
    if (!slots.length) {
      skippedTabNames.push(sheetName);
      continue;
    }

    const openCount = slots.reduce((sum, slot) => sum + slot.spotsOpen, 0);
    const totalCount = slots.reduce((sum, slot) => sum + slot.totalSpots, 0);
    days.push({
      day: dayNum,
      date: toISODate(parsedMonth.year, parsedMonth.month, dayNum),
      sheetName,
      slots,
      openCount,
      totalCount,
    });
  }

  days.sort((a, b) => a.day - b.day);

  return JSON.stringify({
    officeId,
    month: monthYear,
    days,
    skippedTabNames,
  });
}

function parseMonthYear(value: string): { year: number; month: number } | null {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function parseDayFromSheetName(sheetName: string, expectedMonth?: number): number | null {
  const trimmed = sheetName.trim();
  if (!trimmed || /^sheet\d+$/i.test(trimmed)) return null;

  let match = trimmed.match(/^(\d{1,2})$/);
  if (match) return clampDay(parseInt(match[1], 10));

  match = trimmed.match(/^(?:day\s*)?(\d{1,2})$/i);
  if (match) return clampDay(parseInt(match[1], 10));

  match = trimmed.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (match) {
    const a = parseInt(match[1], 10);
    const b = parseInt(match[2], 10);
    if (expectedMonth && a === expectedMonth) return clampDay(b);
    if (expectedMonth && b === expectedMonth) return clampDay(a);
    return clampDay(b <= 31 ? b : a);
  }

  const monthNames =
    "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
  match = trimmed.match(new RegExp(`^(?:${monthNames})\\s+(\\d{1,2})$`, "i"));
  if (match) return clampDay(parseInt(match[1], 10));

  match = trimmed.match(new RegExp(`^(\\d{1,2})\\s+(?:${monthNames})$`, "i"));
  if (match) return clampDay(parseInt(match[1], 10));

  return null;
}

function clampDay(day: number): number | null {
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  return day;
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

function looksLikeWaveHeader(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower === "wave time" ||
    lower === "wave times" ||
    lower === "time" ||
    lower === "wave" ||
    lower.startsWith("wave time")
  );
}

function normalizeWaveTimeKey(time: string): string {
  return time.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractWaveSlots(
  values: (string | number | boolean)[][]
): { time: string; open: boolean; spotsOpen: number; totalSpots: number; detail: string | null }[] {
  type WaveGroup = {
    displayTime: string;
    totalSpots: number;
    bookedCount: number;
    firstIndex: number;
  };

  const groups = new Map<string, WaveGroup>();
  let headerRowPassed = false;

  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    if (!row || row.length < 2) continue;

    const waveTime = cellText(row[1]);
    if (!waveTime) continue;

    if (!headerRowPassed && looksLikeWaveHeader(waveTime)) {
      headerRowPassed = true;
      continue;
    }
    headerRowPassed = true;

    const booking = row.length > 2 ? cellText(row[2]) : "";
    const key = normalizeWaveTimeKey(waveTime);
    let group = groups.get(key);
    if (!group) {
      group = {
        displayTime: waveTime,
        totalSpots: 0,
        bookedCount: 0,
        firstIndex: rowIndex,
      };
      groups.set(key, group);
    }

    group.totalSpots += 1;
    if (booking !== "") group.bookedCount += 1;
  }

  return Array.from(groups.values())
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((group) => {
      const spotsOpen = group.totalSpots - group.bookedCount;
      return {
        time: group.displayTime,
        spotsOpen,
        totalSpots: group.totalSpots,
        open: spotsOpen > 0,
        detail: spotsOpen === 0 ? "FULL" : null,
      };
    });
}

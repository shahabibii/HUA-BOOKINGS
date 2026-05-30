#!/usr/bin/env node
/**
 * Merges Power Automate payload into data/availability.json.
 * Used by .github/workflows/update-availability-from-dispatch.yml
 */
const fs = require("fs");
const path = require("path");

const OFFICE_LABELS = {
  office48: "Office 48 - OWN",
  office46: "Office 46 - NON OWN",
};

const raw = process.env.AVAILABILITY_PAYLOAD || "{}";
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  payload = {};
}
if (payload == null || typeof payload !== "object") {
  payload = {};
}

const dataPath = path.join(__dirname, "..", "data", "availability.json");
let existing = { offices: {} };
if (fs.existsSync(dataPath)) {
  try {
    existing = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch {
    existing = { offices: {} };
  }
}

if (!existing.offices || typeof existing.offices !== "object") {
  existing.offices = {};
}

function ensureOffice(officeId) {
  if (!existing.offices[officeId]) {
    existing.offices[officeId] = {
      label: OFFICE_LABELS[officeId] || officeId,
      months: {},
    };
  }
  if (!existing.offices[officeId].months) {
    existing.offices[officeId].months = {};
  }
  return existing.offices[officeId];
}

function sumDayAllotments(slots) {
  let openCount = 0;
  let totalCount = 0;
  for (const slot of slots) {
    const totalSpots = typeof slot.totalSpots === "number" ? slot.totalSpots : 1;
    const spotsOpen =
      typeof slot.spotsOpen === "number"
        ? slot.spotsOpen
        : slot.open
          ? totalSpots
          : 0;
    openCount += Math.max(0, spotsOpen);
    totalCount += Math.max(0, totalSpots);
  }
  return { openCount, totalCount };
}

function applyOfficeMonthUpdate(update) {
  const officeId = update.officeId || update.office;
  const month = update.month;
  if (!officeId || !month || !Array.isArray(update.days)) return;

  const office = ensureOffice(officeId);
  office.label = update.label || office.label || OFFICE_LABELS[officeId] || officeId;

  if (!office.months[month]) {
    office.months[month] = { days: {} };
  }
  if (!office.months[month].days) {
    office.months[month].days = {};
  }

  for (const dayEntry of update.days) {
    const date = dayEntry.date;
    if (!date) continue;
    const slots = Array.isArray(dayEntry.slots) ? dayEntry.slots : [];
    const summed = sumDayAllotments(slots);
    const openCount =
      typeof dayEntry.openCount === "number" ? dayEntry.openCount : summed.openCount;
    const totalCount =
      typeof dayEntry.totalCount === "number" ? dayEntry.totalCount : summed.totalCount;

    office.months[month].days[date] = {
      sheetName: dayEntry.sheetName || "",
      slots,
      openCount,
      totalCount,
    };
  }
}

const updates = Array.isArray(payload.updates)
  ? payload.updates
  : payload.officeId || payload.office
    ? [payload]
    : [];

for (const update of updates) {
  applyOfficeMonthUpdate(update);
}

existing.updatedAt = payload.updatedAt || new Date().toISOString();

fs.mkdirSync(path.dirname(dataPath), { recursive: true });
fs.writeFileSync(dataPath, JSON.stringify(existing, null, 2) + "\n");

const officeCount = Object.keys(existing.offices).length;
console.log(`Wrote ${dataPath} (${officeCount} offices, ${updates.length} update batch(es))`);

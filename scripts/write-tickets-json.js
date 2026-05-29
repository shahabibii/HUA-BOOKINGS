#!/usr/bin/env node
/**
 * Writes data/tickets.json from TICKETS_PAYLOAD env (JSON string).
 * Used by .github/workflows/update-tickets-from-dispatch.yml
 */
const fs = require("fs");
const path = require("path");

const raw = process.env.TICKETS_PAYLOAD || "{}";
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  payload = {};
}
if (payload == null || typeof payload !== "object") {
  payload = {};
}

const out = {
  updatedAt: payload.updatedAt || new Date().toISOString(),
  events: Array.isArray(payload.events) ? payload.events : [],
};

const outPath = path.join(__dirname, "..", "data", "tickets.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${outPath} (${out.events.length} events)`);

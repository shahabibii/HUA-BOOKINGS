#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const CANCELED_FILE = path.join(__dirname, "..", "data", "canceled-events.json");

function normalizeTitle(raw) {
  return String(raw || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function loadCanceledEvents() {
  try {
    const data = JSON.parse(fs.readFileSync(CANCELED_FILE, "utf8"));
    return Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}

function isCanceledEvent(date, title, canceledList = loadCanceledEvents()) {
  if (!date) return false;
  const want = `${date}|${normalizeTitle(title)}`;
  return canceledList.some((c) => {
    if (!c?.date) return false;
    return `${c.date}|${normalizeTitle(c.title)}` === want;
  });
}

function filterCanceledEvents(events, canceledList = loadCanceledEvents()) {
  if (!Array.isArray(events)) return [];
  return events.filter((e) => !isCanceledEvent(e.date, e.title, canceledList));
}

module.exports = {
  loadCanceledEvents,
  isCanceledEvent,
  filterCanceledEvents,
  normalizeTitle,
};

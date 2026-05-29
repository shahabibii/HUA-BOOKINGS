#!/usr/bin/env node
/**
 * Scans flyers/ (including month subfolders) for PDFs and writes data/flyers.json.
 * Run after adding or removing hosted flyers: node scripts/generate-flyers-manifest.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FLYERS_DIR = path.join(ROOT, "flyers");
const OUT_FILE = path.join(ROOT, "data", "flyers.json");

function walkPdfs(dir, relBase = "") {
  /** @type {string[]} */
  const files = [];
  if (!fs.existsSync(dir)) return files;

  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const rel = relBase ? `${relBase}/${name}` : name;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkPdfs(full, rel));
      continue;
    }
    if (/\.pdf$/i.test(name)) {
      files.push(rel.replace(/\\/g, "/"));
    }
  }
  return files;
}

const files = walkPdfs(FLYERS_DIR);
const manifest = {
  generatedAt: new Date().toISOString(),
  files,
};

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Found ${files.length} PDF(s) under flyers/`);
if (files.length) {
  for (const f of files) console.log(`  • ${f}`);
}
console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);

# Wave availability — SharePoint + Power Automate

The **Avalibility** page reads **`data/availability.json`** on GitHub Pages (no Microsoft sign-in for staff). Power Automate keeps that file updated from your live SharePoint Excel workbooks.

## Two offices, two SharePoint files

Each office has its **own Excel workbook** on SharePoint. Power Automate must read **both** files on each run and send one combined update to GitHub.

| Office | Site label | SharePoint file (May 2026) |
|--------|------------|----------------------------|
| **Office 48** | Office 48 - OWN | `d63a7305-fe67-4aa9-be73-e25fdc581f78` |
| **Office 46** | Office 46 - NON OWN | `400e6d21-7450-45c7-ba96-7e4d0026eeb6` |

File IDs and monthly URLs are registered in [`data/availability-sources.json`](../data/availability-sources.json). **Each new month**, add two workbook entries (one per office) with the new SharePoint links.

**Wave times are not hardcoded on the site.** They are whatever appears in **column B** of each day’s tab when Power Automate runs the Office Script. The `8:00 AM`, `9:30 AM`, etc. in `data/availability.json` today are **preview samples only** until the first live sync.

## Excel layout (each workbook)

- **One worksheet tab per day** of the month (`1`, `May 1`, `5/1/26`, etc.).
- **Column B:** wave time (e.g. `8:00 AM`). The same wave time can appear on **multiple rows** — each row is one allotment.
- **Column C:** booking detail — **empty = open allotment**, **any text = booked allotment**.

For each wave time, the site counts rows with that time in column B, then subtracts rows that have text in column C. Example: four `8:00 AM` rows and one booked → **3 OPEN** at 8:00 AM.

Optional header row with “Wave Time” in column B is skipped automatically.

## Office Script

Copy [`scripts/office-script-get-wave-availability.ts`](../scripts/office-script-get-wave-availability.ts) into each workbook’s **Automate → Script Library** (same pattern as ticket counts).

Run with parameters:

| Parameter | Example | Meaning |
|-----------|---------|---------|
| `monthYear` | `2026-05` | Month this workbook represents |
| `officeId` | `office48` or `office46` | Which office |

Script returns JSON:

```json
{
  "officeId": "office48",
  "month": "2026-05",
  "days": [
    {
      "day": 1,
      "date": "2026-05-01",
      "sheetName": "1",
      "openCount": 8,
      "totalCount": 10,
      "slots": [
        { "time": "8:00 AM", "open": true, "spotsOpen": 3, "totalSpots": 4, "detail": null },
        { "time": "9:30 AM", "open": false, "spotsOpen": 0, "totalSpots": 2, "detail": "FULL" }
      ]
    }
  ]
}
```

## Power Automate flow (recommended)

Mirror the **live ticket counts** flow, but run the script **twice per sync** — once per office workbook:

1. **Recurrence** — e.g. every 5–15 minutes during business hours.
2. **Office 48 workbook** — Excel Online → **Run script** (`office-script-get-wave-availability.ts`) with `monthYear` = `2026-05`, `officeId` = `office48`.
3. **Office 46 workbook** — same script with `officeId` = `office46` (and that file’s month if different).
4. **Compose** — build one payload with both results:

```json
{
  "updatedAt": "@{utcNow()}",
  "updates": [
    @{body('Run_script_Office48')},
    @{body('Run_script_Office46')}
  ]
}
```

5. **GitHub** — **Repository dispatch** (or HTTP POST to GitHub API):
   - Event type: `update-availability`
   - Client payload: output of Compose

GitHub Actions workflow [`.github/workflows/update-availability-from-dispatch.yml`](../.github/workflows/update-availability-from-dispatch.yml) merges the payload into `data/availability.json` and pushes to `main`. The site picks it up on **Refresh** (or after cache expires).

### Repository dispatch example

```http
POST /repos/shahabibii/HUA-BOOKINGS/dispatches
{
  "event_type": "update-availability",
  "client_payload": {
    "updatedAt": "2026-05-30T12:00:00Z",
    "updates": [ ...office48..., ...office46... ]
  }
}
```

## Adding a new month

1. Create or duplicate the two SharePoint workbooks for the new month.
2. Add entries to `data/availability-sources.json` (new `month`, `displayName`, `sharePointFileId`, `sharePointUrl`).
3. Point Power Automate at the new file IDs (or use a variable driven by the config).
4. First successful sync fills `data/availability.json`; the month appears in the site dropdown.

## Site files

| File | Role |
|------|------|
| `data/availability-sources.json` | Where SharePoint files are registered (you update monthly) |
| `data/availability.json` | Live data the page reads |
| `availability/availability.js` | Calendar UI + refresh |
| `availability/availability.css` | Dashboard styling |
| `scripts/write-availability-json.js` | GitHub Action merge step |

## Verify locally

```bash
python3 -m http.server 8766
```

Open http://localhost:8766/availability/ — you should see May 2026 sample data for Office 48 until Power Automate replaces it with live SharePoint data.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Month missing in dropdown | No data for that office/month in `availability.json` yet — run the flow or check script output |
| Day shows “No data” | Tab name not recognized as a day, or sheet has no rows in column B |
| All slots full | Column C may have spaces — script trims; truly empty cells = open |
| Stale counts | Click **Refresh**; confirm Power Automate recurrence and GitHub push succeeded |

See also [`SHAREPOINT-SETUP.md`](SHAREPOINT-SETUP.md) for the ticket-count flow pattern.

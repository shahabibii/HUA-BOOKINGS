# Hosted event flyers

Drop PDF flyers here (optionally in **month folders**). The site reads every PDF automatically — you never edit a file list by hand.

## Add flyers for a month

1. Create or open a month folder, for example `flyers/june/` or `flyers/may/`.
2. Copy all PDFs for that month into the folder.
3. Name each file with **month.day** and the **event name** (year is optional):

| File name | Calendar |
|-----------|----------|
| `06.01 Spring Gala.pdf` | June 1 — Spring Gala |
| `6.01 Spring Gala.pdf` | same |
| `6.1-Spring Gala.pdf` | same |
| `06.15 Summer Concert.pdf` | June 15 — Summer Concert |

4. Commit and push to GitHub.

When you push, a GitHub Action scans this folder and updates `data/flyers.json` for you. After Pages deploys (~1 minute), everyone sees the events — no upload needed.

### Folder layout example

```
flyers/
  may/
    05.12 Spring Gala.pdf
    5.20 Pool Party.pdf
  june/
    06.01 Summer Kickoff.pdf
    6.15 Jazz Night.pdf
```

The month folder is only for your organization. The **date on the calendar comes from the file name**, not the folder name.

## Update locally (optional)

If you want to refresh the manifest before pushing:

```bash
npm run update-flyers
```

Or:

```bash
node scripts/generate-flyers-manifest.js
```

## Notes

- Only `.pdf` files are included. `README.md` and other files are ignored.
- Month/day without a year uses the current calendar year (or next year if the date is far in the past).
- Hyphens, dots, spaces, and underscores in titles are all fine.
- Hosted flyers take priority over the same date + title uploaded locally in one browser.

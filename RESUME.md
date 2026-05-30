# HUA BOOKINGS — resume here

Use this file when you reopen the project in Cursor and want to pick up where you left off.

## Links

| What | URL |
|------|-----|
| **Live site (HOME)** | https://shahabibii.github.io/HUA-BOOKINGS/ |
| **HUA calendar** | https://shahabibii.github.io/HUA-BOOKINGS/hua/ |
| **Avalibility** | https://shahabibii.github.io/HUA-BOOKINGS/availability/ |
| **Reporting** | https://shahabibii.github.io/HUA-BOOKINGS/reporting/ |
| **GitHub repo** | https://github.com/shahabibii/HUA-BOOKINGS |
| **SharePoint site** | https://hgvc.sharepoint.com/sites/HGVOrlInHouseMarketing |

## Open locally

```bash
cd "/Users/shahabmanafi/Desktop/Cursor Projects/HUA-BOOKINGS"
git pull origin main
python3 -m http.server 8766
```

Then open http://localhost:8766/ (trailing slash matters for asset paths).

## Site structure (as of May 2026)

| Page | Path | Status |
|------|------|--------|
| **HOME** | `/` (`index.html`) | Cinematic landing — film grain, animated ONYX logo; logo click → HUA |
| **HUA** | `/hua/` | Full dashboard: calendar, email buttons, flyers, live tickets |
| **AVALIBILITY** | `/availability/` | Placeholder (“coming soon”) |
| **REPORTING** | `/reporting/` | Placeholder (“coming soon”) |

**Menu** (top-left crystalline button): HOME, HUA, AVALIBILITY, REPORTING — shared via `menu.js` on every page.

**Footer** (all pages): shared via `footer.js` — copyright + builder credit; uses site theme (`var(--bg)`, white/muted text).

## What’s working now

- **HOME landing** — `index.html`, `home.css`, `home.js` (logo shimmer, float, pulse)
- **HUA calendar** — moved to `hua/index.html`; `app.js` uses `resolveSiteBase()` for assets from nested routes
- **Six email action buttons** — BOOK HUA, HUA CONFIRM, TOUR CONFIRM, 1ST ATTEMPT, OWN INVITE, NON OWN INVITE
- **Rich HTML email templates** — `assets/email-templates/<slug>/`
- **Live ticket counts** — `data/tickets.json` (mint “avail” on day cells; 5 min refresh)
- **Hosted flyers** — `flyers/` + `data/flyers.json`
- **BOOK HUA** — Outlook Web / Desktop .eml / download .eml; **To** from `data/booking-recipients.json`
- **Power Automate** → GitHub Actions → `data/tickets.json`
- **Compact calendar cells** — tighter day boxes, single-line email button labels
- **Event Data / Arrivals tabs** — still hidden in UI (commented in `hua/index.html`)

## Key files

| Path | Purpose |
|------|---------|
| `index.html` | HOME landing page |
| `hua/index.html` | HUA calendar dashboard |
| `home.css` / `home.js` | HOME page styles and logo animation |
| `menu.js` | Site menu dropdown + nav links |
| `footer.js` | Shared footer on all pages |
| `app.js` | Calendar, flyers, tickets, email actions |
| `styles.css` | Global styles (dashboard, menu, footer, buttons) |
| `data/email-actions.json` | Email button labels, subjects, template kinds |
| `data/booking-recipients.json` | BOOK HUA **To** prefills |
| `data/tickets.json` | Live ticket counts (PA + Actions) |
| `data/flyers.json` | Hosted flyer manifest |

## Cache busting

After CSS/JS changes, bump `?v=` query strings in HTML files (currently `20260531r` on most pages).

## Common next steps

- [ ] Build out **AVALIBILITY** page
- [ ] Build out **REPORTING** page
- [ ] Add July+ months to Power Automate flow
- [ ] Rotate GitHub PAT before expiry
- [ ] Push new flyers under `flyers/Month YYYY/` and push to `main`

## Deploy

GitHub Pages on **main**. Push → rebuild in ~1–2 min. Hard refresh (`Cmd+Shift+R`) after deploy.

## Last known good state

- Branch: **main**, synced with **origin/main**
- Latest feature commit: **REPORTING** menu item + placeholder page
- All work committed and pushed — safe to close Cursor

*Update this file when you make major changes.*

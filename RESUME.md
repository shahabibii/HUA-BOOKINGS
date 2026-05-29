# HUA BOOKINGS — resume here

Use this file when you reopen the project in Cursor (or any editor) and want to pick up where you left off.

## Links

| What | URL |
|------|-----|
| **Live site** | https://shahabibii.github.io/HUA-BOOKINGS/ |
| **GitHub repo** | https://github.com/shahabibii/HUA-BOOKINGS |
| **SharePoint site** | https://hgvc.sharepoint.com/sites/HGVOrlInHouseMarketing |

## Open locally

```bash
cd "/Users/shahabmanafi/Desktop/Cursor Projects/HUA-BOOKINGS"
git pull origin main
python3 -m http.server 8766
```

Then open http://localhost:8766/ (trailing slash matters for asset paths).

## What’s working now

- **Calendar** — hosted PDF flyers from `flyers/` (May/June 2026 folders, etc.)
- **Live ticket counts** — `data/tickets.json` (mint text at bottom of day cells; refreshes every 5 min on the site)
- **BOOK HUA** — chooser: Outlook Web (paste template), Outlook Desktop (.eml), or download .eml only; **To/Cc** from `data/booking-recipients.json`
- **Power Automate** — reads May/June guestlist Excel (read-only Office Script) → POST `repository_dispatch` → GitHub Action writes `data/tickets.json`
- **Event Data / Arrivals tabs** — hidden in UI (commented out in `index.html`); panels + logic still in repo

## Key files

| Path | Purpose |
|------|---------|
| `app.js` | Calendar, flyers, tickets, BOOK HUA |
| `data/booking-recipients.json` | Prefill **To** / **Cc** on BOOK HUA emails |
| `data/tickets.json` | Live counts (updated by PA + Actions) |
| `data/flyers.json` | Hosted flyer manifest (auto-updated on push to `flyers/`) |
| `scripts/office-script-get-ticket-events.ts` | Source for SharePoint Office Script |
| `.github/workflows/update-tickets-from-dispatch.yml` | Writes tickets.json from Power Automate |
| `SHAREPOINT-SETUP.md` | Azure/PA notes (optional Azure path not used on site) |

## BOOK HUA — To / Cc prefills

Edit `data/booking-recipients.json`:

```json
{
  "to": ["reservations@yourcompany.com"],
  "cc": ["manager@yourcompany.com"]
}
```

- **Desktop & .eml:** To and Cc headers are set on the message (most reliable).
- **Outlook Web:** `to` and `cc` are passed on the compose deeplink; CC is not supported on all tenants — use Desktop or `.eml` if CC does not appear.

## Power Automate (HUA BOOKINGS flow)

1. Recurrence (recommended: every 15–30 min) or manual run  
2. May + June: Run script → Parse JSON → Apply to each → Append to `events` variable  
3. **Build tickets JSON** — `updatedAt` + `variables('events')` (not June-only output)  
4. **HTTP POST** `https://api.github.com/repos/shahabibii/HUA-BOOKINGS/dispatches`  
   - Body: `event_type`: `update-tickets`, `client_payload`: output of Build tickets JSON  
   - Headers: `Authorization` Bearer token, `Accept`, `X-GitHub-Api-Version`, `Content-Type`  
   - Success = **204**  
5. Check **GitHub → Actions** → “Update tickets from Power Automate”

**Token:** classic PAT with **`repo`** scope on account `shahabibii`. Renew before expiry.

## Restore hidden UI

In `index.html`, uncomment the block labeled `Restore Event Data / Arrivals`.

## Canceled events

Edit `data/canceled-events.json` to hide an event from the calendar and ticket counts (even if SharePoint still has a tab). Move its PDF to `flyers/_canceled/` if it should not appear on the calendar.

## Common next steps

- [ ] Add **Recurrence** trigger on Power Automate if not already set  
- [ ] Add July+ months (copy June block in flow)  
- [ ] Rotate GitHub PAT before expiry  
- [ ] Push new flyers: add PDFs under `flyers/Month YYYY/` and push to `main` (manifest workflow runs automatically)

## Deploy

Site is **GitHub Pages** on `main`. Push to `main` → Pages rebuilds in ~1–2 minutes. Hard refresh (`Cmd+Shift+R`) after deploy.

## Last known good state

- Branch: `main`, synced with `origin/main`  
- Ticket sync via `repository_dispatch` + Actions (not direct HTTP PUT to contents API)  
- Import tabs hidden; dashboard + BOOK HUA visible  

*Update this file when you make major changes.*

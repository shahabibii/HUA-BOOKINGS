# Wave Availability — paused (resume here)

**Paused:** company network down (SharePoint / Power Automate / Excel Online unavailable).

**When network is back, tell Cursor:**

> Resume Wave Availability — fix the Build availability JSON step in Power Automate flow **Wave Avalibility**, test the flow, and verify the site shows June data.

---

## Done so far

| Item | Status |
|------|--------|
| Availability dashboard page | Live at `/availability/` (reads `data/availability.json`) |
| Office Script in both June workbooks | Done — scripts run successfully in Excel |
| GitHub Actions workflow | `update-availability` dispatch → `data/availability.json` |
| Power Automate flow **Wave Avalibility** | Started, not finished |

## Power Automate flow (current state)

Flow name: **`Wave Avalibility`**

Steps built:

1. **Recurrence** (schedule trigger)
2. **Run Script Office 48 - June 2026** — June Office 48 workbook  
   - `monthYear` = `2026-06`  
   - `officeId` = `office48`
3. **Run Script Office 46 - June 2026** — June Office 46 workbook  
   - `monthYear` = `2026-06`  
   - `officeId` = `office46`
4. **Build availability JSON** (Compose) — **BROKEN: needs fix** (invalid reference to old step name `Run_script_Office_48`)
5. **GitHub dispatch body** (Compose) — expression wraps payload for GitHub
6. **GitHub dispatch availability** (HTTP POST) — headers set; Body uses expression

## Resume at this step (in order)

### 1. Fix **Build availability JSON**

Open the Compose step → delete Inputs → rebuild with **Dynamic content** (not typed step names):

```json
{
  "updatedAt": "<utcNow()>",
  "updates": [
    <Result from Run Script Office 48 - June 2026>,
    <Result from Run Script Office 46 - June 2026>
  ]
}
```

Optional: rename script steps to `Run script Office 48` / `Run script Office 46` (simpler names), then re-pick dynamic content.

If test fails because script output is a text string, add **Parse JSON** after each Run script step and reference those instead.

### 2. Confirm **GitHub dispatch body** Compose

Expression (adjust step name if needed):

```
json(concat('{"event_type":"update-availability","client_payload":', string(outputs('Build_availability_JSON')), '}'))
```

### 3. Confirm **GitHub dispatch availability** HTTP

| Field | Value |
|--------|--------|
| Method | `POST` |
| URI | `https://api.github.com/repos/shahabibii/HUA-BOOKINGS/dispatches` |

Headers (4 separate rows):

| Key | Value |
|-----|--------|
| `Authorization` | `Bearer <GitHub PAT with repo scope>` |
| `Accept` | `application/vnd.github+json` |
| `X-GitHub-Api-Version` | `2022-11-28` |
| `Content-Type` | `application/json` |

Body (Expression):

```
outputs('GitHub_dispatch_body')
```

Or put the `json(concat(...))` expression directly in Body if the extra Compose step was removed.

**Do not** embed a dynamic chip inside `{ "client_payload": ... }` — PA shows “Enter a valid JSON”.

### 4. Save → Test → Verify

1. Save flow → Test → Run
2. Both Run script steps green — Outputs show `"month":"2026-06"` and `"days":[...]`
3. HTTP step returns **204**
4. GitHub → **Actions** → **Update availability from Power Automate** → green
5. GitHub → `data/availability.json` updated
6. Site: https://shahabibii.github.io/HUA-BOOKINGS/availability/ (hard refresh Cmd+Shift+R)

## Script parameters (June workbooks)

| Parameter | Office 48 | Office 46 |
|-----------|-----------|-----------|
| `monthYear` | `2026-06` | `2026-06` |
| `officeId` | `office48` | `office46` |

`monthYear` must match the workbook month. Wave times come from column B; open/booked from column C (empty = open).

## GitHub / repo reference

| Item | Value |
|------|--------|
| Dispatch event type | `update-availability` |
| Workflow | `.github/workflows/update-availability-from-dispatch.yml` |
| Merge script | `scripts/write-availability-json.js` |
| Office Script source | `scripts/office-script-get-wave-availability.ts` |
| Full setup guide | `AVAILABILITY-SETUP.md` |
| SharePoint file registry | `data/availability-sources.json` (May IDs listed; flow uses June files in PA) |

Same GitHub PAT pattern as the working **ticket counts** flow (`update-tickets`).

## Security note

If a GitHub PAT was pasted into Power Automate screenshots or chat, **revoke and create a new token** before going live.

---

*Last updated: paused mid–Power Automate setup, June 2026 workbooks.*

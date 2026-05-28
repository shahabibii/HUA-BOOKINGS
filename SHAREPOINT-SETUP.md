# SharePoint live tickets — one-time setup

The calendar reads event names and **Tickets Available** counts from two SharePoint Excel workbooks via **Microsoft Graph**. Each agent signs in with their normal HGV Microsoft work account.

## 1. Register an Azure AD app

1. Open [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps).
2. **New registration**
   - Name: `HUA Bookings Calendar`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI: **Single-page application (SPA)** and add:
     - `https://shahabibii.github.io/HUA-BOOKINGS/`
     - `http://localhost:8766/` (local testing)
3. After creation, copy:
   - **Application (client) ID**
   - **Directory (tenant) ID**

## 2. API permissions

1. App → **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**
2. Add:
   - `Files.Read`
   - `User.Read`
3. Click **Grant admin consent for [your org]** if your tenant requires it.

## 3. Configure the site

Edit [`sharepoint-config.js`](sharepoint-config.js):

```javascript
clientId: "paste-application-client-id",
tenantId: "paste-directory-tenant-id",
```

Workbook drive item IDs are already set for May and June. Commit and push to GitHub Pages.

## 4. Excel workbook layout

Each **worksheet tab** should be named with the event name and date, for example:

`Spring Gala 5/12/26`

The calendar shows **Spring Gala** on May 12 (date parsed from the tab name).

On each tab, a cell must contain **Tickets Available** (or **Tickets Avalible**). The **number in the cell immediately to the left** on the same row is shown on the calendar.

## 5. Verify

1. Run locally: `python3 -m http.server 8766`
2. Open `http://localhost:8766`
3. Click **Sign in with Microsoft** → allow permissions
4. Events and ticket counts should appear on the calendar
5. Change a count in SharePoint → click **Refresh tickets** or wait ~3 minutes

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Sign-in popup blocked | Allow popups for the site |
| `AADSTS50011` redirect mismatch | Add exact URL (with trailing slash) to SPA redirect URIs |
| Access denied to workbook | User needs SharePoint access to the marketing site files |
| Tab not on calendar | Tab name must end with `M/D/YY` or `M/D/YYYY` |
| No ticket count | Ensure label is **Tickets Available** with the number one cell to the left |

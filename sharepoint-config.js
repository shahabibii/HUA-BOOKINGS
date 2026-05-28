/**
 * SharePoint / Microsoft Graph configuration for live ticket workbooks.
 * Fill in clientId and tenantId after Azure app registration (see SHAREPOINT-SETUP.md).
 */
window.HUA_SHAREPOINT_CONFIG = {
  /** Azure AD Application (client) ID */
  clientId: "YOUR_CLIENT_ID_HERE",

  /** Azure AD Directory (tenant) ID — HGV org */
  tenantId: "YOUR_TENANT_ID_HERE",

  /** SharePoint site path (hostname + site path) */
  siteHost: "hgvc.sharepoint.com",
  sitePath: "/sites/HGVOrlInHouseMarketing",

  /** Excel workbooks on SharePoint (drive item IDs from sharing links) */
  workbooks: [
    { id: "may-2026", label: "May", driveItemId: "3a427fe6-d2ab-4ca7-9187-5919eb4a27c0" },
    { id: "june-2026", label: "June", driveItemId: "38a09038-a8e0-4de0-9cd3-4adcabec3c2c" },
  ],

  /** Microsoft Graph delegated scopes */
  scopes: ["Files.Read", "User.Read"],

  /** Auto-refresh interval while dashboard is open (milliseconds) */
  pollIntervalMs: 3 * 60 * 1000,

  /** Low-ticket warning threshold for calendar badge styling */
  lowTicketThreshold: 10,
};

(function (global) {
  "use strict";

  const config = global.HUA_SHAREPOINT_CONFIG || {};
  const GRAPH = "https://graph.microsoft.com/v1.0";

  let msalInstance = null;
  let siteId = null;
  let sharepointEvents = [];
  let syncStatus = {
    state: "idle",
    message: "",
    lastUpdated: null,
    signedIn: false,
    userName: "",
  };
  let pollTimer = null;
  const updateCallbacks = [];

  const TICKET_LABELS = ["tickets available", "tickets avalible"];

  function isConfigured() {
    return Boolean(
      config.clientId &&
        config.tenantId &&
        config.clientId !== "YOUR_CLIENT_ID_HERE" &&
        config.tenantId !== "YOUR_TENANT_ID_HERE"
    );
  }

  function redirectUri() {
    const href = global.location.href.split("#")[0].split("?")[0];
    return href.endsWith("/") ? href : href + "/";
  }

  function setStatus(partial) {
    syncStatus = { ...syncStatus, ...partial };
    updateCallbacks.forEach((cb) => {
      try {
        cb(sharepointEvents.slice(), { ...syncStatus });
      } catch (err) {
        console.warn("SharePoint tickets callback error:", err);
      }
    });
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toISODate(y, m, d) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  /** Parse tab name like "Spring Gala 5/12/26" → { title, date } */
  function parseSheetTabName(sheetName) {
    const trimmed = String(sheetName || "").trim();
    const match = trimmed.match(/^(.+?)\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!match) return null;
    const title = match[1].trim();
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    let year = parseInt(match[4], 10);
    if (year < 100) year += 2000;
    if (!title || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { title, date: toISODate(year, month, day) };
  }

  function cellText(value) {
    if (value == null) return "";
    return String(value).trim();
  }

  function parseTicketCount(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    const s = String(value).replace(/,/g, "").trim();
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }

  /** Find "Tickets Available" label and read number from cell to the left. */
  function extractTicketsFromGrid(values) {
    if (!values || !values.length) return null;
    for (const row of values) {
      if (!row || !row.length) continue;
      for (let c = 0; c < row.length; c++) {
        const text = cellText(row[c]).toLowerCase();
        if (!TICKET_LABELS.some((label) => text.includes(label))) continue;
        if (c === 0) return null;
        return parseTicketCount(row[c - 1]);
      }
    }
    return null;
  }

  function odataEscapeSheetName(name) {
    return String(name).replace(/'/g, "''");
  }

  async function getMsal() {
    if (!global.msal) {
      throw new Error("Microsoft authentication library failed to load.");
    }
    if (!msalInstance) {
      msalInstance = new global.msal.PublicClientApplication({
        auth: {
          clientId: config.clientId,
          authority: `https://login.microsoftonline.com/${config.tenantId}`,
          redirectUri: redirectUri(),
        },
        cache: {
          cacheLocation: "sessionStorage",
          storeAuthStateInCookie: false,
        },
      });
      await msalInstance.initialize();
      const response = await msalInstance.handleRedirectPromise();
      if (response && response.account) {
        msalInstance.setActiveAccount(response.account);
      }
    }
    return msalInstance;
  }

  async function acquireToken(scopes) {
    const msal = await getMsal();
    const account = msal.getActiveAccount() || msal.getAllAccounts()[0];
    if (!account) throw new Error("Not signed in");
    try {
      const silent = await msal.acquireTokenSilent({ scopes, account });
      return silent.accessToken;
    } catch {
      const popup = await msal.acquireTokenPopup({ scopes, account });
      return popup.accessToken;
    }
  }

  async function graphGet(path, token) {
    const res = await fetch(`${GRAPH}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Graph ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  async function resolveSiteId(token) {
    if (siteId) return siteId;
    const host = config.siteHost || "hgvc.sharepoint.com";
    const path = config.sitePath || "/sites/HGVOrlInHouseMarketing";
    const data = await graphGet(`/sites/${host}:${path}`, token);
    siteId = data.id;
    return siteId;
  }

  async function fetchWorksheetTickets(token, resolvedSiteId, driveItemId, sheetName) {
    const escaped = odataEscapeSheetName(sheetName);
    const path = `/sites/${resolvedSiteId}/drive/items/${driveItemId}/workbook/worksheets('${escaped}')/usedRange`;
    const data = await graphGet(path, token);
    return extractTicketsFromGrid(data.values);
  }

  async function fetchWorkbookEvents(token, resolvedSiteId, workbook) {
    const listPath = `/sites/${resolvedSiteId}/drive/items/${workbook.driveItemId}/workbook/worksheets`;
    const list = await graphGet(listPath, token);
    const sheets = list.value || [];
    const results = [];

    for (const sheet of sheets) {
      const parsed = parseSheetTabName(sheet.name);
      if (!parsed) continue;
      let ticketsAvailable = null;
      try {
        ticketsAvailable = await fetchWorksheetTickets(
          token,
          resolvedSiteId,
          workbook.driveItemId,
          sheet.name
        );
      } catch (err) {
        console.warn(`Tickets read failed for sheet "${sheet.name}":`, err);
      }
      results.push({
        id: `${workbook.id}-${parsed.date}-${parsed.title.replace(/\s+/g, "-").slice(0, 40)}`,
        date: parsed.date,
        title: parsed.title,
        ticketsAvailable,
        sheetName: sheet.name,
        workbookId: workbook.id,
        updatedAt: new Date().toISOString(),
      });
    }
    return results;
  }

  async function refreshSharePointEvents() {
    if (!isConfigured()) {
      setStatus({
        state: "unconfigured",
        message: "Add Azure client ID and tenant ID in sharepoint-config.js (see SHAREPOINT-SETUP.md).",
      });
      return sharepointEvents;
    }

    setStatus({ state: "loading", message: "Loading tickets from SharePoint…" });

    try {
      const scopes = config.scopes || ["Files.Read", "User.Read"];
      const token = await acquireToken(scopes);
      const resolvedSiteId = await resolveSiteId(token);
      const workbooks = config.workbooks || [];
      const all = [];

      for (const wb of workbooks) {
        const items = await fetchWorkbookEvents(token, resolvedSiteId, wb);
        all.push(...items);
      }

      sharepointEvents = all.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
      setStatus({
        state: "ok",
        message: `${sharepointEvents.length} event${sharepointEvents.length === 1 ? "" : "s"} loaded`,
        lastUpdated: new Date(),
        signedIn: true,
      });
      return sharepointEvents;
    } catch (err) {
      console.warn("SharePoint refresh failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({
        state: "error",
        message: msg.includes("Not signed in") ? "Sign in to load live tickets." : msg,
      });
      throw err;
    }
  }

  async function signIn() {
    if (!isConfigured()) {
      setStatus({
        state: "unconfigured",
        message: "Configure sharepoint-config.js first (see SHAREPOINT-SETUP.md).",
      });
      return false;
    }

    const msal = await getMsal();
    const scopes = config.scopes || ["Files.Read", "User.Read"];

    let account = msal.getActiveAccount() || msal.getAllAccounts()[0];
    if (!account) {
      setStatus({ state: "loading", message: "Signing in…" });
      const result = await msal.loginPopup({ scopes });
      account = result.account;
      if (account) msal.setActiveAccount(account);
    }

    if (account) {
      setStatus({
        signedIn: true,
        userName: account.name || account.username || "",
      });
    }

    await refreshSharePointEvents();
    return true;
  }

  async function signOut() {
    stopPolling();
    if (msalInstance) {
      const account = msalInstance.getActiveAccount();
      if (account) {
        await msalInstance.logoutPopup({ account });
      }
    }
    sharepointEvents = [];
    siteId = null;
    setStatus({
      state: "idle",
      message: "Signed out",
      lastUpdated: null,
      signedIn: false,
      userName: "",
    });
  }

  async function trySilentSignInAndRefresh() {
    if (!isConfigured()) return;
    try {
      const msal = await getMsal();
      const account = msal.getActiveAccount() || msal.getAllAccounts()[0];
      if (!account) return;
      msal.setActiveAccount(account);
      setStatus({ signedIn: true, userName: account.name || account.username || "" });
      await refreshSharePointEvents();
    } catch {
      /* user can click Sign in */
    }
  }

  function startPolling() {
    stopPolling();
    const interval = config.pollIntervalMs || 180000;
    pollTimer = global.setInterval(() => {
      if (document.hidden) return;
      refreshSharePointEvents().catch(() => {});
    }, interval);
  }

  function stopPolling() {
    if (pollTimer) {
      global.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function onUpdate(callback) {
    if (typeof callback === "function") updateCallbacks.push(callback);
  }

  function getEvents() {
    return sharepointEvents.slice();
  }

  function getSyncStatus() {
    return { ...syncStatus };
  }

  function init() {
    if (!isConfigured()) {
      setStatus({
        state: "unconfigured",
        message: "SharePoint tickets: configure Azure app in sharepoint-config.js",
      });
      return;
    }
    trySilentSignInAndRefresh().finally(() => startPolling());
  }

  global.HuaSharePointTickets = {
    init,
    signIn,
    signOut,
    refresh: refreshSharePointEvents,
    getEvents,
    getSyncStatus,
    onUpdate,
    isConfigured,
    startPolling,
    stopPolling,
  };
})(window);

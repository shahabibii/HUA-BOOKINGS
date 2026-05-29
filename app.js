(function () {
  "use strict";

  /** Remove legacy arrivals table if cached HTML still includes it */
  function removeLegacyArrivalsPanel() {
    document.querySelectorAll("aside.side, .side").forEach((el) => el.remove());
  }
  removeLegacyArrivalsPanel();

  const STORAGE_EVENTS = "hua_bookings_events_v1";
  const STORAGE_ARRIVALS = "hua_bookings_arrivals_v1";

  /** Reservation types to include (column RESV_TYPE). All other rows are skipped. */
  const ALLOWED_RESV_TYPES = new Set([
    "FIX",
    "CLB",
    "FCC",
    "HGD",
    "MAX",
    "DRM",
    "DFC",
    "OW",
    "OWU",
    "DXT",
    "OPD",
    "DXP",
    "MGV",
  ]);

  /** @type {{ id: string, date: string, title: string, fileName: string, source?: string, hostedFile?: string }[]} */
  let localEvents = loadJson(STORAGE_EVENTS, []);
  /** @type {typeof localEvents} */
  let hostedEvents = [];
  /** Merged hosted + local (hosted wins when date + title match). */
  let events = [];
  /** @type {{ date: string, title: string, ticketsAvailable: number | null, sheetName?: string, workbook?: string }[]} */
  let ticketEvents = [];
  /** eventKey → ticketsAvailable */
  const ticketByKey = new Map();
  /** @type {string | null} ISO timestamp from tickets.json */
  let ticketsUpdatedAt = null;
  /** @type {{ leadId: string, guest: string, property: string, arrivalDate: string, nights: number, resvType: string }[]} */
  let arrivals = loadJson(STORAGE_ARRIVALS, []);

  let viewDate = startOfMonth(new Date());
  /** @type {string | null} YYYY-MM-DD when filtering by clicked day */
  let selectedDay = null;
  /** @type {string | null} event id when user clicked a day with event */
  let selectedEventId = null;

  /** @type {string[]} object URLs for PDF iframes; revoke when refreshing */
  let previewObjectUrls = [];

  const PDF_DB_NAME = "hua_bookings_pdfs_v1";
  const PDF_STORE = "pdfs";
  const HOSTED_FLYERS_MANIFEST = "data/flyers.json";
  const HOSTED_FLYERS_BASE = "flyers/";
  const FLYERS_CACHE_BUST = "20260531e";
  const TICKETS_MANIFEST = "data/tickets.json";
  const TICKETS_CACHE_BUST = "20260529b";
  const TICKETS_REFRESH_MS = 5 * 60 * 1000;
  const LOW_TICKET_THRESHOLD = 10;

  /** Resolve a site-relative path (works with or without trailing slash on GitHub Pages). */
  function assetUrl(relativePath) {
    return new URL(relativePath, window.location.href).href;
  }

  /** Encode folder/file names for URLs (apostrophes, ampersands, spaces, etc.). */
  function encodePathSegment(segment) {
    return encodeURIComponent(segment).replace(/[!'()*]/g, (ch) =>
      "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")
    );
  }

  function hostedFlyerUrl(hostedFile) {
    const encoded = hostedFile.split("/").map(encodePathSegment).join("/");
    return assetUrl(`${HOSTED_FLYERS_BASE}${encoded}`);
  }

  function openPdfDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(PDF_DB_NAME, 1);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(PDF_STORE);
      };
      req.onsuccess = () => resolve(req.result);
    });
  }

  function putPdfBlob(id, blob) {
    return openPdfDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(PDF_STORE, "readwrite");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore(PDF_STORE).put(blob, id);
        })
    );
  }

  function getPdfBlob(id) {
    return openPdfDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(PDF_STORE, "readonly");
          const r = tx.objectStore(PDF_STORE).get(id);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        })
    );
  }

  function clearAllPdfBlobs() {
    return openPdfDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(PDF_STORE, "readwrite");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore(PDF_STORE).clear();
        })
    );
  }

  async function ensurePdfBlob(ev) {
    let blob;
    try {
      blob = await getPdfBlob(ev.id);
    } catch {
      blob = undefined;
    }
    if (blob && blob.size) return blob;

    if (ev.hostedFile) {
      try {
        const url = hostedFlyerUrl(ev.hostedFile);
        const res = await fetch(url);
        if (res.ok) {
          blob = await res.blob();
          if (blob && blob.size) {
            try {
              await putPdfBlob(ev.id, blob);
            } catch (cacheErr) {
              console.warn("PDF preview cache skipped:", ev.hostedFile, cacheErr);
            }
            return blob;
          }
        } else {
          console.warn("Hosted flyer fetch failed:", res.status, ev.hostedFile, url);
        }
      } catch (err) {
        console.warn("Could not fetch hosted flyer:", ev.hostedFile, err);
      }
    }
    return null;
  }

  async function downloadEventPdf(ev) {
    const blob = await ensurePdfBlob(ev);
    if (!blob || !blob.size) {
      alert(
        ev.source === "hosted"
          ? "PDF file is not available. Check that the flyer exists in the site repository."
          : "PDF file is not available. Re-upload this flyer under Event Data."
      );
      return;
    }
    const name = ev.fileName && /\.pdf$/i.test(ev.fileName) ? ev.fileName : `${ev.title || "flyer"}.pdf`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function revokePreviewUrls() {
    previewObjectUrls.forEach((u) => URL.revokeObjectURL(u));
    previewObjectUrls = [];
  }

  const monthLabel = document.getElementById("month-label");
  const grid = document.getElementById("calendar-grid");
  const pdfList = document.getElementById("pdf-list");
  const csvStatus = document.getElementById("csv-status");
  const mainDashboard = document.getElementById("main-dashboard");

  const HUA_BOOKING_SUBJECT = "HUA BOOKING";

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : fallback;
    } catch {
      return fallback;
    }
  }

  function saveEvents() {
    localStorage.setItem(STORAGE_EVENTS, JSON.stringify(localEvents));
    rebuildEvents();
  }

  function eventKey(ev) {
    return `${ev.date}|${String(ev.title || "")
      .trim()
      .toLowerCase()}`;
  }

  function rebuildEvents() {
    const map = new Map();
    for (const e of hostedEvents) map.set(eventKey(e), e);
    for (const e of localEvents) {
      if (!map.has(eventKey(e))) {
        map.set(eventKey(e), { ...e, source: e.source || "local" });
      }
    }
    events = [...map.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
    );
  }

  function inferEventYear(month, day, ref = new Date()) {
    const y = ref.getFullYear();
    const today = new Date(y, ref.getMonth(), ref.getDate());
    const eventDay = new Date(y, month - 1, day);
    if (eventDay < today && today - eventDay > 30 * 86400000) return y + 1;
    return y;
  }

  function normalizeEventTitle(raw) {
    return (
      String(raw || "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "Event"
    );
  }

  function validDateParts(y, mo, da) {
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || da < 1 || da > 31) return false;
    const d = new Date(y, mo - 1, da);
    return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === da;
  }

  function normalizeForMatch(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  /** True when flyer title and ticket row refer to the same event (word overlap). */
  function titlesRoughlyMatch(want, got) {
    if (!want || !got) return false;
    if (got === want || got.includes(want) || want.includes(got)) return true;
    const wantTokens = want.split(/\s+/).filter(Boolean);
    const gotTokens = got.split(/\s+/).filter(Boolean);
    const [shorter, longer] =
      wantTokens.length <= gotTokens.length
        ? [wantTokens, gotTokens]
        : [gotTokens, wantTokens];
    const longSet = new Set(longer);
    return shorter.every((t) => longSet.has(t));
  }

  function rebuildTicketIndex() {
    ticketByKey.clear();
    for (const t of ticketEvents) {
      if (!t.date || t.ticketsAvailable == null) continue;
      ticketByKey.set(eventKey(t), t.ticketsAvailable);
    }
  }

  /** Match ticket row to a calendar event (date + title, with fuzzy fallback). */
  function ticketsAvailableForEvent(ev) {
    const exact = ticketByKey.get(eventKey(ev));
    if (exact != null) return exact;

    const want = normalizeForMatch(ev.title);
    if (!want) return null;

    const sameDay = ticketEvents.filter((t) => t.date === ev.date && t.ticketsAvailable != null);
    for (const t of sameDay) {
      const got = normalizeForMatch(t.title);
      if (titlesRoughlyMatch(want, got)) {
        return t.ticketsAvailable;
      }
    }

    if (sameDay.length === 1) {
      const dayFlyers = events.filter((e) => e.date === ev.date);
      if (dayFlyers.length === 1) return sameDay[0].ticketsAvailable;
    }
    return null;
  }

  async function loadLiveTickets(options = {}) {
    try {
      const bust = options.cacheBust ? Date.now() : TICKETS_CACHE_BUST;
      const res = await fetch(assetUrl(`${TICKETS_MANIFEST}?v=${bust}`));
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data?.events) ? data.events : [];
      ticketEvents = rows
        .filter((t) => t && t.date && t.title)
        .map((t) => ({
          date: String(t.date),
          title: normalizeEventTitle(t.title),
          ticketsAvailable:
            t.ticketsAvailable != null && t.ticketsAvailable !== ""
              ? Number(t.ticketsAvailable)
              : null,
          sheetName: t.sheetName,
          workbook: t.workbook,
        }));
      ticketsUpdatedAt = data.updatedAt ? String(data.updatedAt) : null;
      rebuildTicketIndex();
      updateTicketsLegend();
    } catch (err) {
      console.warn("Could not load live tickets:", err);
    }
  }

  async function refreshLiveTickets() {
    await loadLiveTickets({ cacheBust: true });
    renderCalendar();
  }

  function updateTicketsLegend() {
    const el = document.getElementById("tickets-legend");
    if (!el) return;
    if (!ticketEvents.length) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    let when = "";
    if (ticketsUpdatedAt) {
      const d = new Date(ticketsUpdatedAt);
      if (!Number.isNaN(d.getTime())) {
        when = ` · updated ${d.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`;
      }
    }
    el.textContent = `${ticketEvents.length} live ticket count${ticketEvents.length === 1 ? "" : "s"} from SharePoint${when}`;
  }

  async function loadHostedFlyers() {
    try {
      const res = await fetch(assetUrl(`${HOSTED_FLYERS_MANIFEST}?v=${FLYERS_CACHE_BUST}`));
      if (!res.ok) return;
      const data = await res.json();
      const files = Array.isArray(data?.files) ? data.files : [];
      const ref = new Date();
      const next = [];
      for (const entry of files) {
        const hostedFile = typeof entry === "string" ? entry : entry?.file;
        if (!hostedFile) continue;
        const baseName = hostedFile.split("/").pop() || hostedFile;
        const parsed = parseEventFileName(baseName, ref);
        if (!parsed) {
          console.warn("Hosted flyer: could not parse date from", hostedFile);
          continue;
        }
        next.push({
          id: `hosted:${hostedFile}`,
          date: parsed.date,
          title: parsed.title,
          fileName: baseName,
          hostedFile,
          source: "hosted",
        });
      }
      hostedEvents = next;
      rebuildEvents();
    } catch (err) {
      console.warn("Could not load hosted flyers:", err);
    }
  }

  function saveArrivals() {
    localStorage.setItem(STORAGE_ARRIVALS, JSON.stringify(arrivals));
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toISODate(y, m, d) {
    return `${y}-${pad2(m + 1)}-${pad2(d)}`;
  }

  function parseLocalDate(iso) {
    const [y, mo, da] = iso.split("-").map(Number);
    return new Date(y, mo - 1, da);
  }

  /** Add whole calendar days to an ISO date (local). */
  function addCalendarDays(iso, deltaDays) {
    const d = parseLocalDate(iso);
    d.setDate(d.getDate() + deltaDays);
    return toISODate(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /**
   * A guest can attend an evening event on `eventDayIso` if they are in-house that night,
   * but not on their check-in day (arrival) or check-out day.
   * Check-out = arrival + nights (first morning they depart; no event that calendar date).
   */
  function guestEligibleForEventOnDate(arrival, eventDayIso) {
    const nights = arrival.nights;
    if (!eventDayIso || !arrival.arrivalDate || !Number.isFinite(nights) || nights < 1) {
      return false;
    }
    const arr = arrival.arrivalDate;
    if (eventDayIso <= arr) return false;
    const checkoutIso = addCalendarDays(arr, nights);
    if (eventDayIso >= checkoutIso) return false;
    return true;
  }

  /** Events (from flyers) where this arrival has an opportunity on that event date. */
  function eventOpportunitiesForArrival(arrival) {
    return events
      .filter((ev) => guestEligibleForEventOnDate(arrival, ev.date))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  /**
   * Extract YYYY-MM-DD and event title from a PDF filename.
   * Supports many formats, e.g. 2026-03-15-Spring-Gala, 03-15-2026 Beach Cleanup,
   * 06.01 Spring Gala, 6.1-Spring Gala, 2026 06.01 Spring Gala.
   */
  function parseEventFileName(name, referenceDate = new Date()) {
    const base = name.replace(/\.pdf$/i, "").replace(/_/g, " ").trim();

    const tryResult = (y, mo, da, titleRaw) => {
      const title = normalizeEventTitle(titleRaw);
      if (!validDateParts(y, mo, da)) return null;
      return { date: toISODate(y, mo - 1, da), title };
    };

    const titleSep = /[\s/_\-–—]+/;

    const attempts = [
      () => {
        const m = base.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})[\s/_\-–—]+(.+)$/);
        return m ? tryResult(+m[1], +m[2], +m[3], m[4]) : null;
      },
      () => {
        const m = base.match(/^(\d{1,2})-(\d{1,2})-(\d{4})[\s/_\-–—]+(.+)$/);
        return m ? tryResult(+m[3], +m[1], +m[2], m[4]) : null;
      },
      () => {
        const m = base.match(/^(\d{4})[\s/_\-–—]+(\d{1,2})\.(\d{1,2})[\s/_\-–—]+(.+)$/);
        return m ? tryResult(+m[1], +m[2], +m[3], m[4]) : null;
      },
      () => {
        const m = base.match(/^(\d{1,2})\.(\d{1,2})[\s/_\-–—]+(.+)$/);
        if (!m) return null;
        const mo = +m[1];
        const da = +m[2];
        return tryResult(inferEventYear(mo, da, referenceDate), mo, da, m[3]);
      },
    ];

    for (const attempt of attempts) {
      const r = attempt();
      if (r) return r;
    }

    const iso = base.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) {
      const y = +iso[1];
      const mo = +iso[2];
      const da = +iso[3];
      const rest = base.replace(iso[0], "").replace(titleSep, " ").trim();
      const r = tryResult(y, mo, da, rest || "Event");
      if (r) return r;
    }

    return null;
  }

  function normalizeHeader(h) {
    return String(h ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pickColumn(row, aliases) {
    const keys = Object.keys(row);
    const map = {};
    for (const k of keys) {
      map[normalizeHeader(k)] = k;
    }
    for (const a of aliases) {
      const n = normalizeHeader(a);
      if (map[n] !== undefined) return row[map[n]];
    }
    return "";
  }

  /**
   * Prefer GUEST_NAME2; many exports leave it blank and only fill GUEST_NAME.
   * pickColumn alone would return "" for GUEST_NAME2 without trying GUEST_NAME.
   */
  function pickGuestName(row) {
    const tryTrim = (v) => String(v ?? "").replace(/\u00a0/g, " ").trim();
    const g2 = tryTrim(pickColumn(row, ["GUEST_NAME2"]));
    if (g2) return g2;
    const g1 = tryTrim(pickColumn(row, ["GUEST_NAME"]));
    if (g1) return g1;
    const cl = tryTrim(pickColumn(row, ["CL_CUSTOMER_NAME", "CUSTOMER_NAME"]));
    if (cl) return cl;
    return tryTrim(
      pickColumn(row, ["guest name", "guest", "name", "client"])
    );
  }

  /**
   * Map CSV cell value to a reservation type code (must match ALLOWED_RESV_TYPES).
   */
  function normalizeResvType(val) {
    let s = String(val ?? "")
      .replace(/^\uFEFF/, "")
      .replace(/\u00a0/g, " ")
      .trim()
      .toUpperCase();
    if (!s) return "";
    if (ALLOWED_RESV_TYPES.has(s)) return s;
    const lettersOnly = s.replace(/[^A-Z]/g, "");
    if (lettersOnly && ALLOWED_RESV_TYPES.has(lettersOnly)) return lettersOnly;
    const firstToken = s.split(/[\s,/|\-]+/)[0] || "";
    if (firstToken && ALLOWED_RESV_TYPES.has(firstToken)) return firstToken;
    return s;
  }

  const RESV_TYPE_HEADER_ALIASES = [
    "RESV_TYPE",
    "RESV TYPE",
    "RESVTYPE",
    "RESERVATION TYPE",
    "RESERVATION_TYPE",
    "RESV-TYPE",
    "RES TYPE",
    "REVS_TYPE",
    "RSVN TYPE",
  ];

  function parseNights(val) {
    const n = parseInt(String(val).replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  const MONTH_ABBR = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  function parseArrivalDate(val) {
    const s = String(val || "").trim();
    if (!s) return null;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (us) {
      const mo = parseInt(us[1], 10);
      const da = parseInt(us[2], 10);
      const y = parseInt(us[3], 10);
      return toISODate(y, mo - 1, da);
    }
    const dmy = s.match(/^(\d{1,2})-([A-Za-z]{3})[A-Za-z]*-(\d{4})$/i);
    if (dmy) {
      const da = parseInt(dmy[1], 10);
      const moKey = dmy[2].toLowerCase();
      const y = parseInt(dmy[3], 10);
      const mo = MONTH_ABBR[moKey];
      if (mo !== undefined && !Number.isNaN(da) && !Number.isNaN(y)) {
        return toISODate(y, mo, da);
      }
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return toISODate(d.getFullYear(), d.getMonth(), d.getDate());
    }
    return null;
  }

  function eventsForMonth(year, monthIndex) {
    return events.filter((e) => {
      const d = parseLocalDate(e.date);
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    });
  }

  function eventsOnDate(iso) {
    return events.filter((e) => e.date === iso);
  }

  function renderCalendar() {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    monthLabel.textContent = viewDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    grid.innerHTML = "";
    const totalCells = startPad + daysInMonth;
    const rows = Math.ceil(totalCells / 7) * 7;

    const today = new Date();
    const todayIso = toISODate(today.getFullYear(), today.getMonth(), today.getDate());

    for (let i = 0; i < rows; i++) {
      const dayNum = i - startPad + 1;
      const outside = dayNum < 1 || dayNum > daysInMonth;
      let iso;
      let cellDay = dayNum;
      if (outside) {
        if (dayNum < 1) {
          const prev = new Date(y, m, 0).getDate() + dayNum;
          const pm = m === 0 ? 11 : m - 1;
          const py = m === 0 ? y - 1 : y;
          iso = toISODate(py, pm, prev);
        } else {
          const n = dayNum - daysInMonth;
          const nm = m === 11 ? 0 : m + 1;
          const ny = m === 11 ? y + 1 : y;
          iso = toISODate(ny, nm, n);
        }
      } else {
        iso = toISODate(y, m, cellDay);
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day-cell";
      if (outside) btn.classList.add("outside");
      if (!outside && iso === todayIso) btn.classList.add("today");
      if (!outside && selectedDay === iso) btn.classList.add("selected");

      const dayEvents = !outside ? eventsOnDate(iso) : [];
      if (dayEvents.length) btn.classList.add("has-event");
      if (dayEvents.length > 1) btn.classList.add("has-multi-event");

      const num = document.createElement("span");
      num.className = "day-num";
      num.textContent = outside
        ? String(
            dayNum < 1
              ? new Date(y, m, 0).getDate() + dayNum
              : dayNum - daysInMonth
          )
        : String(dayNum);
      btn.appendChild(num);

      if (dayEvents.length && !outside) {
        const wrap = document.createElement("div");
        wrap.className = "day-events-wrap";
        const ticketsFoot = document.createElement("div");
        ticketsFoot.className = "day-tickets-foot";
        for (const item of dayEvents) {
          const block = document.createElement("div");
          block.className = "day-event-block";
          const titleEl = document.createElement("span");
          titleEl.className = "day-event-title";
          titleEl.textContent = item.title;
          titleEl.title = item.title;
          block.appendChild(titleEl);
          wrap.appendChild(block);
          const tickets = ticketsAvailableForEvent(item);
          if (tickets != null) {
            const ticketEl = document.createElement("span");
            ticketEl.className = "day-tickets";
            if (tickets <= LOW_TICKET_THRESHOLD) ticketEl.classList.add("low");
            ticketEl.textContent = `${tickets} avail`;
            ticketsFoot.appendChild(ticketEl);
          }
        }
        btn.appendChild(wrap);
        if (ticketsFoot.childNodes.length) btn.appendChild(ticketsFoot);
      }

      if (!outside) {
        btn.addEventListener("click", () => onDayClick(iso, dayEvents));
      }

      grid.appendChild(btn);
    }
  }

  function onDayClick(iso, dayEvents) {
    selectedDay = iso;
    if (dayEvents.length === 1) {
      selectedEventId = dayEvents[0].id;
    } else if (dayEvents.length > 1) {
      selectedEventId = dayEvents[0].id;
    } else {
      selectedEventId = null;
    }
    renderCalendar();
    renderPdfPreview();
  }

  function formatDisplayDate(iso) {
    const d = parseLocalDate(iso);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  /** Event context for booking email (calendar filter or first overlap). */
  function pickEventForBookingEmail(arrival) {
    if (selectedDay) {
      const dayEvents = eventsOnDate(selectedDay);
      if (dayEvents.length === 1) return dayEvents[0];
      if (dayEvents.length > 1 && selectedEventId) {
        const picked = dayEvents.find((e) => e.id === selectedEventId);
        if (picked) return picked;
      }
      if (dayEvents.length) return dayEvents[0];
    }
    const opps = eventOpportunitiesForArrival(arrival);
    return opps.length ? opps[0] : null;
  }

  /** Label fill from Book1.xlsx (theme accent6 #4EA72E + tint ~0.8). */
  const HUA_BOOKING_LABEL_BG = "#DCEDD5";
  const HUA_BOOKING_PAYMENT_BG = "#FFFF00";
  const BOOKING_CELL_BORDER = "1px solid #000000";
  const BOOKING_FONT = "font-family:Calibri,Arial,sans-serif;font-size:11pt;";

  /** Rows inside the bold border on Book1.xlsx (B3:C26). */
  const HUA_BOOKING_ROWS = [
    { kind: "std", label: "LEAD NUMBER:", key: "leadNumber" },
    { kind: "std", label: "EVENT DATE:", key: "eventDate" },
    { kind: "std", label: "EVENT NAME:", key: "eventName" },
    { kind: "std", label: "TOUR DATE:", key: "tourDate" },
    { kind: "std", label: "TOUR TIME:", key: "tourTime" },
    { kind: "std", label: "FIRST & LAST NAME:", key: "guestName" },
    {
      kind: "pair",
      labels: ["TYPE OF TOUR", "(Owner – Pls note if Elite or Loyalty):"],
      key: "tourType",
    },
    { kind: "std", label: "DECILE/LOYALTY:", key: "decileLoyalty" },
    { kind: "std", label: "SPOKE TO:", key: "spokeTo" },
    { kind: "std", label: "FULL RES. ARRIVAL DATE:", key: "arrivalDate" },
    { kind: "std", label: "CELL NUMBER:", key: "cellNumber" },
    { kind: "std", label: "EMAIL:", key: "email" },
    { kind: "std", label: "MARRIED/SINGLE/COHAB:", key: "marriedStatus" },
    {
      kind: "pair",
      labels: ["TOTAL NUMBER OF PEOPLE", "(please list adults & children):"],
      key: "totalPeople",
    },
    { kind: "std", label: "TOTAL COST QUOTED TO GUEST:", key: "totalCost" },
    { kind: "pay", label: "PAYMENT COLLECTED?", key: "paymentCollected" },
    { kind: "std", label: "PROPERTY & ROOM NUMBER:", key: "property" },
    { kind: "std", label: "FULL RES.CHECK OUT DATE:", key: "checkoutDate" },
    { kind: "std", label: "ADDITIONAL GIFTING?:", key: "additionalGifting" },
    { kind: "std", label: "SPECIAL OCCASION?:", key: "specialOccasion" },
    { kind: "std", label: "ALLERGIES/ADA REQUEST:", key: "allergies" },
    {
      kind: "std",
      label: "OTHER IMPORTANT COMMENTS:",
      key: "otherComments",
      labelBold: true,
    },
  ];

  function wrapCfHtml(fragment) {
    const htmlStart = "<html>\r\n<body>\r\n<!--StartFragment-->";
    const htmlEnd = "<!--EndFragment-->\r\n</body>\r\n</html>";
    const payload = htmlStart + fragment + htmlEnd;
    const pad = (n) => String(n).padStart(10, "0");
    const headerLen =
      "Version:1.0\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\n" +
      "StartFragment:0000000000\r\nEndFragment:0000000000\r\n".length;
    const startHtml = headerLen;
    const endHtml = headerLen + payload.length;
    const startFragment =
      headerLen + payload.indexOf("<!--StartFragment-->") + "<!--StartFragment-->".length;
    const endFragment = headerLen + payload.indexOf("<!--EndFragment-->");
    return (
      "Version:1.0\r\n" +
      `StartHTML:${pad(startHtml)}\r\n` +
      `EndHTML:${pad(endHtml)}\r\n` +
      `StartFragment:${pad(startFragment)}\r\n` +
      `EndFragment:${pad(endFragment)}\r\n` +
      payload
    );
  }

  function extractHtmlFragment(htmlDoc) {
    if (!htmlDoc.includes("<!--StartFragment-->")) return htmlDoc;
    return htmlDoc.slice(
      htmlDoc.indexOf("<!--StartFragment-->") + "<!--StartFragment-->".length,
      htmlDoc.indexOf("<!--EndFragment-->")
    );
  }

  function copyHtmlViaCopyEvent(htmlDoc, plainBody) {
    return new Promise((resolve) => {
      const onCopy = (event) => {
        event.preventDefault();
        event.clipboardData.setData("text/html", htmlDoc);
        event.clipboardData.setData("text/plain", plainBody);
      };
      document.addEventListener("copy", onCopy);
      const host = document.createElement("div");
      host.contentEditable = "true";
      host.style.position = "fixed";
      host.style.left = "-9999px";
      host.style.top = "0";
      host.innerHTML = extractHtmlFragment(htmlDoc);
      document.body.appendChild(host);
      const range = document.createRange();
      range.selectNodeContents(host);
      const sel = window.getSelection();
      if (!sel) {
        document.body.removeChild(host);
        document.removeEventListener("copy", onCopy);
        resolve(false);
        return;
      }
      sel.removeAllRanges();
      sel.addRange(range);
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      sel.removeAllRanges();
      document.body.removeChild(host);
      document.removeEventListener("copy", onCopy);
      resolve(ok);
    });
  }

  function bookingFieldValue(fields, key) {
    const v = fields[key];
    return v != null && String(v).trim() !== "" ? String(v).trim() : "";
  }

  /** Shared field values for plain text, HTML table, and .eml export. */
  function getHuaBookingFields(arrival, event) {
    const checkoutIso =
      arrival.arrivalDate && Number.isFinite(arrival.nights)
        ? addCalendarDays(arrival.arrivalDate, arrival.nights)
        : "";
    return {
      leadNumber: arrival.leadId || "",
      eventDate: event ? formatDisplayDate(event.date) : "",
      eventName: event ? event.title : "",
      tourDate: "",
      tourTime: "",
      guestName: arrival.guest || "",
      tourType: arrival.resvType || "",
      decileLoyalty: "",
      spokeTo: "",
      arrivalDate: arrival.arrivalDate ? formatDisplayDate(arrival.arrivalDate) : "",
      cellNumber: "",
      email: "",
      marriedStatus: "",
      totalPeople: "",
      totalCost: "",
      paymentCollected: "",
      property: arrival.property || "",
      checkoutDate: checkoutIso ? formatDisplayDate(checkoutIso) : "",
      additionalGifting: "",
      specialOccasion: "",
      allergies: "",
      otherComments: "",
    };
  }

  function bookingPlainLine(label, value) {
    return `${label}\t${value}`;
  }

  function buildHuaBookingEmailBody(arrival, event) {
    const f = getHuaBookingFields(arrival, event);
    const lines = [];
    for (const row of HUA_BOOKING_ROWS) {
      if (row.kind === "std") {
        lines.push(bookingPlainLine(row.label, bookingFieldValue(f, row.key)));
      } else if (row.kind === "pair") {
        lines.push(bookingPlainLine(row.labels[0], bookingFieldValue(f, row.key)));
        lines.push(bookingPlainLine(row.labels[1], ""));
      } else if (row.kind === "pay") {
        lines.push(bookingPlainLine(row.label, bookingFieldValue(f, row.key)));
      }
    }
    return lines.join("\r\n");
  }

  function bookingHtmlTd(text, opts) {
    const bg = opts.bg || "#ffffff";
    const align = opts.align || "left";
    const bold = opts.bold ? "bold" : "normal";
    const width = opts.width || "";
    const rowspan = opts.rowspan ? ` rowspan="${opts.rowspan}"` : "";
    const bgAttr = bg ? ` bgcolor="${bg}"` : "";
    return (
      `<td${rowspan}${bgAttr} style="${BOOKING_FONT}background:${bg};border:${BOOKING_CELL_BORDER};` +
      `padding:7px 10px;font-weight:${bold};text-align:${align};vertical-align:middle;` +
      `${width}min-height:24px;mso-line-height-rule:exactly;">${escapeHtml(text)}&nbsp;</td>`
    );
  }

  function bookingHtmlStandardRow(label, value, labelBold) {
    return (
      "<tr>" +
      bookingHtmlTd(label, {
        bg: HUA_BOOKING_LABEL_BG,
        align: "center",
        bold: labelBold,
        width: "width:53%;",
      }) +
      bookingHtmlTd(value, { align: "left", width: "width:47%;" }) +
      "</tr>"
    );
  }

  function bookingHtmlPairRows(label1, label2, value) {
    return (
      "<tr>" +
      bookingHtmlTd(label1, {
        bg: HUA_BOOKING_LABEL_BG,
        align: "center",
        width: "width:53%;",
      }) +
      bookingHtmlTd(value, { align: "left", width: "width:47%;", rowspan: 2 }) +
      "</tr><tr>" +
      bookingHtmlTd(label2, {
        bg: HUA_BOOKING_LABEL_BG,
        align: "center",
        width: "width:53%;",
      }) +
      "</tr>"
    );
  }

  function bookingHtmlPaymentRow(label, value) {
    return (
      "<tr>" +
      bookingHtmlTd(label, {
        bg: HUA_BOOKING_PAYMENT_BG,
        align: "center",
        width: "width:53%;",
      }) +
      bookingHtmlTd(value, { align: "left", width: "width:47%;" }) +
      "</tr>"
    );
  }

  /** HTML table matching Book1.xlsx (B3:C26): green labels, yellow payment label only, merged value cells. */
  function buildHuaBookingEmailHtml(arrival, event) {
    const f = getHuaBookingFields(arrival, event);
    const rows = [];
    for (const row of HUA_BOOKING_ROWS) {
      if (row.kind === "std") {
        rows.push(
          bookingHtmlStandardRow(
            row.label,
            bookingFieldValue(f, row.key),
            !!row.labelBold
          )
        );
      } else if (row.kind === "pair") {
        rows.push(
          bookingHtmlPairRows(
            row.labels[0],
            row.labels[1],
            bookingFieldValue(f, row.key)
          )
        );
      } else if (row.kind === "pay") {
        rows.push(bookingHtmlPaymentRow(row.label, bookingFieldValue(f, row.key)));
      }
    }
    return (
      '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="UTF-8">' +
      '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->' +
      '</head><body style="margin:0;padding:12px;">' +
      '<table border="1" cellpadding="0" cellspacing="0" width="640" ' +
      'style="border-collapse:collapse;width:100%;max-width:640px;border:2px solid #000000;mso-table-lspace:0;mso-table-rspace:0;">' +
      rows.join("") +
      "</table></body></html>"
    );
  }

  function buildHuaBookingClipboardHtml(arrival, event) {
    const fullHtml = buildHuaBookingEmailHtml(arrival, event);
    const tableMatch = fullHtml.match(/<table[\s\S]*<\/table>/i);
    const fragment = tableMatch ? tableMatch[0] : fullHtml;
    return (
      "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">" +
      "<meta name=\"Generator\" content=\"HUA Bookings\"></head>" +
      "<body style=\"margin:0;padding:12px;background:#ffffff;\">" +
      "<!--StartFragment-->" +
      fragment +
      "<!--EndFragment--></body></html>"
    );
  }

  function buildHuaBookingEml(subject, plainBody, htmlBody) {
    const boundary = "----=_HUA_Booking_" + Date.now();
    return [
      "MIME-Version: 1.0",
      "X-Unsent: 1",
      "Subject: " + subject,
      "To: ",
      "Content-Type: multipart/alternative; boundary=\"" + boundary + "\"",
      "",
      "--" + boundary,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      plainBody,
      "",
      "--" + boundary,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      htmlBody,
      "",
      "--" + boundary + "--",
      "",
    ].join("\r\n");
  }

  function downloadHuaBookingEml(arrival, event) {
    const subject = HUA_BOOKING_SUBJECT;
    const plain = buildHuaBookingEmailBody(arrival, event);
    const html = buildHuaBookingEmailHtml(arrival, event);
    const eml = buildHuaBookingEml(subject, plain, html);
    const blob = new Blob([eml], { type: "message/rfc822" });
    const leadPart = String(arrival.leadId || "booking")
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 40);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HUA-Booking-${leadPart}.eml`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  let lastBookHuaHtml = "";
  let lastBookHuaPlain = "";
  let pendingBookHua = null;
  let outlookWebWindow = null;
  let lastOutlookWebOpenAt = 0;

  function triggerOutlookDesktopProtocol(subject) {
    const qs = new URLSearchParams({ subject }).toString();
    const link = document.createElement("a");
    link.href = `ms-outlook:compose?${qs}`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function openOutlookWebComposeOnce() {
    const qs = new URLSearchParams({ subject: HUA_BOOKING_SUBJECT }).toString();
    const url = `https://outlook.office.com/mail/deeplink/compose?${qs}`;
    const now = Date.now();

    if (outlookWebWindow && !outlookWebWindow.closed) {
      try {
        outlookWebWindow.location.href = url;
      } catch {
        /* cross-origin — focus existing tab */
      }
      outlookWebWindow.focus();
      return outlookWebWindow;
    }

    if (now - lastOutlookWebOpenAt < 4000) {
      return outlookWebWindow;
    }

    lastOutlookWebOpenAt = now;
    outlookWebWindow = window.open(url, "hua-outlook-compose");
    if (outlookWebWindow) outlookWebWindow.focus();
    return outlookWebWindow;
  }

  async function copyHuaBookingHtmlToClipboard(html, plainBody) {
    const fragment = extractHtmlFragment(html);
    const cfHtml = wrapCfHtml(fragment);

    const copiedViaEvent = await copyHtmlViaCopyEvent(html, plainBody);
    if (copiedViaEvent) return true;

    if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([cfHtml], { type: "text/html" }),
            "text/plain": new Blob([plainBody], { type: "text/plain" }),
          }),
        ]);
        return true;
      } catch {
        /* fall through */
      }
    }

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(plainBody);
      }
      return false;
    } catch {
      return false;
    }
  }

  function showBookHuaView(view, copied) {
    const modal = document.getElementById("book-hua-modal");
    const chooseView = document.getElementById("book-hua-view-choose");
    const webView = document.getElementById("book-hua-view-web");
    const desktopView = document.getElementById("book-hua-view-desktop");
    const status = document.getElementById("book-hua-modal-copy-status");
    if (!modal) return;

    if (chooseView) chooseView.hidden = view !== "choose";
    if (webView) webView.hidden = view !== "web";
    if (desktopView) desktopView.hidden = view !== "desktop";

    if (view === "web" && status && copied !== undefined) {
      status.textContent = copied
        ? "The booking form is copied — paste it in Outlook (Cmd+V or Ctrl+V)."
        : "Copy failed in this browser. Use Copy template again, or download the .eml file instead.";
    }

    modal.hidden = false;
  }

  function hideBookHuaModal() {
    const modal = document.getElementById("book-hua-modal");
    if (modal) modal.hidden = true;
  }

  function openBookHuaChooser(arrival, event) {
    pendingBookHua = { arrival, event };
    lastBookHuaHtml = buildHuaBookingClipboardHtml(arrival, event);
    lastBookHuaPlain = buildHuaBookingEmailBody(arrival, event);
    showBookHuaView("choose");
  }

  async function launchBookHuaWeb() {
    if (!pendingBookHua) return;
    const webBtn = document.getElementById("book-hua-choose-web");
    if (webBtn) webBtn.disabled = true;

    openOutlookWebComposeOnce();
    showBookHuaView("web");
    const status = document.getElementById("book-hua-modal-copy-status");
    if (status) {
      status.textContent =
        "Outlook is opening in another tab (first load can take 10–30 seconds). Copying the booking form…";
    }

    const copied = await copyHuaBookingHtmlToClipboard(lastBookHuaHtml, lastBookHuaPlain);
    if (status) {
      status.textContent = copied
        ? "The booking form is copied — paste it in Outlook (Cmd+V or Ctrl+V)."
        : "Copy failed in this browser. Use Copy template again, or download the .eml file instead.";
    }
    if (webBtn) webBtn.disabled = false;
  }

  function launchBookHuaDesktop() {
    if (!pendingBookHua) return;
    const { arrival, event } = pendingBookHua;
    downloadHuaBookingEml(arrival, event);
    triggerOutlookDesktopProtocol(HUA_BOOKING_SUBJECT);
    showBookHuaView("desktop");
  }

  function launchBookHuaEmlOnly() {
    if (!pendingBookHua) return;
    const { arrival, event } = pendingBookHua;
    downloadHuaBookingEml(arrival, event);
    hideBookHuaModal();
  }

  function emptyArrivalRecord() {
    return { leadId: "", guest: "", property: "", arrivalDate: "", nights: 0, resvType: "" };
  }

  /** Prefill from selected calendar day / single matching arrival when possible. */
  function getBookingContextForBookHua() {
    const empty = emptyArrivalRecord();
    if (!selectedDay) return { arrival: empty, event: null };
    const evs = eventsOnDate(selectedDay);
    let event = null;
    if (selectedEventId) event = evs.find((e) => e.id === selectedEventId) || null;
    if (!event && evs.length === 1) event = evs[0];
    if (!event && evs.length) event = evs[0];
    if (!event) return { arrival: empty, event: null };
    const eligible = arrivals.filter((a) => guestEligibleForEventOnDate(a, event.date));
    const arrival = eligible.length ? eligible[0] : empty;
    return { arrival, event };
  }

  async function openHuaBookingEmail(arrival) {
    if (!arrival) return;
    const event = pickEventForBookingEmail(arrival);
    openBookHuaChooser(arrival, event);
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  const PDFJS_WORKER =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js";

  /** Open stored PDF in a new browser tab (native viewer, zoom, print). */
  async function openFlyerInNewTab(ev) {
    const blob = await ensurePdfBlob(ev);
    if (!blob || !blob.size) {
      alert(
        ev.source === "hosted"
          ? "PDF file is not available. Check that the flyer exists in the site repository."
          : "PDF file is not available. Re-upload this flyer under Event Data."
      );
      return;
    }
    const url = URL.createObjectURL(blob);
    const tab = window.open(url, "_blank", "noopener,noreferrer");
    if (!tab) {
      URL.revokeObjectURL(url);
      alert("This browser blocked the new tab. Allow pop-ups for this site.");
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 180000);
  }

  /**
   * Draw first PDF page to canvas (no embedded browser PDF UI).
   * @returns {Promise<boolean>} true if canvas render succeeded
   */
  async function renderFlyerCanvasFromBlob(blob, sheetEl) {
    sheetEl.innerHTML = "";
    const pdfjsLib = typeof window !== "undefined" ? window.pdfjsLib : null;
    if (!pdfjsLib || !blob) return false;
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    try {
      const data = await blob.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      const page = await pdf.getPage(1);
      const baseVp = page.getViewport({ scale: 1 });
      const parentW = sheetEl.parentElement ? sheetEl.parentElement.clientWidth : 560;
      const maxW = Math.max(280, parentW - 16);
      const scale = Math.min(maxW / baseVp.width, 3);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.className = "pdf-preview-canvas";
      await page.render({ canvasContext: ctx, viewport }).promise;
      sheetEl.appendChild(canvas);
      return true;
    } catch (err) {
      console.warn("PDF.js preview failed:", err);
      return false;
    }
  }

  function mountIframePdfFallback(blob, title, item) {
    const url = URL.createObjectURL(blob);
    previewObjectUrls.push(url);
    const iframe = document.createElement("iframe");
    iframe.className = "pdf-preview-frame";
    iframe.title = title;
    iframe.src = `${url}#toolbar=0&navpanes=0&view=FitH`;
    item.appendChild(iframe);
  }

  async function renderPdfPreview() {
    const panel = document.getElementById("pdf-preview-panel");
    const framesEl = document.getElementById("pdf-preview-frames");
    const heading = document.getElementById("pdf-preview-heading");
    const hint = document.getElementById("pdf-preview-hint");
    const emptyEl = document.getElementById("pdf-preview-empty");
    if (!panel || !framesEl || !heading || !hint) return;

    const onDashboard = document.querySelector(".app")?.classList.contains("app--dashboard");
    if (!onDashboard) {
      revokePreviewUrls();
      panel.hidden = true;
      if (emptyEl) emptyEl.hidden = true;
      return;
    }

    revokePreviewUrls();
    framesEl.innerHTML = "";
    hint.hidden = true;

    if (!selectedDay) {
      panel.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    const evs = eventsOnDate(selectedDay);
    if (!evs.length) {
      panel.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    panel.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    heading.textContent =
      evs.length === 1
        ? `Flyer preview — ${evs[0].title}`
        : `Flyer previews (${evs.length}) — ${formatDisplayDate(selectedDay)}`;

    let anyBlob = false;
    for (const ev of evs) {
      const blob = await ensurePdfBlob(ev);
      if (!blob || blob.size === 0) continue;
      anyBlob = true;
      const item = document.createElement("div");
      item.className = "pdf-preview-item";

      const cap = document.createElement("p");
      cap.className = "pdf-preview-caption";
      cap.textContent = `${ev.title} · ${ev.fileName}`;

      const toolbar = document.createElement("div");
      toolbar.className = "pdf-preview-toolbar";

      const btnOpen = document.createElement("button");
      btnOpen.type = "button";
      btnOpen.className = "pdf-preview-action";
      btnOpen.textContent = "Open in new tab";
      btnOpen.addEventListener("click", () => openFlyerInNewTab(ev));

      const btnDl = document.createElement("button");
      btnDl.type = "button";
      btnDl.className = "pdf-preview-action";
      btnDl.textContent = "Download PDF";
      btnDl.addEventListener("click", () => downloadEventPdf(ev));

      toolbar.appendChild(btnOpen);
      toolbar.appendChild(btnDl);

      const sheet = document.createElement("div");
      sheet.className = "pdf-preview-sheet";

      item.appendChild(cap);
      item.appendChild(toolbar);
      item.appendChild(sheet);
      framesEl.appendChild(item);

      await new Promise((r) => requestAnimationFrame(r));
      const ok = await renderFlyerCanvasFromBlob(blob, sheet);
      if (!ok) {
        sheet.remove();
        mountIframePdfFallback(blob, ev.fileName, item);
      }
    }

    hint.hidden = anyBlob;
  }

  function renderPdfList() {
    pdfList.innerHTML = "";
    if (hostedEvents.length) {
      const head = document.createElement("li");
      head.className = "file-list-section";
      head.textContent = `${hostedEvents.length} hosted flyer${hostedEvents.length === 1 ? "" : "s"} (loaded from site)`;
      pdfList.appendChild(head);
    }
    const recent = events.slice(-30).reverse();
    for (const e of recent) {
      const li = document.createElement("li");
      const badge =
        e.source === "hosted"
          ? "hosted"
          : e.source === "local"
            ? "local"
            : "";
      li.innerHTML = badge
        ? `<span class="flyer-badge ${badge}">${badge}</span> ${e.date} — ${e.title} (${e.fileName})`
        : `${e.date} — ${e.title} (${e.fileName})`;
      pdfList.appendChild(li);
    }
    if (!events.length) {
      const li = document.createElement("li");
      li.textContent = "No flyers yet. Hosted flyers load automatically; add more under Event Data.";
      pdfList.appendChild(li);
    } else if (localEvents.length) {
      const foot = document.createElement("li");
      foot.className = "file-list-hint";
      foot.textContent = `${localEvents.length} local upload${localEvents.length === 1 ? "" : "s"} in this browser`;
      pdfList.appendChild(foot);
    }
  }

  document.getElementById("prev-month").addEventListener("click", () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    selectedDay = null;
    selectedEventId = null;
    renderCalendar();
    renderPdfPreview();
  });

  document.getElementById("next-month").addEventListener("click", () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    selectedDay = null;
    selectedEventId = null;
    renderCalendar();
    renderPdfPreview();
  });

  document.getElementById("today-btn").addEventListener("click", () => {
    viewDate = startOfMonth(new Date());
    selectedDay = null;
    selectedEventId = null;
    renderCalendar();
    renderPdfPreview();
  });

  const uploadPanelsEl = document.getElementById("upload-panels");
  const headerSubtitle = document.getElementById("header-subtitle");

  function applyTabView(tabId) {
    document.querySelectorAll(".tab").forEach((t) => {
      const on = t.getAttribute("data-tab") === tabId;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });

    const isDashboard = tabId === "dashboard";
    const appEl = document.querySelector(".app");
    appEl?.classList.toggle("app--dashboard", isDashboard);

    if (uploadPanelsEl) uploadPanelsEl.hidden = isDashboard;

    if (mainDashboard) mainDashboard.hidden = !isDashboard;

    if (headerSubtitle) {
      if (tabId === "dashboard") {
        headerSubtitle.textContent = "";
        headerSubtitle.hidden = true;
      } else if (tabId === "flyers") {
        headerSubtitle.hidden = false;
        headerSubtitle.textContent =
          "Hosted flyers load from the site automatically. Upload extra PDFs or a whole folder here if needed.";
      } else {
        headerSubtitle.hidden = false;
        headerSubtitle.textContent =
          "Import your reservation export; allowed types load into the arrivals list.";
      }
    }

    if (!isDashboard) {
      document.getElementById("panel-flyers").classList.toggle("active", tabId === "flyers");
      document.getElementById("panel-flyers").hidden = tabId !== "flyers";
      document.getElementById("panel-arrivals").classList.toggle("active", tabId === "arrivals");
      document.getElementById("panel-arrivals").hidden = tabId !== "arrivals";
    }

    renderPdfPreview();
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      applyTabView(tab.getAttribute("data-tab") || "dashboard");
    });
  });

  applyTabView("dashboard");

  const bookHuaBtn = document.getElementById("book-hua-btn");
  if (bookHuaBtn) {
    bookHuaBtn.addEventListener("click", () => {
      const { arrival, event } = getBookingContextForBookHua();
      openBookHuaChooser(arrival, event);
    });
  }

  const bookHuaChooseWeb = document.getElementById("book-hua-choose-web");
  const bookHuaChooseDesktop = document.getElementById("book-hua-choose-desktop");
  const bookHuaChooseEml = document.getElementById("book-hua-choose-eml");
  const bookHuaChooseCancel = document.getElementById("book-hua-choose-cancel");
  if (bookHuaChooseWeb) {
    bookHuaChooseWeb.addEventListener("click", () => void launchBookHuaWeb());
  }
  if (bookHuaChooseDesktop) {
    bookHuaChooseDesktop.addEventListener("click", () => launchBookHuaDesktop());
  }
  if (bookHuaChooseEml) {
    bookHuaChooseEml.addEventListener("click", () => launchBookHuaEmlOnly());
  }
  if (bookHuaChooseCancel) {
    bookHuaChooseCancel.addEventListener("click", () => hideBookHuaModal());
  }

  const bookHuaCopyAgain = document.getElementById("book-hua-copy-again");
  const bookHuaOpenWeb = document.getElementById("book-hua-open-web");
  const bookHuaBackWeb = document.getElementById("book-hua-back-web");
  const bookHuaModalClose = document.getElementById("book-hua-modal-close");
  if (bookHuaCopyAgain) {
    bookHuaCopyAgain.addEventListener("click", async () => {
      if (!lastBookHuaHtml) return;
      const plainBody = lastBookHuaPlain || buildHuaBookingEmailBody(emptyArrivalRecord(), null);
      const copied = await copyHuaBookingHtmlToClipboard(lastBookHuaHtml, plainBody);
      const status = document.getElementById("book-hua-modal-copy-status");
      if (status) {
        status.textContent = copied
          ? "Copied again — paste in Outlook with Cmd+V or Ctrl+V."
          : "Copy failed. Try downloading the .eml file instead.";
      }
    });
  }
  if (bookHuaOpenWeb) {
    bookHuaOpenWeb.addEventListener("click", () => openOutlookWebComposeOnce());
  }
  if (bookHuaBackWeb) {
    bookHuaBackWeb.addEventListener("click", () => showBookHuaView("choose"));
  }
  const bookHuaRedownloadEml = document.getElementById("book-hua-redownload-eml");
  const bookHuaOpenDesktop = document.getElementById("book-hua-open-desktop");
  const bookHuaBackDesktop = document.getElementById("book-hua-back-desktop");
  const bookHuaModalCloseDesktop = document.getElementById("book-hua-modal-close-desktop");
  if (bookHuaRedownloadEml) {
    bookHuaRedownloadEml.addEventListener("click", () => {
      if (!pendingBookHua) return;
      downloadHuaBookingEml(pendingBookHua.arrival, pendingBookHua.event);
    });
  }
  if (bookHuaOpenDesktop) {
    bookHuaOpenDesktop.addEventListener("click", () => triggerOutlookDesktopProtocol(HUA_BOOKING_SUBJECT));
  }
  if (bookHuaBackDesktop) {
    bookHuaBackDesktop.addEventListener("click", () => showBookHuaView("choose"));
  }
  if (bookHuaModalCloseDesktop) {
    bookHuaModalCloseDesktop.addEventListener("click", () => hideBookHuaModal());
  }
  if (bookHuaModalClose) {
    bookHuaModalClose.addEventListener("click", () => hideBookHuaModal());
  }

  document.getElementById("pdf-input").addEventListener("change", async (e) => {
    await importPdfFiles(e.target.files);
    e.target.value = "";
  });

  const pdfFolderInput = document.getElementById("pdf-folder-input");
  if (pdfFolderInput) {
    pdfFolderInput.addEventListener("change", async (e) => {
      await importPdfFiles(e.target.files);
      e.target.value = "";
    });
  }

  async function importPdfFiles(fileList) {
    if (!fileList || !fileList.length) return;
    let added = 0;
    let skipped = 0;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!/\.pdf$/i.test(file.name)) {
        skipped++;
        continue;
      }
      const parsed = parseEventFileName(file.name);
      if (!parsed) {
        skipped++;
        continue;
      }
      const key = eventKey({ date: parsed.date, title: parsed.title });
      const existingIdx = localEvents.findIndex((ev) => eventKey(ev) === key);
      if (existingIdx >= 0) {
        localEvents[existingIdx].fileName = file.name;
        try {
          await putPdfBlob(localEvents[existingIdx].id, file);
        } catch (err) {
          console.warn("Could not store PDF for preview:", err);
        }
      } else {
        const id =
          parsed.date +
          "-" +
          parsed.title.replace(/\s+/g, "-").slice(0, 40) +
          "-" +
          Math.random().toString(36).slice(2, 8);
        localEvents.push({
          id,
          date: parsed.date,
          title: parsed.title,
          fileName: file.name,
          source: "local",
        });
        try {
          await putPdfBlob(id, file);
        } catch (err) {
          console.warn("Could not store PDF for preview:", err);
        }
      }
      added++;
    }
    saveEvents();
    renderPdfList();
    renderCalendar();
    renderPdfPreview();
    if (added === 0 && skipped > 0) {
      alert(
        "Could not read dates from file names. Examples: 06.01 Spring Gala.pdf, 6.01 Spring Gala.pdf, 6.1-Spring Gala.pdf"
      );
    } else if (added > 0 && skipped > 0) {
      alert(`Added ${added} flyer${added === 1 ? "" : "s"}. Skipped ${skipped} file${skipped === 1 ? "" : "s"} (not PDF or unrecognised name).`);
    }
  }

  document.getElementById("clear-flyers").addEventListener("click", async () => {
    if (!localEvents.length) {
      alert("No local flyer uploads to clear. Hosted flyers from the site are kept.");
      return;
    }
    if (
      !confirm(
        "Remove your local flyer uploads from this browser? Hosted flyers from the site will stay on the calendar."
      )
    ) {
      return;
    }
    revokePreviewUrls();
    const localIds = new Set(localEvents.map((e) => e.id));
    localEvents = [];
    saveEvents();
    try {
      const db = await openPdfDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(PDF_STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        const store = tx.objectStore(PDF_STORE);
        for (const id of localIds) store.delete(id);
      });
    } catch (err) {
      console.warn("Could not clear local PDF storage:", err);
    }
    selectedDay = null;
    selectedEventId = null;
    renderPdfList();
    renderCalendar();
    renderPdfPreview();
  });

  document.getElementById("clear-arrivals").addEventListener("click", () => {
    if (!arrivals.length) {
      alert("No arrival data is loaded yet.");
      return;
    }
    if (!confirm("Remove all loaded arrivals from this browser?")) return;
    arrivals = [];
    saveArrivals();
    if (csvStatus) csvStatus.textContent = "";
    renderCalendar();
  });

  function guessCsvDelimiter(textSample) {
    const line = String(textSample).split(/\r?\n/)[0] || "";
    const comma = (line.match(/,/g) || []).length;
    const semi = (line.match(/;/g) || []).length;
    const tab = (line.match(/\t/g) || []).length;
    if (tab > comma && tab > semi && tab > 0) return "\t";
    if (semi > comma && semi > 0) return ";";
    return ",";
  }

  /**
   * Clarity/Hilton exports prepend title, parameters, and blank rows before the real header row.
   * Find the first line that contains the expected column names together.
   */
  function stripReportPreamble(text) {
    const lines = String(text ?? "").split(/\r?\n/);
    const markers = [
      "PROPERTY_DESC",
      "LEAD_ID",
      "RESV_TYPE",
      "ARRIVAL_DATE",
      "NIGHTS",
    ];
    for (let i = 0; i < lines.length; i++) {
      if (markers.every((m) => lines[i].includes(m))) {
        const skipped = i;
        return { csvBody: lines.slice(i).join("\n"), skippedHeaderLines: skipped };
      }
    }
    return { csvBody: text, skippedHeaderLines: 0 };
  }

  function resolveHeaderKey(fields, aliases) {
    for (const f of fields) {
      for (const a of aliases) {
        if (normalizeHeader(f) === normalizeHeader(a)) return f;
      }
    }
    return null;
  }

  function countResvValues(rows, fields, resvKeyHint) {
    const counts = new Map();
    let empty = 0;
    const resolvedKey =
      resvKeyHint || resolveHeaderKey(fields, RESV_TYPE_HEADER_ALIASES);
    for (const row of rows) {
      let raw = pickColumn(row, RESV_TYPE_HEADER_ALIASES);
      if ((raw === "" || raw === undefined || raw === null) && resolvedKey) {
        if (row[resolvedKey] != null && String(row[resolvedKey]).trim() !== "") {
          raw = row[resolvedKey];
        }
      }
      const s = String(raw ?? "").trim();
      if (!s) {
        empty++;
        continue;
      }
      const label = s.length > 32 ? s.slice(0, 29) + "…" : s;
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    return { top, empty };
  }

  document.getElementById("csv-input").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const { csvBody, skippedHeaderLines } = stripReportPreamble(raw);
      const delimiter = guessCsvDelimiter(csvBody);
      Papa.parse(csvBody, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        dynamicTyping: false,
        transformHeader: (h) => String(h ?? "").replace(/^\uFEFF/g, "").trim(),
        complete: (results) => {
          const rows = results.data.filter((row) => {
            const keys = Object.keys(row);
            return keys.some((k) => String(row[k] ?? "").trim() !== "");
          });
          const fields = results.meta.fields || [];
          const resvFieldKey = resolveHeaderKey(fields, RESV_TYPE_HEADER_ALIASES);

          function resvRawForRow(row) {
            let raw = pickColumn(row, RESV_TYPE_HEADER_ALIASES);
            if (
              (raw === "" || raw == null) &&
              resvFieldKey &&
              row[resvFieldKey] != null
            ) {
              raw = row[resvFieldKey];
            }
            return raw;
          }

          const next = [];
          let skippedType = 0;
          let skippedDate = 0;
          for (const row of rows) {
            const resvRaw = resvRawForRow(row);
            const resvType = normalizeResvType(resvRaw);
            if (!ALLOWED_RESV_TYPES.has(resvType)) {
              skippedType++;
              continue;
            }

            const leadId = String(
              pickColumn(row, ["LEAD_ID", "lead id", "leadid", "lead #", "lead"]) || ""
            ).trim();
            const guest = pickGuestName(row);
            const property = String(
              pickColumn(row, ["PROPERTY_DESC", "property", "unit", "home"]) || ""
            ).trim();
            const rawDate = pickColumn(row, [
              "ARRIVAL_DATE",
              "arrival date",
              "arrival",
              "check-in",
              "check in",
              "start date",
              "date",
            ]);
            const arrivalDate = parseArrivalDate(rawDate);
            if (!arrivalDate) {
              skippedDate++;
              continue;
            }
            const nights = parseNights(
              pickColumn(row, ["NIGHTS", "nights", "night", "los", "length"])
            );
            next.push({ leadId, guest, property, arrivalDate, nights, resvType });
          }
          arrivals = next;
          saveArrivals();

          const { top: resvBreakdown, empty: resvEmpty } = countResvValues(
            rows,
            fields,
            resvFieldKey
          );
          const breakdownStr =
            resvBreakdown.length > 0
              ? `RESV_TYPE counts in file: ${resvBreakdown.map(([k, v]) => `"${k}" ${v}`).join(", ")}${resvEmpty ? `, (blank) ${resvEmpty}` : ""}.`
              : "";

          const parts = [
            skippedHeaderLines
              ? `Skipped ${skippedHeaderLines} report/preamble line(s) before column headers.`
              : null,
            `Parsed with delimiter ${delimiter === "\t" ? "TAB" : delimiter === ";" ? "semicolon" : "comma"}.`,
            `Loaded ${arrivals.length} reservation(s) from ${file.name} (allowed types only).`,
            skippedType
              ? `${skippedType} row(s) skipped (RESV_TYPE not in allowed list — see counts below).`
              : null,
            skippedDate ? `${skippedDate} row(s) skipped (missing or invalid ARRIVAL_DATE).` : null,
            breakdownStr || null,
          ].filter(Boolean);

          if (arrivals.length === 0 && rows.length > 0) {
            const sampleRows = rows.slice(0, Math.min(500, rows.length));
            const nonempty = sampleRows
              .map((r) => String(resvRawForRow(r) ?? "").trim())
              .filter(Boolean);
            const uniq = [
              ...new Set(
                sampleRows.map((r) => String(resvRawForRow(r) ?? "").trim())
              ),
            ]
              .filter(Boolean)
              .slice(0, 25);
            const headerLine =
              fields.length > 0
                ? `Headers detected (${fields.length} cols): ${fields.slice(0, 35).join(" | ")}${fields.length > 35 ? " | …" : ""}.`
                : "";
            if (!resvFieldKey) {
              parts.push(
                `Could not find a RESV column in headers. Check spelling (expected RESV_TYPE). ${headerLine}`
              );
            } else if (nonempty.length === 0) {
              parts.push(
                `Column "${resvFieldKey}" has no non-empty values in the first rows.${headerLine}`
              );
            } else {
              parts.push(
                `Sample values: ${uniq.join(", ") || "(none)"}. Allowed: FIX, CLB, FCC, HGD, MAX, DRM, DFC, OW, OWU, DXT, OPD, DXP, MGV. ${headerLine}`
              );
            }
          }

          csvStatus.textContent = parts.filter(Boolean).join(" ");
          renderCalendar();
          e.target.value = "";
        },
        error: (err) => {
          csvStatus.textContent =
            "Error: " + (err && err.message ? err.message : "parse failed");
        },
      });
    };
    reader.onerror = () => {
      csvStatus.textContent = "Could not read file.";
    };
    reader.readAsText(file);
  });

  rebuildEvents();
  renderPdfList();
  renderCalendar();
  renderPdfPreview();
  Promise.all([loadHostedFlyers(), loadLiveTickets()]).then(() => {
    renderPdfList();
    renderCalendar();
    renderPdfPreview();
  });

  setInterval(() => {
    refreshLiveTickets().catch((err) => {
      console.warn("Live ticket refresh failed:", err);
    });
  }, TICKETS_REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshLiveTickets().catch(() => {});
    }
  });
})();

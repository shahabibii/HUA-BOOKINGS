(function () {
  "use strict";

  const DATA_URL = "../data/availability.json";
  const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const state = {
    data: null,
    officeId: "office48",
    monthKey: "",
    selectedDate: "",
    loading: false,
  };

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function pad2(n) {
    return n < 10 ? `0${n}` : `${n}`;
  }

  function parseMonthKey(key) {
    const match = /^(\d{4})-(\d{2})$/.exec(key || "");
    if (!match) return null;
    return { year: parseInt(match[1], 10), month: parseInt(match[2], 10) };
  }

  function formatMonthLabel(key) {
    const parsed = parseMonthKey(key);
    if (!parsed) return key;
    return `${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
  }

  function formatUpdatedAt(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatDayHeading(dateIso) {
    const d = new Date(`${dateIso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateIso;
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function firstWeekday(year, month) {
    return new Date(year, month - 1, 1).getDay();
  }

  function officeRecord() {
    return state.data?.offices?.[state.officeId] || null;
  }

  function monthRecord() {
    const office = officeRecord();
    if (!office?.months?.[state.monthKey]) return null;
    return office.months[state.monthKey];
  }

  function slotSpotsOpen(slot) {
    if (typeof slot?.spotsOpen === "number") return Math.max(0, slot.spotsOpen);
    return slot?.open ? 1 : 0;
  }

  function slotTotalSpots(slot) {
    if (typeof slot?.totalSpots === "number") return Math.max(0, slot.totalSpots);
    return 1;
  }

  function formatSlotStatus(slot) {
    if (slot.spotsOpen === 0) return slot.detail || "FULL";
    return `${slot.spotsOpen} OPEN`;
  }

  function normalizeSlot(slot) {
    const totalSpots = slotTotalSpots(slot);
    const spotsOpen =
      typeof slot.spotsOpen === "number" ? Math.max(0, slot.spotsOpen) : slot.open ? totalSpots : 0;
    return {
      time: slot.time,
      open: spotsOpen > 0,
      spotsOpen,
      totalSpots,
      detail: spotsOpen === 0 ? slot.detail || "FULL" : null,
    };
  }

  function dayAllotmentCounts(day) {
    if (!day?.slots?.length) return { openCount: 0, totalCount: 0 };
    if (typeof day.openCount === "number" && typeof day.totalCount === "number") {
      return { openCount: day.openCount, totalCount: day.totalCount };
    }
    let openCount = 0;
    let totalCount = 0;
    for (const slot of day.slots) {
      openCount += slotSpotsOpen(slot);
      totalCount += slotTotalSpots(slot);
    }
    return { openCount, totalCount };
  }

  function dayRecord(dateIso) {
    return monthRecord()?.days?.[dateIso] || null;
  }

  function listMonthKeysForOffice(officeId) {
    const months = state.data?.offices?.[officeId]?.months || {};
    return Object.keys(months).sort();
  }

  function listAllMonthKeys() {
    const keys = new Set();
    for (const office of Object.values(state.data?.offices || {})) {
      for (const key of Object.keys(office.months || {})) keys.add(key);
    }
    return [...keys].sort();
  }

  function monthStats(month) {
    let openSlots = 0;
    let fullSlots = 0;
    let daysWithData = 0;

    for (const day of Object.values(month?.days || {})) {
      if (!day?.slots?.length) continue;
      daysWithData += 1;
      const counts = dayAllotmentCounts(day);
      openSlots += counts.openCount;
      fullSlots += counts.totalCount - counts.openCount;
    }

    const total = openSlots + fullSlots;
    const rate = total > 0 ? Math.round((openSlots / total) * 100) : 0;
    return { openSlots, fullSlots, daysWithData, rate };
  }

  function pickDefaultMonth() {
    const officeMonths = listMonthKeysForOffice(state.officeId);
    if (officeMonths.length) {
      state.monthKey = officeMonths[officeMonths.length - 1];
      return;
    }
    const all = listAllMonthKeys();
    state.monthKey = all.length ? all[all.length - 1] : "";
  }

  function pickDefaultSelectedDate() {
    const month = monthRecord();
    const parsed = parseMonthKey(state.monthKey);
    if (!month || !parsed) {
      state.selectedDate = "";
      return;
    }

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
    if (month.days[todayKey]) {
      state.selectedDate = todayKey;
      return;
    }

    const sorted = Object.keys(month.days).sort();
    state.selectedDate = sorted[0] || `${parsed.year}-${pad2(parsed.month)}-01`;
  }

  async function loadData(options = {}) {
    state.loading = true;
    renderStatus();
    const url = options.cacheBust ? `${DATA_URL}?t=${Date.now()}` : DATA_URL;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
    } catch (err) {
      console.warn("Could not load availability.json", err);
      if (!state.data) state.data = { offices: {}, updatedAt: null };
    } finally {
      state.loading = false;
      if (!state.monthKey) pickDefaultMonth();
      pickDefaultSelectedDate();
      renderAll();
    }
  }

  function setOffice(officeId) {
    state.officeId = officeId;
    pickDefaultMonth();
    pickDefaultSelectedDate();
    renderAll();
  }

  function setMonth(monthKey) {
    state.monthKey = monthKey;
    pickDefaultSelectedDate();
    renderAll();
  }

  function setSelectedDate(dateIso) {
    state.selectedDate = dateIso;
    renderCalendar();
    renderDayPanel();
  }

  function renderStatus() {
    if (!els.updatedLabel) return;
    if (state.loading) {
      els.updatedLabel.textContent = "Loading…";
      return;
    }
    els.updatedLabel.textContent = `Updated ${formatUpdatedAt(state.data?.updatedAt)}`;
  }

  function renderOfficeTabs() {
    if (!els.officeTabs) return;
    els.officeTabs.replaceChildren();
    for (const [id, office] of Object.entries(state.data?.offices || {})) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avail-office-tab";
      if (id === state.officeId) btn.classList.add("is-active");
      btn.textContent = office.label || id;
      btn.addEventListener("click", () => setOffice(id));
      els.officeTabs.appendChild(btn);
    }
  }

  function renderMonthSelect() {
    if (!els.monthSelect) return;
    const months = listMonthKeysForOffice(state.officeId);
    els.monthSelect.replaceChildren();

    if (!months.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No data yet";
      els.monthSelect.appendChild(opt);
      els.monthSelect.disabled = true;
      return;
    }

    els.monthSelect.disabled = false;
    for (const key of months) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = formatMonthLabel(key);
      if (key === state.monthKey) opt.selected = true;
      els.monthSelect.appendChild(opt);
    }
  }

  function renderStats() {
    const month = monthRecord();
    const stats = monthStats(month);
    if (els.statOpen) els.statOpen.textContent = String(stats.openSlots);
    if (els.statFull) els.statFull.textContent = String(stats.fullSlots);
    if (els.statRate) els.statRate.textContent = `${stats.rate}%`;
  }

  function slotDots(slots, max = 10) {
    const frag = document.createDocumentFragment();
    const list = slots.slice(0, max);
    for (const slot of list) {
      const dot = document.createElement("span");
      dot.className = `avail-dot ${slotSpotsOpen(slot) > 0 ? "is-open" : "is-full"}`;
      dot.setAttribute("aria-hidden", "true");
      frag.appendChild(dot);
    }
    return frag;
  }

  function renderCalendar() {
    if (!els.calendarGrid || !els.calendarTitle) return;
    els.calendarGrid.replaceChildren();

    const parsed = parseMonthKey(state.monthKey);
    const month = monthRecord();
    if (!parsed) {
      els.calendarTitle.textContent = "No month selected";
      return;
    }

    const office = officeRecord();
    els.calendarTitle.textContent = `${formatMonthLabel(state.monthKey)} — ${office?.label || ""}`;

    const totalDays = daysInMonth(parsed.year, parsed.month);
    const lead = firstWeekday(parsed.year, parsed.month);

    for (let i = 0; i < lead; i += 1) {
      const pad = document.createElement("div");
      pad.className = "avail-cal-pad";
      pad.setAttribute("aria-hidden", "true");
      els.calendarGrid.appendChild(pad);
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const dateIso = `${parsed.year}-${pad2(parsed.month)}-${pad2(day)}`;
      const record = month?.days?.[dateIso];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avail-cal-day";
      if (dateIso === state.selectedDate) btn.classList.add("is-selected");
      if (!record) btn.classList.add("is-empty");

      const num = document.createElement("span");
      num.className = "avail-cal-day-num";
      num.textContent = String(day);
      btn.appendChild(num);

      if (record?.slots?.length) {
        const counts = dayAllotmentCounts(record);
        const ratio = document.createElement("span");
        ratio.className = "avail-cal-ratio";
        ratio.textContent = `${counts.openCount}/${counts.totalCount}`;
        btn.appendChild(ratio);

        const dots = document.createElement("span");
        dots.className = "avail-cal-dots";
        dots.appendChild(slotDots(record.slots));
        btn.appendChild(dots);

        if (counts.openCount === 0) btn.classList.add("is-full-day");
        else if (counts.openCount === counts.totalCount) btn.classList.add("is-all-open");
        else btn.classList.add("is-mixed");
      }

      btn.addEventListener("click", () => setSelectedDate(dateIso));
      els.calendarGrid.appendChild(btn);
    }
  }

  function renderDayPanel() {
    if (!els.dayTitle || !els.daySummary || !els.slotList) return;
    els.slotList.replaceChildren();

    const record = dayRecord(state.selectedDate);
    if (!record) {
      els.dayTitle.textContent = state.selectedDate ? formatDayHeading(state.selectedDate) : "Select a day";
      els.daySummary.replaceChildren();
      const empty = document.createElement("p");
      empty.className = "avail-day-empty";
      empty.textContent = "No wave data for this day yet. Data syncs from SharePoint via Power Automate.";
      els.slotList.appendChild(empty);
      return;
    }

    const counts = dayAllotmentCounts(record);
    els.dayTitle.textContent = formatDayHeading(state.selectedDate);
    els.daySummary.replaceChildren();

    const openPill = document.createElement("span");
    openPill.className = "avail-pill is-open";
    openPill.textContent = `${counts.openCount} open`;

    const fullPill = document.createElement("span");
    fullPill.className = "avail-pill is-full";
    fullPill.textContent = `${counts.totalCount - counts.openCount} booked`;

    els.daySummary.appendChild(openPill);
    els.daySummary.appendChild(fullPill);

    for (const slot of record.slots) {
      const normalized = normalizeSlot(slot);
      const row = document.createElement("div");
      row.className = `avail-slot ${normalized.open ? "is-open" : "is-full"}`;

      const time = document.createElement("span");
      time.className = "avail-slot-time";
      time.textContent = normalized.time;

      const status = document.createElement("span");
      status.className = "avail-slot-status";
      status.textContent = formatSlotStatus(normalized);

      row.appendChild(time);
      row.appendChild(status);
      els.slotList.appendChild(row);
    }
  }

  function renderAll() {
    renderStatus();
    renderOfficeTabs();
    renderMonthSelect();
    renderStats();
    renderCalendar();
    renderDayPanel();
  }

  function bindEvents() {
    els.refreshBtn?.addEventListener("click", () => loadData({ cacheBust: true }));
    els.monthSelect?.addEventListener("change", (e) => setMonth(e.target.value));
  }

  function init() {
    els.updatedLabel = $("avail-updated");
    els.refreshBtn = $("avail-refresh");
    els.officeTabs = $("avail-office-tabs");
    els.monthSelect = $("avail-month-select");
    els.statOpen = $("avail-stat-open");
    els.statFull = $("avail-stat-full");
    els.statRate = $("avail-stat-rate");
    els.calendarTitle = $("avail-calendar-title");
    els.calendarGrid = $("avail-calendar-grid");
    els.dayTitle = $("avail-day-title");
    els.daySummary = $("avail-day-summary");
    els.slotList = $("avail-slot-list");

    bindEvents();
    loadData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

// Notion Today: core logic shared by the popup, options page and background worker.

export const NOTION_VERSION = "2022-06-28";
export const DEFAULT_SOURCE = {
  dbId: "",
  mode: "headers", // "headers": day headers inside pages | "rows": one row per task
  dateProp: "",    // empty = first date property found
  statusProp: "",  // empty = first status property, else first checkbox property
  doneValue: "Done",
  todoValue: "Not started",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_ALT = "Mon(?:day)?|Tue(?:s|sday)?|Wed(?:nesday)?|Thu(?:rs|rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?";
const MONTH_ALT = MONTHS.map((m) => `${m}[a-z]*`).join("|");
const DAY_RE = new RegExp(`^\\s*(${DAY_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(${MONTH_ALT})\\b)?`, "i");
const ISO_RE = /^\s*(\d{4})-(\d{2})-(\d{2})\b/;
const WEEK_RE = new RegExp(`Week of\\s+(\\d{1,2})\\s+(${MONTH_ALT})`, "i");

const norm = (s) => s.charAt(0).toUpperCase() + s.slice(1, 3).toLowerCase();
const idx = (list, s) => list.indexOf(norm(s));
const dayIdx = (s) => idx(DAYS, s);
const monthIdx = (s) => idx(MONTHS, s);

// ---------- settings ----------

export async function getSettings() {
  const { token = "" } = await chrome.storage.local.get("token");
  const { sources = [] } = await chrome.storage.sync.get("sources");
  return { token, sources: sources.map((s) => ({ ...DEFAULT_SOURCE, ...s })) };
}

export async function saveSettings({ token, sources }) {
  await chrome.storage.local.set({ token });
  await chrome.storage.sync.set({ sources });
}

// Accepts a raw ID or any Notion database URL.
export function parseDbId(value) {
  const path = String(value).trim().split(/[?#]/)[0];
  const m = path.replace(/-/g, "").match(/[0-9a-f]{32}$/i);
  return m ? m[0].toLowerCase() : path;
}

// ---------- helpers ----------

export function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const text = (rt) => (rt || []).map((r) => r.plain_text).join("");

async function api(token, path, method = "GET", body) {
  const res = await fetch("https://api.notion.com/v1" + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = await res.text();
    try { msg = JSON.parse(msg).message; } catch { /* keep raw text */ }
    if (res.status === 404) msg += " (share the database with your integration: ••• > Connections)";
    throw new Error(`Notion ${res.status}: ${msg}`);
  }
  return res.json();
}

async function paginate(fn) {
  const out = [];
  let cursor;
  do {
    const r = await fn(cursor);
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

const children = (token, id) =>
  paginate((c) => api(token, `/blocks/${id}/children?page_size=100${c ? `&start_cursor=${c}` : ""}`));

const queryDb = (token, id, filter) =>
  paginate((c) => api(token, `/databases/${id}/query`, "POST", { filter, page_size: 100, start_cursor: c }));

function pickProp(schema, name, ...types) {
  if (name) {
    if (!schema[name]) throw new Error(`Property "${name}" not found`);
    return { name, type: schema[name].type };
  }
  for (const t of types) {
    const e = Object.entries(schema).find(([, p]) => p.type === t);
    if (e) return { name: e[0], type: t };
  }
  return null;
}

function isDone(prop, src) {
  if (!prop) return false;
  if (prop.type === "checkbox") return prop.checkbox;
  if (prop.type === "status") return prop.status?.name === src.doneValue;
  if (prop.type === "select") return prop.select?.name === src.doneValue;
  return false;
}

function pageTitle(page) {
  const t = Object.values(page.properties).find((p) => p.type === "title");
  return text(t && t.title) || "Untitled";
}

const emoji = (obj, fallback) => (obj && obj.icon && obj.icon.type === "emoji" ? obj.icon.emoji : fallback);

// ---------- day header parsing ----------

function headerDate(line, ctx, today) {
  const iso = line.match(ISO_RE);
  if (iso) return { date: new Date(+iso[1], +iso[2] - 1, +iso[3]), len: iso[0].length };
  const m = line.match(DAY_RE);
  if (!m) return null;
  const day = Number(m[2]);
  let month, year = today.getFullYear();
  if (m[3]) month = monthIdx(m[3]);
  else if (ctx.month !== null) month = day < ctx.day ? (ctx.month + 1) % 12 : ctx.month;
  else month = today.getMonth();
  const d = new Date(year, month, day);
  if (d.getDay() !== dayIdx(m[1])) {
    // weekday disagrees: try the neighbouring years (headers around new year)
    for (const y of [year - 1, year + 1]) {
      const alt = new Date(y, month, day);
      if (alt.getDay() === dayIdx(m[1])) return { date: alt, len: m[0].length };
    }
    return { date: null, len: m[0].length };
  }
  return { date: d, len: m[0].length };
}

// Finds today's header line ("Wed 18", "Tue 1 Dec", "2026-11-18") and the to-dos under it.
// A header is a paragraph or heading_3 starting with a date. A "Week of 16 Nov" heading gives month context.
export function extractToday(blocks, today) {
  const target = isoLocal(today);
  const ctx = { month: null, day: null };
  let inToday = false, found = false, note = "";
  const tasks = [];

  for (const b of blocks) {
    const t = b.type;
    const line = b[t] && b[t].rich_text ? text(b[t].rich_text) : "";
    const isHeader = t === "paragraph" || t === "heading_3";

    if (t === "heading_1" || t === "heading_2" || t === "divider") {
      inToday = false;
      const w = line.match(WEEK_RE);
      if (w) { ctx.day = Number(w[1]); ctx.month = monthIdx(w[2]); }
      continue;
    }
    if (isHeader) {
      const h = headerDate(line, ctx, today);
      if (h) {
        inToday = !!h.date && isoLocal(h.date) === target;
        if (inToday) {
          found = true;
          note = line.slice(h.len).replace(/^[\s·:|,\-]+/, "").trim();
        }
      } else if (t === "heading_3") {
        inToday = false;
      }
      continue;
    }
    if (t === "to_do" && inToday) {
      tasks.push({ kind: "block", id: b.id, text: line, checked: b.to_do.checked });
    }
  }
  return { found, note, tasks };
}

// ---------- loading ----------

async function loadSource(token, src, today) {
  const dbId = parseDbId(src.dbId);
  const db = await api(token, `/databases/${dbId}`);
  const dbTitle = text(db.title) || "Untitled database";
  const dateProp = pickProp(db.properties, src.dateProp, "date");
  if (!dateProp) throw new Error(`"${dbTitle}" has no date property`);
  const statusProp = pickProp(db.properties, src.statusProp, "status", "checkbox");

  const iso = isoLocal(today);
  const weekAgo = isoLocal(new Date(today.getTime() - 7 * 864e5));
  const filter = src.mode === "rows"
    ? { and: [
        { property: dateProp.name, date: { on_or_before: iso } },
        { property: dateProp.name, date: { on_or_after: weekAgo } },
      ] }
    : { property: dateProp.name, date: { on_or_before: iso } };

  const pages = (await queryDb(token, dbId, filter)).filter((p) => {
    const d = p.properties[dateProp.name]?.date;
    if (!d) return false;
    const start = d.start.slice(0, 10);
    if (d.end) return d.end.slice(0, 10) >= iso;
    return src.mode === "rows" ? start === iso : start >= weekAgo;
  });

  if (src.mode === "rows") {
    const tasks = pages.map((p) => ({
      kind: "row",
      id: p.id,
      url: p.url,
      text: `${emoji(p, "").trim()} ${pageTitle(p)}`.trim(),
      checked: isDone(statusProp && p.properties[statusProp.name], src),
      statusProp,
      doneValue: src.doneValue,
      todoValue: src.todoValue,
    }));
    return tasks.length
      ? [{ key: dbId, title: dbTitle, icon: emoji(db, "🗂️"), url: db.url, note: "", tasks }]
      : [];
  }

  const active = pages.filter((p) => !isDone(statusProp && p.properties[statusProp.name], src));
  const groups = await Promise.all(active.map(async (p) => {
    const r = extractToday(await children(token, p.id), today);
    if (!r.found) return null;
    return { key: p.id, title: pageTitle(p), icon: emoji(p, "📄"), url: p.url, note: r.note, tasks: r.tasks };
  }));
  return groups.filter(Boolean);
}

export async function getTodayTasks() {
  const { token, sources } = await getSettings();
  if (!token) throw new Error("NO_TOKEN");
  if (!sources.length) throw new Error("NO_SOURCES");
  const today = new Date();
  const results = await Promise.allSettled(sources.map((s) => loadSource(token, s, today)));
  const groups = [], errors = [];
  results.forEach((r) => (r.status === "fulfilled" ? groups.push(...r.value) : errors.push(r.reason.message)));
  if (!groups.length && errors.length) throw new Error(errors.join("\n"));
  await chrome.storage.local.set({ cache: { date: isoLocal(today), groups, errors } });
  return { groups, errors };
}

export async function setChecked(task, checked) {
  const { token } = await getSettings();
  if (task.kind === "block") {
    await api(token, `/blocks/${task.id}`, "PATCH", { to_do: { checked } });
    return;
  }
  const p = task.statusProp;
  if (!p) throw new Error("This database has no status or checkbox property to update");
  const value =
    p.type === "checkbox" ? { checkbox: checked }
    : p.type === "status" ? { status: { name: checked ? task.doneValue : task.todoValue } }
    : { select: { name: checked ? task.doneValue : task.todoValue } };
  await api(token, `/pages/${task.id}`, "PATCH", { properties: { [p.name]: value } });
}

export async function describeSource(token, src) {
  const db = await api(token, `/databases/${parseDbId(src.dbId)}`);
  const date = pickProp(db.properties, src.dateProp, "date");
  const status = pickProp(db.properties, src.statusProp, "status", "checkbox");
  return { title: text(db.title), date: date && date.name, status: status && `${status.name} (${status.type})` };
}

export function remaining(groups) {
  return groups.reduce((n, g) => n + g.tasks.filter((t) => !t.checked).length, 0);
}

export async function updateBadge(groups) {
  const n = remaining(groups);
  await chrome.action.setBadgeText({ text: n ? String(n) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#2f6feb" });
}

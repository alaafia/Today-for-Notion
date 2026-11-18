import { getTodayTasks, setChecked, updateBadge, remaining, isoLocal } from "./notion.js";

const list = document.getElementById("list");
const count = document.getElementById("count");
const warn = document.getElementById("warn");
let groups = [];

document.getElementById("date").textContent =
  new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
document.getElementById("settings").onclick = () => chrome.runtime.openOptionsPage();
document.getElementById("refresh").onclick = () => load(true);

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  kids.forEach((k) => e.append(k));
  return e;
}

function setCount() {
  const n = remaining(groups);
  count.textContent = n ? String(n) : "";
}

function taskRow(t) {
  const cb = el("input", { type: "checkbox", checked: t.checked });
  const row = el("div", { className: "task" + (t.checked ? " done" : "") },
    el("label", {}, cb, el("span", { textContent: t.text })));
  if (t.url) row.append(el("a", { className: "open", href: t.url, target: "_blank", title: "Open in Notion", textContent: "↗" }));
  cb.onchange = async () => {
    t.checked = cb.checked;
    row.classList.toggle("done", t.checked);
    setCount();
    try {
      await setChecked(t, t.checked);
      await updateBadge(groups);
    } catch (e) {
      t.checked = !t.checked;
      cb.checked = t.checked;
      row.classList.toggle("done", t.checked);
      setCount();
      showWarn("Could not update Notion: " + e.message);
    }
  };
  return row;
}

function showWarn(msg) {
  warn.hidden = !msg;
  warn.textContent = msg || "";
}

function render(errors = []) {
  list.replaceChildren();
  setCount();
  showWarn(errors.length ? errors.join("\n") : "");
  if (!groups.length) {
    list.append(el("div", { className: "muted center", textContent: "Nothing planned for today 🎉" }));
    return;
  }
  for (const g of groups) {
    const box = el("section", { className: "group" });
    box.append(el("h2", {}, el("a", { href: g.url, target: "_blank", textContent: `${g.icon} ${g.title}` })));
    if (g.note) box.append(el("div", { className: "note muted", textContent: g.note }));
    g.tasks.forEach((t) => box.append(taskRow(t)));
    list.append(box);
  }
}

function setupHint(msg) {
  const a = el("a", { href: "#", textContent: "Open settings" });
  a.onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
  list.replaceChildren(el("div", { className: "center" }, msg + " ", a));
}

async function load(force) {
  if (!force) {
    const { cache } = await chrome.storage.local.get("cache");
    if (cache && cache.date === isoLocal(new Date())) { groups = cache.groups; render(cache.errors); }
  }
  try {
    const r = await getTodayTasks();
    groups = r.groups;
    render(r.errors);
    await updateBadge(groups);
  } catch (e) {
    if (e.message === "NO_TOKEN") return setupHint("Add your Notion integration secret first.");
    if (e.message === "NO_SOURCES") return setupHint("Add at least one Notion database.");
    list.replaceChildren(el("div", { className: "error", textContent: e.message }));
  }
}

load(false);

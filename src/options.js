import { getSettings, saveSettings, describeSource, parseDbId, DEFAULT_SOURCE } from "./notion.js";

const $ = (id) => document.getElementById(id);
const tpl = $("tpl");
const box = $("sources");
const FIELDS = ["dbId", "mode", "dateProp", "statusProp", "doneValue", "todoValue"];

function addSource(src = DEFAULT_SOURCE) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  FIELDS.forEach((f) => (node.querySelector(`[name=${f}]`).value = src[f] ?? DEFAULT_SOURCE[f]));
  node.querySelector(".remove").onclick = (e) => { e.preventDefault(); node.remove(); };
  box.append(node);
}

function read() {
  const sources = [...box.querySelectorAll(".source")]
    .map((n) => Object.fromEntries(FIELDS.map((f) => [f, n.querySelector(`[name=${f}]`).value.trim()])))
    .filter((s) => s.dbId)
    .map((s) => ({ ...s, dbId: parseDbId(s.dbId) }));
  return { token: $("token").value.trim(), sources };
}

const { token, sources } = await getSettings();
$("token").value = token;
(sources.length ? sources : [DEFAULT_SOURCE]).forEach(addSource);

$("add").onclick = () => addSource();
$("save").onclick = async () => {
  const s = read();
  await saveSettings(s);
  $("status").textContent = `Saved ✓ (${s.sources.length} database${s.sources.length === 1 ? "" : "s"})`;
};
$("test").onclick = async () => {
  const s = read();
  if (!s.token) return ($("status").textContent = "Paste your integration secret first.");
  $("status").textContent = "Testing…";
  const nodes = [...box.querySelectorAll(".source")].filter((n) => n.querySelector("[name=dbId]").value.trim());
  let ok = 0;
  await Promise.all(s.sources.map(async (src, i) => {
    const info = nodes[i].querySelector(".info");
    try {
      const d = await describeSource(s.token, src);
      info.textContent = `✓ ${d.title} · date: ${d.date || "none"} · status: ${d.status || "none"}`;
      info.style.color = "";
      ok++;
    } catch (e) {
      info.textContent = "✗ " + e.message;
      info.style.color = "#cf222e";
    }
  }));
  $("status").textContent = `${ok}/${s.sources.length} connected`;
};

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractToday, parseDbId } from "../src/notion.js";

const p = (s) => ({ type: "paragraph", paragraph: { rich_text: [{ plain_text: s }] } });
const h2 = (s) => ({ type: "heading_2", heading_2: { rich_text: [{ plain_text: s }] } });
const h3 = (s) => ({ type: "heading_3", heading_3: { rich_text: [{ plain_text: s }] } });
const todo = (s, checked = false) => ({ id: s, type: "to_do", to_do: { rich_text: [{ plain_text: s }], checked } });
const names = (r) => r.tasks.map((t) => t.text);

const page = [
  h2("Week of 16 Nov"),
  p("Tue 17 · Interview"), todo("x"),
  p("Wed 18 · Talks 1h30 · Total 2h"), todo("A"), todo("B", true),
  p("Thu 19"), todo("C"),
  h2("Week of 28 Nov"),
  p("Mon 30"), todo("D"),
  p("Tue 1 Dec · Talks"), todo("E"),
  h2("Notes"), todo("not a day task"),
];

test("matches today's short header and its note", () => {
  const r = extractToday(page, new Date(2026, 10, 18));
  assert.equal(r.found, true);
  assert.equal(r.note, "Talks 1h30 · Total 2h");
  assert.deepEqual(names(r), ["A", "B"]);
  assert.equal(r.tasks[1].checked, true);
});

test("explicit month in header", () => {
  assert.deepEqual(names(extractToday(page, new Date(2026, 11, 1))), ["E"]);
});

test("month from Week of context", () => {
  assert.deepEqual(names(extractToday(page, new Date(2026, 10, 30))), ["D"]);
});

test("no header for today", () => {
  assert.equal(extractToday(page, new Date(2026, 10, 25)).found, false);
});

test("a heading ends the day section", () => {
  const r = extractToday(page, new Date(2026, 11, 1));
  assert.ok(!names(r).includes("not a day task"));
});

test("long names, ISO dates and heading_3 headers", () => {
  const blocks = [h3("Wednesday 18 November"), todo("A"), h3("2026-11-19"), todo("B"), p("thu 19th nov"), todo("C")];
  assert.deepEqual(names(extractToday(blocks, new Date(2026, 10, 18))), ["A"]);
  assert.deepEqual(names(extractToday(blocks, new Date(2026, 10, 19))), ["B", "C"]);
});

test("weekday that does not match the date is ignored", () => {
  const blocks = [p("Mon 18 Nov"), todo("wrong")];
  assert.equal(extractToday(blocks, new Date(2026, 10, 18)).found, false);
});

test("parseDbId handles URLs and raw IDs", () => {
  const id = "b7844855546947059b4d1e512533b7eb";
  assert.equal(parseDbId(id), id);
  assert.equal(parseDbId("b7844855-5469-4705-9b4d-1e512533b7eb"), id);
  assert.equal(parseDbId(`https://www.notion.so/team/My-tracker-${id}?v=0123456789abcdef0123456789abcdef`), id);
});

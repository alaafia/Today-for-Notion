import { getTodayTasks, updateBadge } from "./notion.js";

async function refresh() {
  try {
    const { groups } = await getTodayTasks();
    await updateBadge(groups);
  } catch {
    await chrome.action.setBadgeText({ text: "" });
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create("refresh", { periodInMinutes: 30 });
  if (details.reason === "install") chrome.runtime.openOptionsPage();
  refresh();
});
chrome.runtime.onStartup.addListener(refresh);
chrome.alarms.onAlarm.addListener((a) => a.name === "refresh" && refresh());
chrome.storage.onChanged.addListener((changes) => {
  if (changes.token || changes.sources) refresh();
});

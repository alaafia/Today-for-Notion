# Notion Today

A Chrome extension that gathers **today's tasks** from your Notion workspace into one popup, even when they are spread across many pages.

![icon](src/icons/icon128.png)

## Features

* One popup with today's tasks from several Notion databases
* Check a task in the popup and it is checked in Notion too
* Badge on the toolbar icon with the number of tasks left, refreshed every 30 minutes
* Two ways to organise tasks (see below), mixable
* Light and dark mode
* No server, no tracking: the extension only talks to `api.notion.com` with your own integration secret

## Two supported setups

### 1. Day headers in pages

Each database row is a page (a project, a study plan, a talk prep) with a **date range**. Inside the page, a line starting with a date is followed by checkboxes:

```
## Week of 16 Nov

**Wed 18** · Talks 1h30 · Total 2h
[ ] Rehearse slides 1 to 5 · 30 min
[ ] OOP basics · 30 min

**Thu 19**
[ ] Angular setup · 1h
```

The popup shows the checkboxes under today's line, plus the text after the date as a note.

Recognised date lines (paragraph or heading 3):

| Format | Example |
| --- | --- |
| Short weekday and day | `Wed 18` |
| With month | `Tue 1 Dec`, `Wednesday 18 November`, `thu 19th nov` |
| ISO date | `2026-11-18` |

A heading such as `Week of 16 Nov` gives the month to the short lines below it. Without it, the current month is used. The weekday must match the date, so `Mon 18 Nov` is ignored when the 18th is a Wednesday.

Pages whose status is done are skipped. A page is read when its date range includes today, or when its single date is within the last 7 days.

### 2. Task rows

Each database row is one task with a **date** property. The popup lists rows dated today (or whose date range includes today and started in the last 7 days). Checking a row sets its status or checkbox property.

## Install

1. Clone this repo.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and select the `src` folder.
3. The settings page opens on first install. You can reopen it from the ⚙ button in the popup.

## Connect Notion

1. Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations) and create an **internal** integration.
2. Copy the **Internal Integration Secret** into the settings page.
3. In Notion, open each database you want to use, click `•••`, then **Connections**, and add your integration. Without this step Notion answers with a 404.
4. Paste the database URL (or its ID) in the settings page, pick the mode, then click **Test connection**.

### Advanced settings per database

| Setting | Default | Meaning |
| --- | --- | --- |
| Date property | first date property | Property holding the day or the date range |
| Status or checkbox property | first status property, else first checkbox | Used to skip finished pages and to tick rows |
| Done value | `Done` | Status or select option that means finished |
| Not done value | `Not started` | Option set when you untick a row |

## Development

```bash
npm test        # parser tests, Node 18 or newer, no dependencies
npm run zip     # builds notion-today.zip from src/ for the Chrome Web Store
```

Project layout:

```
src/
  manifest.json   Manifest V3
  notion.js       Notion API calls and the date header parser
  background.js   Badge refresh every 30 minutes
  popup.*         The popup
  options.*       Settings page
  icons/
tests/
  parser.test.mjs
```

## Privacy

The integration secret is stored in `chrome.storage.local` on your machine. The list of databases is stored in `chrome.storage.sync`. Requests go only to `https://api.notion.com`. The integration can only see pages you share with it.

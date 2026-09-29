# Spendly

**Student money, made simple.**

Spendly is a student-focused personal finance web app. It answers the questions you actually ask yourself: *How much do I have left? What did I spend on this month? Am I on budget? How close am I to my goal?* No accounts, no server, no spreadsheets — just open it and go.

Visually, Spendly borrows its dark, yellow-accented design language (rounded stat cards, pill tags, bold display type) from the FutureTech reference screens supplied for this project.

---

## Features

- **Dashboard** — balance, income, expenses, budget remaining, recent transactions, auto-generated spending insights, a weekly report and your top savings goal, all in one glance.
- **Transactions** — add, edit, delete; search, filter (type / category / payment method / date range) and sort.
- **Budgets** — one overall monthly budget plus per-category budgets, each with a progress bar and a status (on track / approaching / near limit / over budget).
- **Recurring expenses** — set up rent, subscriptions, a data plan, etc. Spendly checks for anything due whenever you open the app and logs it automatically (no duplicates).
- **Savings goals** — target amount, amount saved, optional target date, "Add Money" shortcut, visual progress.
- **Analytics** — spending by category (doughnut), income vs. expenses (bar, last 6 months), spending over time (line — daily / weekly / monthly), biggest expense and biggest category.
- **Streaks** — a light, non-gamey nudge showing your current and longest tracking streak and total transactions logged.
- **CSV export** — every transaction, one click, `spendly-transactions-YYYY-MM-DD.csv`.
- **Dark / light theme**, saved to your browser.
- **Installable (PWA)** — add it to your home screen / desktop.
- **Fully responsive** — built mobile-first, works up to desktop.
- **Accessible** — semantic HTML, labelled fields, visible focus states, keyboard-operable modals, reduced-motion support.
- **Private by default** — everything lives in `localStorage`. Nothing is sent anywhere.

---

## Tech stack

Plain HTML5, CSS3 and vanilla JavaScript (ES6+). No framework, no build step, no npm.

- **[Chart.js](https://www.chartjs.org/)** (via CDN) for the analytics charts.
- **`localStorage`** as the only data store.
- **Google Fonts** (Sora + Inter) for type.

---

## File structure

```
spendly/
├── index.html          All markup: nav, five views, all modals
├── style.css            Design tokens + every style, organized in numbered sections
├── script.js             App logic: config, storage, rendering, events (see section headers)
├── manifest.json          PWA manifest
├── sw.js                  Minimal service worker (app-shell caching)
├── README.md              You are here
└── assets/
    ├── icons/             PWA home-screen icons
    └── images/            (empty — add your own if you want custom art)
```

`script.js` is organized top-to-bottom exactly like this README's feature list: configuration, storage, data model, utilities, router, then one rendering section per view, then modal logic, event wiring, the recurring-expense engine, CSV export, demo data, and finally `init()`. Every section has a comment banner, so `Ctrl+F` for e.g. `10. ANALYTICS` gets you there fast.

---

## How to run it

1. Download / clone the `spendly` folder.
2. Open `index.html` directly in a browser, **or** (recommended, so the service worker and CSV download work exactly like production) right-click `index.html` in VS Code and choose **"Open with Live Server"** (install the *Live Server* extension first if you don't have it).
3. That's it — there's nothing to install, build or configure.

## How data is stored

Everything is kept in your browser's `localStorage`, under a handful of namespaced keys (`spendly.transactions`, `spendly.budgets`, `spendly.goals`, `spendly.recurring`, `spendly.settings`, `spendly.streak`). Refreshing or closing the tab does not lose your data — only **clearing your browser data** or using **"Clear all data"** in Spendly's own Settings menu will.

If stored data is ever missing or corrupted (e.g. edited by hand into invalid JSON), Spendly falls back to sensible empty defaults instead of crashing — see the `Storage.get()` function in `script.js`.

A transaction looks like this:

```js
{
  id: "m5f2k-abc123",
  type: "expense",           // "income" | "expense"
  amount: 5000,
  category: "Food",
  description: "Lunch at campus",
  date: "2026-09-28",         // YYYY-MM-DD
  paymentMethod: "Cash",
  createdAt: "2026-09-28T10:15:00.000Z"
}
```

## How to customize

All the knobs you're likely to want are in **one place**: the `CONFIG` object at the top of `script.js`.

### Change the currency

```js
const CONFIG = {
  currencySymbol: "₦",   // change to "$", "£", "€", etc.
  currencyCode: "NGN",
  locale: "en-NG",        // affects number/date formatting
  ...
```

### Change or add categories

```js
expenseCategories: [
  { name: "Food", icon: "🍔" },
  { name: "Transport", icon: "🚌" },
  // add / remove / rename freely — icons are just emoji strings
],
incomeCategories: [ ... ],
```

### Change the budget warning thresholds

```js
budgetThresholds: {
  approaching: 75,  // 0–74%  = normal, 75–89% = "approaching"
  near: 90,          // 90–100% = "near limit"
  over: 100          // 100%+   = "over budget"
},
```

Colors for each state live in `style.css` under `.progress-fill.state-*` and `.status-dot.state-*` — change the CSS variables, not the JS, if you want different colors.

### Change the app name

```js
appName: "Spendly",
```
(Also update the `<title>` and header text in `index.html` if you rename it.)

### Change the theme colors

Every color is a CSS variable at the top of `style.css` (`:root { ... }` for dark, `:root[data-theme="light"]` for light). Change `--color-accent` to re-skin the whole app in one line.

### Load demo data

Open **Settings** (gear icon, top right) → **Load demo data**. This adds ~28 sample transactions, an overall + a few category budgets, and two example goals, so you can see the app populated. It never runs automatically — a new install always starts empty. To remove the feature entirely during later development, delete the `loadDemoData()` function in `script.js` and its two call sites (Settings modal, footer link).

---

## How the application works (quick tour of `script.js`)

1. **`CONFIG`** — the settings block described above.
2. **`Storage`** — a thin, try/catch-wrapped wrapper around `localStorage.getItem` / `setItem`, so a corrupted or missing key never crashes the app.
3. **`state`** — a single in-memory object holding transactions, budgets, goals, recurring rules, settings, streak data and current UI state (active view, active filters). `persist(key)` writes the relevant slice of `state` back to `localStorage`.
4. **Utilities** — money/date formatting, category lookups, month/week helpers, budget-status calculation.
5. **Router** — `navigate(view)` shows/hides the right `<section class="view">`, updates the active nav link, and calls the matching render function. Views: `dashboard`, `transactions`, `budgets`, `goals`, `analytics`. The URL hash (`#budgets`, etc.) drives it, so back/forward and bookmarking work.
6. **Render functions** — one block per view (`renderDashboard`, `renderTransactionsView`, `renderBudgetsView`, `renderGoalsView`, `renderAnalyticsView`), each rebuilding its section's HTML from current `state`. Every render is a full re-render of that view's data — simple and easy to reason about at this scale.
7. **Modals** — one `<div class="modal-overlay">` per form in `index.html`; `openModal`/`closeModal` toggle a CSS class. Each form has its own `submit` listener that validates, mutates `state`, calls `persist(...)`, closes the modal and re-renders.
8. **Recurring engine** — `processRecurring()` runs once on load. For every recurring rule whose `nextDate` has passed, it logs a transaction (tagged with `recurringId` so it's never duplicated) and advances `nextDate` by the rule's frequency, looping until it's caught up.
9. **CSV export** — `exportCsv()` builds a CSV string in memory and triggers a download via a temporary `<a download>` link. No server involved.
10. **Demo data / clear data** — `loadDemoData()` and `clearAllData()`, both gated behind a confirmation dialog.
11. **`init()`** — wires up every button/listener once, runs the recurring engine, then calls `navigate()` for whatever view the URL hash points to (or the dashboard by default).

---

## Browser support & offline use

Works in any modern evergreen browser (Chrome, Edge, Firefox, Safari). The service worker (`sw.js`) caches the app shell on first visit so Spendly keeps working with a flaky or absent connection — but note that **service workers only run while a tab/window using them is open** (or briefly afterward); Spendly cannot do anything in the true background while fully closed, which is why recurring expenses are checked *on open*, not on a timer.

## Privacy

Spendly has no backend, no analytics, and no third-party tracking. The only external network calls are the Google Fonts stylesheet and the Chart.js library from a CDN — both purely static assets, neither of which receives your data. Everything you enter stays in this browser's `localStorage`.

---

Built as a starting point for you to keep developing in VS Code. Have fun with it.

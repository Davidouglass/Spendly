/* =============================================================
   SPENDLY — APPLICATION LOGIC
   Sections:
   1. Configuration (edit these to customize the app)
   2. Storage layer (localStorage wrapper, safe read/write)
   3. Data model + in-memory state
   4. Utility / formatting helpers
   5. Router (hash-based view switching)
   6. Rendering: Dashboard
   7. Rendering: Transactions
   8. Rendering: Budgets
   9. Rendering: Goals
   10. Rendering: Analytics + charts
   11. Modal helpers
   12. Event wiring
   13. Recurring transactions engine
   14. Demo data
   15. Init
   ============================================================= */

/* =========================== 1. CONFIGURATION =========================== */
const CONFIG = {
  appName: "Spendly",
  currencySymbol: "₦",
  currencyCode: "NGN",
  locale: "en-NG",

  // Percentage thresholds used to color budget progress bars / states.
  budgetThresholds: {
    approaching: 75,  // 75–89% = approaching
    near: 90,         // 90–100% = near limit
    over: 100         // 100%+  = over budget
  },

  expenseCategories: [
    { name: "Food", icon: "🍔" },
    { name: "Transport", icon: "🚌" },
    { name: "School", icon: "🎓" },
    { name: "Data & Airtime", icon: "📶" },
    { name: "Entertainment", icon: "🎬" },
    { name: "Shopping", icon: "🛍️" },
    { name: "Accommodation", icon: "🏠" },
    { name: "Health", icon: "💊" },
    { name: "Other", icon: "🔖" }
  ],

  incomeCategories: [
    { name: "Salary", icon: "💼" },
    { name: "Freelance", icon: "💻" },
    { name: "Allowance", icon: "🎁" },
    { name: "Business", icon: "📈" },
    { name: "Scholarship", icon: "🎓" },
    { name: "Gift", icon: "🎀" },
    { name: "Other", icon: "💰" }
  ],

  paymentMethods: ["Cash", "Bank Transfer", "Debit Card", "Mobile Payment", "Other"],

  storageKeys: {
    transactions: "spendly.transactions",
    budgets: "spendly.budgets",
    goals: "spendly.goals",
    recurring: "spendly.recurring",
    settings: "spendly.settings",
    streak: "spendly.streak"
  }
};

/* =========================== 2. STORAGE LAYER =========================== */
const Storage = {
  /** Safely read + JSON-parse a key, falling back to `fallback` on any error. */
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (err) {
      console.warn(`Spendly: could not read "${key}" from localStorage, using fallback.`, err);
      return fallback;
    }
  },
  /** Safely JSON-stringify + write a key. Returns true on success. */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`Spendly: could not write "${key}" to localStorage.`, err);
      Toast.show("Storage is full or unavailable — this change may not be saved.", "error");
      return false;
    }
  }
};

/* =========================== 3. DATA MODEL / STATE =========================== */
/**
 * Transaction: { id, type: 'income'|'expense', amount, category, description, date, paymentMethod, createdAt }
 * Budget:      { overall: number|null, categories: { [categoryName]: number } }
 * Goal:        { id, name, target, current, targetDate, createdAt }
 * Recurring:   { id, name, amount, category, frequency: 'weekly'|'monthly'|'yearly', nextDate, lastRunDate }
 */
const state = {
  transactions: Storage.get(CONFIG.storageKeys.transactions, []),
  budgets: Storage.get(CONFIG.storageKeys.budgets, { overall: null, categories: {} }),
  goals: Storage.get(CONFIG.storageKeys.goals, []),
  recurring: Storage.get(CONFIG.storageKeys.recurring, []),
  settings: Storage.get(CONFIG.storageKeys.settings, { theme: "dark" }),
  streak: Storage.get(CONFIG.storageKeys.streak, { lastLoggedDate: null, currentStreak: 0, longestStreak: 0 }),

  currentView: "dashboard",
  txFilters: { search: "", type: "all", category: "all", payment: "all", from: "", to: "", sort: "date-desc" },
  analyticsRange: "daily",
  charts: {}
};

function persist(key) {
  const map = {
    transactions: () => Storage.set(CONFIG.storageKeys.transactions, state.transactions),
    budgets: () => Storage.set(CONFIG.storageKeys.budgets, state.budgets),
    goals: () => Storage.set(CONFIG.storageKeys.goals, state.goals),
    recurring: () => Storage.set(CONFIG.storageKeys.recurring, state.recurring),
    settings: () => Storage.set(CONFIG.storageKeys.settings, state.settings),
    streak: () => Storage.set(CONFIG.storageKeys.streak, state.streak)
  };
  if (map[key]) map[key]();
}

/* =========================== 4. UTILITIES =========================== */
function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatMoney(amount) {
  const n = Number(amount) || 0;
  const formatted = Math.abs(n).toLocaleString(CONFIG.locale, { maximumFractionDigits: 0 });
  return `${n < 0 ? "-" : ""}${CONFIG.currencySymbol}${formatted}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateReadable(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d)) return isoDate;
  return d.toLocaleDateString(CONFIG.locale, { day: "numeric", month: "short", year: "numeric" });
}

function categoryIcon(name, type) {
  const list = type === "income" ? CONFIG.incomeCategories : CONFIG.expenseCategories;
  const found = list.find(c => c.name === name);
  return found ? found.icon : "💳";
}

function allCategoriesFlat() {
  return [...CONFIG.expenseCategories, ...CONFIG.incomeCategories].map(c => c.name);
}

function isSameMonth(dateStr, ref = new Date()) {
  const d = new Date(dateStr + "T00:00:00");
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function startOfWeek(ref = new Date()) {
  const d = new Date(ref);
  const day = d.getDay(); // 0 = Sunday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function isInThisWeek(dateStr, ref = new Date()) {
  const d = new Date(dateStr + "T00:00:00");
  const start = startOfWeek(ref);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return d >= start && d < end;
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}

function budgetState(percent) {
  const t = CONFIG.budgetThresholds;
  if (percent >= t.over) return "over";
  if (percent >= t.near) return "near";
  if (percent >= t.approaching) return "approaching";
  return "normal";
}

function budgetStateLabel(s) {
  return { normal: "On track", approaching: "Approaching limit", near: "Near limit", over: "Over budget" }[s] || "On track";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/* Derived totals ------------------------------------------------------- */
function totals() {
  let income = 0, expense = 0;
  for (const t of state.transactions) {
    if (t.type === "income") income += t.amount; else expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

function monthlyExpenses(ref = new Date()) {
  return state.transactions.filter(t => t.type === "expense" && isSameMonth(t.date, ref));
}

function monthlyIncome(ref = new Date()) {
  return state.transactions.filter(t => t.type === "income" && isSameMonth(t.date, ref));
}

function sumBy(arr, key = "amount") {
  return arr.reduce((s, t) => s + t[key], 0);
}

function spentByCategory(ref = new Date()) {
  const map = {};
  for (const t of monthlyExpenses(ref)) {
    map[t.category] = (map[t.category] || 0) + t.amount;
  }
  return map;
}

/* =========================== 5. ROUTER =========================== */
const VIEWS = ["dashboard", "transactions", "budgets", "goals", "analytics"];

function navigate(view) {
  if (!VIEWS.includes(view)) view = "dashboard";
  state.currentView = view;
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
  document.querySelectorAll(".nav-link").forEach(el => {
    el.classList.toggle("active", el.dataset.view === view);
  });
  document.getElementById("mobileNav").classList.remove("open");
  document.getElementById("navToggle").setAttribute("aria-expanded", "false");
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  renderCurrentView();
}

function renderCurrentView() {
  switch (state.currentView) {
    case "dashboard": renderDashboard(); break;
    case "transactions": renderTransactionsView(); break;
    case "budgets": renderBudgetsView(); break;
    case "goals": renderGoalsView(); break;
    case "analytics": renderAnalyticsView(); break;
  }
}

window.addEventListener("hashchange", () => {
  const view = location.hash.replace("#", "") || "dashboard";
  navigate(view);
});

/* =========================== 6. DASHBOARD =========================== */
function renderDashboard() {
  const t = totals();
  document.getElementById("statBalance").textContent = formatMoney(t.balance);
  document.getElementById("statIncome").textContent = formatMoney(t.income);
  document.getElementById("statExpenses").textContent = formatMoney(t.expense);

  const monthSpent = sumBy(monthlyExpenses());
  const budgetLeft = state.budgets.overall != null ? state.budgets.overall - monthSpent : null;
  document.getElementById("statBudgetLeft").textContent = budgetLeft != null ? formatMoney(budgetLeft) : "No budget set";

  renderStreakBar();
  renderTransactionList(document.getElementById("recentTransactionsList"), state.transactions.slice().sort(sortByDateDesc).slice(0, 6), true);
  renderInsights();
  renderDashBudgetSummary();
  renderWeeklyReport();
  renderDashTopGoal();
}

function renderStreakBar() {
  const el = document.getElementById("streakBar");
  const s = state.streak;
  const chips = [];
  if (s.currentStreak > 0) chips.push(`🔥 ${s.currentStreak}-day tracking streak`);
  if (state.transactions.length > 0) chips.push(`📊 ${state.transactions.length} transaction${state.transactions.length === 1 ? "" : "s"} recorded`);
  if (s.longestStreak > s.currentStreak) chips.push(`🏆 Best streak: ${s.longestStreak} days`);
  el.innerHTML = chips.map(c => `<span class="streak-chip">${c}</span>`).join("");
}

function renderInsights() {
  const el = document.getElementById("insightsGrid");
  const expenses = monthlyExpenses();
  const monthSpent = sumBy(expenses);

  if (state.transactions.length === 0) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <div class="empty-icon">💡</div>
      <strong>No insights yet</strong>
      <p>Add a few transactions and Spendly will start noticing patterns for you.</p>
    </div>`;
    return;
  }

  const insights = [];
  const byCat = spentByCategory();
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  if (catEntries.length > 0) {
    const [topCat, topAmt] = catEntries[0];
    insights.push(`You've spent ${formatMoney(topAmt)} on ${topCat} this month.`);
    if (monthSpent > 0) {
      insights.push(`${topCat} makes up ${Math.round((topAmt / monthSpent) * 100)}% of your spending this month.`);
    }
  }

  if (state.budgets.overall != null) {
    const left = state.budgets.overall - monthSpent;
    insights.push(left >= 0
      ? `You have ${formatMoney(left)} left in your monthly budget.`
      : `You're ${formatMoney(Math.abs(left))} over your monthly budget.`);
  }

  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const transportThis = sumBy(monthlyExpenses(now).filter(t => t.category === "Transport"));
  const transportLast = sumBy(monthlyExpenses(lastMonth).filter(t => t.category === "Transport"));
  if (transportLast > 0) {
    insights.push(transportThis > transportLast
      ? "Your Transport spending increased compared with last month."
      : transportThis < transportLast
        ? "Your Transport spending decreased compared with last month."
        : "Your Transport spending is unchanged from last month.");
  }

  if (expenses.length > 0) {
    const biggest = expenses.slice().sort((a, b) => b.amount - a.amount)[0];
    insights.push(`Your biggest expense this month was ${formatMoney(biggest.amount)} on ${biggest.description || biggest.category}.`);
  }

  if (insights.length === 0) {
    insights.push("Keep logging transactions — insights will appear here once there's enough data.");
  }

  el.innerHTML = insights.slice(0, 4).map(text => `
    <div class="insight-card">
      <div class="insight-icon">💡</div>
      <p class="insight-text">${escapeHtml(text)}</p>
    </div>`).join("");
}

function renderDashBudgetSummary() {
  const el = document.getElementById("dashBudgetSummary");
  const spent = sumBy(monthlyExpenses());
  if (state.budgets.overall == null) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎯</div>
      <strong>No budget set</strong>
      <p>Set a monthly budget to see how you're tracking.</p>
      <button class="btn btn-primary btn-sm" data-action="open-overall-budget">Set Budget</button>
    </div>`;
    el.querySelector("[data-action='open-overall-budget']").addEventListener("click", () => openOverallBudgetModal());
    return;
  }
  const pct = Math.min(100, Math.round((spent / state.budgets.overall) * 100) || 0);
  const s = budgetState((spent / state.budgets.overall) * 100 || 0);
  el.innerHTML = `
    <div class="budget-figure"><div class="figure-label">Spent this month</div><div class="figure-value">${formatMoney(spent)}</div></div>
    <div class="progress-track"><div class="progress-fill state-${s}" style="width:${pct}%"></div></div>
    <div class="budget-status-text"><span class="status-dot state-${s}"></span> ${budgetStateLabel(s)} · ${pct}% of ${formatMoney(state.budgets.overall)}</div>
  `;
}

function renderWeeklyReport() {
  const el = document.getElementById("weeklyReport");
  const start = startOfWeek();
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const label = `${start.toLocaleDateString(CONFIG.locale, { month: "short", day: "numeric" })}–${end.toLocaleDateString(CONFIG.locale, { day: "numeric" })}`;

  const weekTx = state.transactions.filter(t => isInThisWeek(t.date));
  const weekIncome = sumBy(weekTx.filter(t => t.type === "income"));
  const weekExpense = sumBy(weekTx.filter(t => t.type === "expense"));
  const byCat = {};
  weekTx.filter(t => t.type === "expense").forEach(t => byCat[t.category] = (byCat[t.category] || 0) + t.amount);
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const biggest = weekTx.filter(t => t.type === "expense").sort((a, b) => b.amount - a.amount)[0];

  el.innerHTML = `
    <p class="settings-hint" style="margin-bottom:14px;">This Week — ${label}</p>
    <div class="goal-figures"><span>Income</span><span class="value" style="color:var(--color-income)">${formatMoney(weekIncome)}</span></div>
    <div class="goal-figures"><span>Expenses</span><span class="value" style="color:var(--color-expense)">${formatMoney(weekExpense)}</span></div>
    <div class="goal-figures"><span>Balance</span><span class="value">${formatMoney(weekIncome - weekExpense)}</span></div>
    <div class="goal-figures"><span>Transactions</span><span class="value">${weekTx.length}</span></div>
    ${topCat ? `<div class="goal-figures"><span>Top category</span><span class="value">${escapeHtml(topCat[0])}</span></div>` : ""}
    ${biggest ? `<div class="goal-figures"><span>Biggest expense</span><span class="value">${formatMoney(biggest.amount)}</span></div>` : ""}
  `;
}

function renderDashTopGoal() {
  const el = document.getElementById("dashTopGoal");
  if (state.goals.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🏁</div>
      <strong>No goals yet</strong>
      <p>Start one — a laptop, a trip, an emergency fund.</p>
      <button class="btn btn-primary btn-sm" data-action="open-goal">New Goal</button>
    </div>`;
    el.querySelector("[data-action='open-goal']").addEventListener("click", () => openGoalModal());
    return;
  }
  const goal = state.goals.slice().sort((a, b) => (b.current / b.target) - (a.current / a.target))[0];
  const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
  el.innerHTML = `
    <div class="goal-card-title" style="margin-bottom:6px;">${escapeHtml(goal.name)}</div>
    <div class="goal-progress-pct">${pct}% saved</div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="goal-figures"><span>Saved</span><span class="value">${formatMoney(goal.current)}</span></div>
    <div class="goal-figures"><span>Target</span><span class="value">${formatMoney(goal.target)}</span></div>
  `;
}

/* =========================== 7. TRANSACTIONS =========================== */
function sortByDateDesc(a, b) { return (b.date + b.createdAt).localeCompare(a.date + a.createdAt); }

function renderTransactionList(container, list, compact = false) {
  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🧾</div>
      <strong>No transactions yet.</strong>
      <p>Add your first one and start tracking your money.</p>
    </div>`;
    return;
  }
  container.innerHTML = list.map(t => `
    <button type="button" class="tx-row" data-tx-id="${t.id}" aria-label="Edit transaction: ${escapeHtml(t.description)}">
      <span class="tx-icon">${categoryIcon(t.category, t.type)}</span>
      <span class="tx-main">
        <span class="tx-desc">${escapeHtml(t.description || t.category)}</span>
        <span class="tx-meta">${escapeHtml(t.category)} · ${formatDateReadable(t.date)}${compact ? "" : " · " + escapeHtml(t.paymentMethod)}</span>
      </span>
      <span class="tx-badge ${t.type}">${t.type === "income" ? "Income" : "Expense"}</span>
      <span class="tx-amount ${t.type}">${t.type === "income" ? "+" : "-"}${formatMoney(t.amount)}</span>
    </button>
  `).join("");
  container.querySelectorAll("[data-tx-id]").forEach(btn => {
    btn.addEventListener("click", () => openTransactionModal(btn.dataset.txId));
  });
}

function getFilteredSortedTransactions() {
  const f = state.txFilters;
  let list = state.transactions.filter(t => {
    if (f.type !== "all" && t.type !== f.type) return false;
    if (f.category !== "all" && t.category !== f.category) return false;
    if (f.payment !== "all" && t.paymentMethod !== f.payment) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!(t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))) return false;
    }
    return true;
  });
  switch (f.sort) {
    case "date-asc": list.sort((a, b) => -sortByDateDesc(a, b)); break;
    case "amount-desc": list.sort((a, b) => b.amount - a.amount); break;
    case "amount-asc": list.sort((a, b) => a.amount - b.amount); break;
    default: list.sort(sortByDateDesc);
  }
  return list;
}

function renderTransactionsView() {
  populateCategoryFilterOptions();
  populatePaymentFilterOptions();
  const list = getFilteredSortedTransactions();
  renderTransactionList(document.getElementById("allTransactionsList"), list, false);
}

function populateCategoryFilterOptions() {
  const sel = document.getElementById("filterCategory");
  const current = sel.value || "all";
  sel.innerHTML = `<option value="all">All</option>` + allCategoriesFlat()
    .filter((v, i, a) => a.indexOf(v) === i)
    .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  sel.value = current;
}
function populatePaymentFilterOptions() {
  const sel = document.getElementById("filterPayment");
  const current = sel.value || "all";
  sel.innerHTML = `<option value="all">All</option>` + CONFIG.paymentMethods.map(p => `<option value="${p}">${p}</option>`).join("");
  sel.value = current;
}

/* =========================== 8. BUDGETS =========================== */
function renderBudgetsView() {
  renderOverallBudgetPanel();
  renderCategoryBudgetsGrid();
  renderRecurringList();
}

function renderOverallBudgetPanel() {
  const el = document.getElementById("overallBudgetPanel");
  const spent = sumBy(monthlyExpenses());
  if (state.budgets.overall == null) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎯</div>
      <strong>No overall budget set</strong>
      <p>Give your month a spending limit to track against.</p>
    </div>`;
    return;
  }
  const remaining = state.budgets.overall - spent;
  const pct = Math.min(100, Math.round((spent / state.budgets.overall) * 100) || 0);
  const s = budgetState((spent / state.budgets.overall) * 100 || 0);
  el.innerHTML = `
    <div class="budget-overview">
      <div class="budget-overview-figures">
        <div class="budget-figure"><div class="figure-label">Budget</div><div class="figure-value">${formatMoney(state.budgets.overall)}</div></div>
        <div class="budget-figure"><div class="figure-label">Spent</div><div class="figure-value">${formatMoney(spent)}</div></div>
        <div class="budget-figure"><div class="figure-label">Remaining</div><div class="figure-value" style="color:${remaining < 0 ? "var(--color-danger)" : "var(--color-text)"}">${formatMoney(remaining)}</div></div>
      </div>
    </div>
    <div class="progress-track"><div class="progress-fill state-${s}" style="width:${pct}%"></div></div>
    <div class="budget-status-text"><span class="status-dot state-${s}"></span> ${budgetStateLabel(s)} · ${pct}% used</div>
  `;
}

function renderCategoryBudgetsGrid() {
  const el = document.getElementById("categoryBudgetsGrid");
  const cats = Object.keys(state.budgets.categories);
  if (cats.length === 0) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <div class="empty-icon">📂</div>
      <strong>No category budgets yet</strong>
      <p>Break your budget down — Food, Transport, Data, whatever matters most.</p>
    </div>`;
    return;
  }
  const byCat = spentByCategory();
  el.innerHTML = cats.map(cat => {
    const budget = state.budgets.categories[cat];
    const spent = byCat[cat] || 0;
    const remaining = budget - spent;
    const pct = Math.min(100, Math.round((spent / budget) * 100) || 0);
    const s = budgetState((spent / budget) * 100 || 0);
    return `
      <div class="budget-card" data-category="${escapeHtml(cat)}">
        <div class="budget-card-head">
          <span class="budget-card-icon">${categoryIcon(cat, "expense")}</span>
          <span class="budget-card-title">${escapeHtml(cat)}</span>
        </div>
        <div class="progress-track"><div class="progress-fill state-${s}" style="width:${pct}%"></div></div>
        <div class="budget-status-text"><span class="status-dot state-${s}"></span> ${budgetStateLabel(s)} · ${pct}%</div>
        <div class="budget-card-figures">
          <span>Spent <strong>${formatMoney(spent)}</strong></span>
          <span>Left <strong style="color:${remaining < 0 ? "var(--color-danger)" : "var(--color-text)"}">${formatMoney(remaining)}</strong></span>
        </div>
      </div>`;
  }).join("");
  el.querySelectorAll(".budget-card").forEach(card => {
    card.addEventListener("click", () => openCategoryBudgetModal(card.dataset.category));
  });
}

function renderRecurringList() {
  const el = document.getElementById("recurringList");
  if (state.recurring.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🔁</div>
      <strong>No recurring expenses set up</strong>
      <p>Add rent, subscriptions or a data plan and Spendly logs them automatically when due.</p>
    </div>`;
    return;
  }
  el.innerHTML = state.recurring.slice().sort((a, b) => a.nextDate.localeCompare(b.nextDate)).map(r => `
    <button type="button" class="tx-row" data-recurring-id="${r.id}">
      <span class="tx-icon">${categoryIcon(r.category, "expense")}</span>
      <span class="tx-main">
        <span class="tx-desc">${escapeHtml(r.name)}</span>
        <span class="tx-meta">${escapeHtml(r.category)} · ${r.frequency} · next ${formatDateReadable(r.nextDate)}</span>
      </span>
      <span class="tx-badge expense">${r.frequency}</span>
      <span class="tx-amount expense">${formatMoney(r.amount)}</span>
    </button>
  `).join("");
  el.querySelectorAll("[data-recurring-id]").forEach(btn => {
    btn.addEventListener("click", () => openRecurringModal(btn.dataset.recurringId));
  });
}

/* =========================== 9. GOALS =========================== */
function renderGoalsView() {
  const el = document.getElementById("goalsGrid");
  if (state.goals.length === 0) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <div class="empty-icon">🏁</div>
      <strong>No savings goals yet</strong>
      <p>Give something you're saving for a name and a number — Laptop, Emergency Fund, School Fees…</p>
      <button class="btn btn-primary btn-sm" data-action="open-goal">New Goal</button>
    </div>`;
    el.querySelector("[data-action='open-goal']").addEventListener("click", () => openGoalModal());
    return;
  }
  el.innerHTML = state.goals.map(g => {
    const pct = Math.min(100, Math.round((g.current / g.target) * 100));
    const remaining = Math.max(0, g.target - g.current);
    return `
      <div class="goal-card" data-goal-id="${g.id}">
        <div class="goal-card-head">
          <div>
            <div class="goal-card-title">${escapeHtml(g.name)}</div>
            <div class="goal-card-date">${g.targetDate ? "Target: " + formatDateReadable(g.targetDate) : "No target date"}</div>
          </div>
          <button type="button" class="goal-card-menu-btn" data-edit-goal="${g.id}" aria-label="Edit goal">✎</button>
        </div>
        <div class="goal-progress-pct">${pct}% saved${pct >= 100 ? " 🎉" : ""}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="goal-figures"><span>Saved</span><span class="value">${formatMoney(g.current)}</span></div>
        <div class="goal-figures"><span>Target</span><span class="value">${formatMoney(g.target)}</span></div>
        <div class="goal-figures"><span>Remaining</span><span class="value">${formatMoney(remaining)}</span></div>
        <div class="goal-actions">
          <button type="button" class="btn btn-primary btn-sm" data-add-money="${g.id}">Add Money</button>
          <button type="button" class="btn btn-outline btn-sm" data-edit-goal="${g.id}">Edit</button>
        </div>
      </div>`;
  }).join("");

  el.querySelectorAll("[data-add-money]").forEach(btn => btn.addEventListener("click", () => openGoalAddModal(btn.dataset.addMoney)));
  el.querySelectorAll("[data-edit-goal]").forEach(btn => btn.addEventListener("click", () => openGoalModal(btn.dataset.editGoal)));
}

/* =========================== 10. ANALYTICS + CHARTS =========================== */
function renderAnalyticsView() {
  const expenses = state.transactions.filter(t => t.type === "expense");
  const biggest = expenses.slice().sort((a, b) => b.amount - a.amount)[0];
  document.getElementById("statBiggestExpense").textContent = biggest ? formatMoney(biggest.amount) : formatMoney(0);

  const byCat = {};
  expenses.forEach(t => byCat[t.category] = (byCat[t.category] || 0) + t.amount);
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  document.getElementById("statBiggestCategory").textContent = topCat ? topCat[0] : "—";

  const daysTracked = new Set(state.transactions.map(t => t.date)).size || 1;
  const totalExpense = sumBy(expenses);
  document.getElementById("statAvgDaily").textContent = formatMoney(totalExpense / daysTracked);
  document.getElementById("statTxCount").textContent = state.transactions.length;

  renderCategoryChart(byCat);
  renderIncomeExpenseChart();
  renderOverTimeChart();
}

function toggleChartEmpty(canvasId, emptyId, isEmpty) {
  document.getElementById(canvasId).style.display = isEmpty ? "none" : "block";
  document.getElementById(emptyId).style.display = isEmpty ? "block" : "none";
}

function themeChartColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: styles.getPropertyValue("--color-text").trim(),
    grid: styles.getPropertyValue("--color-border").trim(),
    accent: styles.getPropertyValue("--color-accent").trim()
  };
}

const CHART_PALETTE = ["#F5C518", "#4ADE80", "#60A5FA", "#F87171", "#C084FC", "#FB923C", "#2DD4BF", "#F472B6", "#A3E635"];

function renderCategoryChart(byCat) {
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  toggleChartEmpty("chartCategory", "chartCategoryEmpty", entries.length === 0);
  if (entries.length === 0) return;
  const colors = themeChartColors();
  const ctx = document.getElementById("chartCategory");
  if (state.charts.category) state.charts.category.destroy();
  state.charts.category = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{ data: entries.map(e => e[1]), backgroundColor: CHART_PALETTE, borderWidth: 0 }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: "right", labels: { color: colors.text, boxWidth: 12, padding: 12, font: { family: "Inter" } } } }
    }
  });
}

function renderIncomeExpenseChart() {
  const months = lastNMonthKeys(6);
  const income = months.map(mk => sumBy(state.transactions.filter(t => t.type === "income" && monthKey(t.date) === mk)));
  const expense = months.map(mk => sumBy(state.transactions.filter(t => t.type === "expense" && monthKey(t.date) === mk)));
  const isEmpty = income.every(v => v === 0) && expense.every(v => v === 0);
  toggleChartEmpty("chartIncomeExpense", "chartIncomeExpenseEmpty", isEmpty);
  if (isEmpty) return;
  const colors = themeChartColors();
  const ctx = document.getElementById("chartIncomeExpense");
  if (state.charts.incomeExpense) state.charts.incomeExpense.destroy();
  state.charts.incomeExpense = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months.map(mk => monthLabel(mk)),
      datasets: [
        { label: "Income", data: income, backgroundColor: "#4ADE80", borderRadius: 6 },
        { label: "Expenses", data: expense, backgroundColor: "#F87171", borderRadius: 6 }
      ]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: colors.text }, grid: { display: false } },
        y: { ticks: { color: colors.text }, grid: { color: colors.grid } }
      },
      plugins: { legend: { labels: { color: colors.text } } }
    }
  });
}

function renderOverTimeChart() {
  const range = state.analyticsRange;
  let labels = [], data = [];
  const expenses = state.transactions.filter(t => t.type === "expense");

  if (range === "daily") {
    const days = lastNDates(14);
    labels = days.map(d => new Date(d + "T00:00:00").toLocaleDateString(CONFIG.locale, { day: "numeric", month: "short" }));
    data = days.map(d => sumBy(expenses.filter(t => t.date === d)));
  } else if (range === "weekly") {
    const weeks = lastNWeeks(8);
    labels = weeks.map(w => w.label);
    data = weeks.map(w => sumBy(expenses.filter(t => {
      const d = new Date(t.date + "T00:00:00");
      return d >= w.start && d < w.end;
    })));
  } else {
    const months = lastNMonthKeys(6);
    labels = months.map(monthLabel);
    data = months.map(mk => sumBy(expenses.filter(t => monthKey(t.date) === mk)));
  }

  const isEmpty = data.every(v => v === 0);
  toggleChartEmpty("chartOverTime", "chartOverTimeEmpty", isEmpty);
  if (isEmpty) return;
  const colors = themeChartColors();
  const ctx = document.getElementById("chartOverTime");
  if (state.charts.overTime) state.charts.overTime.destroy();
  state.charts.overTime = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Spending",
        data,
        borderColor: "#F5C518",
        backgroundColor: "rgba(245,197,24,0.15)",
        fill: true,
        tension: 0.35,
        pointRadius: 3
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: colors.text }, grid: { display: false } },
        y: { ticks: { color: colors.text }, grid: { color: colors.grid } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function lastNDates(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
function lastNMonthKeys(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
function monthLabel(mk) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(CONFIG.locale, { month: "short", year: "2-digit" });
}
function lastNWeeks(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ref = new Date(); ref.setDate(ref.getDate() - i * 7);
    const start = startOfWeek(ref);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    out.push({ start, end, label: start.toLocaleDateString(CONFIG.locale, { day: "numeric", month: "short" }) });
  }
  return out;
}

/* =========================== 11. MODAL HELPERS =========================== */
function openModal(id) { document.getElementById(id).classList.add("open"); document.body.style.overflow = "hidden"; }
function closeModal(id) { document.getElementById(id).classList.remove("open"); document.body.style.overflow = ""; }

document.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-modal]")) closeModal(e.target.dataset.closeModal);
  if (e.target.classList.contains("modal-overlay")) closeModal(e.target.id);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay.open").forEach(m => closeModal(m.id));
  }
});

/* ---- Toasts ---- */
const Toast = {
  show(message, type = "success") {
    const container = document.getElementById("toastContainer");
    const el = document.createElement("div");
    el.className = `toast ${type === "error" ? "error" : ""}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
};

/* ---- Confirm dialog ---- */
function confirmDialog(message, onConfirm) {
  document.getElementById("confirmModalMessage").textContent = message;
  const btn = document.getElementById("confirmModalConfirmBtn");
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener("click", () => {
    onConfirm();
    closeModal("confirmModalOverlay");
  });
  openModal("confirmModalOverlay");
}

/* ---- Transaction modal ---- */
function populateCategorySelect(selectEl, type) {
  const list = type === "income" ? CONFIG.incomeCategories : CONFIG.expenseCategories;
  selectEl.innerHTML = list.map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join("");
}

function setTxType(type) {
  document.getElementById("typeExpenseBtn").classList.toggle("active", type === "expense");
  document.getElementById("typeIncomeBtn").classList.toggle("active", type === "income");
  document.getElementById("typeExpenseBtn").dataset.active = type === "expense";
  populateCategorySelect(document.getElementById("txCategory"), type);
}

function openTransactionModal(txId = null) {
  const form = document.getElementById("txForm");
  form.reset();
  clearFieldErrors(form);
  document.getElementById("txId").value = "";
  document.getElementById("txDeleteBtn").style.display = "none";

  if (txId) {
    const t = state.transactions.find(x => x.id === txId);
    if (!t) return;
    document.getElementById("txModalTitle").textContent = "Edit Transaction";
    document.getElementById("txId").value = t.id;
    setTxType(t.type);
    document.getElementById("txAmount").value = t.amount;
    document.getElementById("txCategory").value = t.category;
    document.getElementById("txDescription").value = t.description;
    document.getElementById("txDate").value = t.date;
    document.getElementById("txPayment").value = t.paymentMethod;
    document.getElementById("txDeleteBtn").style.display = "inline-flex";
  } else {
    document.getElementById("txModalTitle").textContent = "Add Transaction";
    setTxType("expense");
    document.getElementById("txDate").value = todayISO();
  }
  openModal("txModalOverlay");
  document.getElementById("txAmount").focus();
}

function clearFieldErrors(form) {
  form.querySelectorAll(".field-error").forEach(e => e.textContent = "");
  form.querySelectorAll(".invalid").forEach(e => e.classList.remove("invalid"));
}

function updateStreakOnLog(dateStr) {
  const s = state.streak;
  const today = todayISO();
  if (s.lastLoggedDate === today) { /* already counted today */ }
  else {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yISO = yesterday.toISOString().slice(0, 10);
    s.currentStreak = (s.lastLoggedDate === yISO) ? s.currentStreak + 1 : 1;
    s.lastLoggedDate = today;
    s.longestStreak = Math.max(s.longestStreak, s.currentStreak);
    persist("streak");
  }
}

document.getElementById("txForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  clearFieldErrors(form);
  const type = document.getElementById("typeIncomeBtn").classList.contains("active") ? "income" : "expense";
  const amountEl = document.getElementById("txAmount");
  const categoryEl = document.getElementById("txCategory");
  const descEl = document.getElementById("txDescription");
  const dateEl = document.getElementById("txDate");
  const paymentEl = document.getElementById("txPayment");

  let valid = true;
  const amount = parseFloat(amountEl.value);
  if (isNaN(amount) || amount <= 0) {
    document.getElementById("txAmountError").textContent = "Enter an amount greater than zero.";
    amountEl.classList.add("invalid"); valid = false;
  }
  if (!categoryEl.value) {
    document.getElementById("txCategoryError").textContent = "Choose a category.";
    categoryEl.classList.add("invalid"); valid = false;
  }
  if (!descEl.value.trim()) {
    document.getElementById("txDescriptionError").textContent = "Add a short description.";
    descEl.classList.add("invalid"); valid = false;
  }
  if (!dateEl.value) { dateEl.value = todayISO(); }
  if (!valid) return;

  const id = document.getElementById("txId").value;
  if (id) {
    const t = state.transactions.find(x => x.id === id);
    Object.assign(t, { type, amount, category: categoryEl.value, description: descEl.value.trim(), date: dateEl.value, paymentMethod: paymentEl.value });
    Toast.show("Transaction updated.");
  } else {
    state.transactions.push({
      id: uid(), type, amount, category: categoryEl.value, description: descEl.value.trim(),
      date: dateEl.value, paymentMethod: paymentEl.value, createdAt: new Date().toISOString()
    });
    updateStreakOnLog(dateEl.value);
    Toast.show("Transaction added.");
  }
  persist("transactions");
  closeModal("txModalOverlay");
  renderCurrentView();
});

document.getElementById("txDeleteBtn").addEventListener("click", () => {
  const id = document.getElementById("txId").value;
  confirmDialog("Delete this transaction? This can't be undone.", () => {
    state.transactions = state.transactions.filter(t => t.id !== id);
    persist("transactions");
    closeModal("txModalOverlay");
    renderCurrentView();
    Toast.show("Transaction deleted.");
  });
});

/* ---- Budget modals ---- */
function openOverallBudgetModal() {
  document.getElementById("overallBudgetForm").reset();
  document.getElementById("overallBudgetError").textContent = "";
  document.getElementById("overallBudgetAmount").value = state.budgets.overall ?? "";
  openModal("overallBudgetModalOverlay");
}
document.getElementById("overallBudgetForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("overallBudgetAmount");
  const val = parseFloat(input.value);
  if (isNaN(val) || val < 0) {
    document.getElementById("overallBudgetError").textContent = "Enter a valid amount.";
    input.classList.add("invalid");
    return;
  }
  state.budgets.overall = val;
  persist("budgets");
  closeModal("overallBudgetModalOverlay");
  renderCurrentView();
  Toast.show("Overall budget saved.");
});

function openCategoryBudgetModal(category = null) {
  const form = document.getElementById("categoryBudgetForm");
  form.reset();
  clearFieldErrors(form);
  const sel = document.getElementById("categoryBudgetCategory");
  sel.innerHTML = CONFIG.expenseCategories.map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join("");
  document.getElementById("categoryBudgetDeleteBtn").style.display = "none";
  document.getElementById("categoryBudgetOriginal").value = "";

  if (category) {
    document.getElementById("categoryBudgetModalTitle").textContent = "Edit Category Budget";
    sel.value = category;
    sel.disabled = true;
    document.getElementById("categoryBudgetAmount").value = state.budgets.categories[category];
    document.getElementById("categoryBudgetOriginal").value = category;
    document.getElementById("categoryBudgetDeleteBtn").style.display = "inline-flex";
  } else {
    document.getElementById("categoryBudgetModalTitle").textContent = "Add Category Budget";
    sel.disabled = false;
  }
  openModal("categoryBudgetModalOverlay");
}
document.getElementById("categoryBudgetForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const category = document.getElementById("categoryBudgetCategory").value;
  const amountEl = document.getElementById("categoryBudgetAmount");
  const val = parseFloat(amountEl.value);
  if (isNaN(val) || val <= 0) {
    document.getElementById("categoryBudgetError").textContent = "Enter an amount greater than zero.";
    amountEl.classList.add("invalid");
    return;
  }
  state.budgets.categories[category] = val;
  persist("budgets");
  closeModal("categoryBudgetModalOverlay");
  renderCurrentView();
  Toast.show("Category budget saved.");
});
document.getElementById("categoryBudgetDeleteBtn").addEventListener("click", () => {
  const category = document.getElementById("categoryBudgetOriginal").value;
  confirmDialog(`Remove the budget for ${category}?`, () => {
    delete state.budgets.categories[category];
    persist("budgets");
    closeModal("categoryBudgetModalOverlay");
    renderCurrentView();
    Toast.show("Category budget removed.");
  });
});

/* ---- Goal modals ---- */
function openGoalModal(goalId = null) {
  const form = document.getElementById("goalForm");
  form.reset();
  document.getElementById("goalError").textContent = "";
  document.getElementById("goalId").value = "";
  document.getElementById("goalDeleteBtn").style.display = "none";

  if (goalId) {
    const g = state.goals.find(x => x.id === goalId);
    if (!g) return;
    document.getElementById("goalModalTitle").textContent = "Edit Goal";
    document.getElementById("goalId").value = g.id;
    document.getElementById("goalName").value = g.name;
    document.getElementById("goalTarget").value = g.target;
    document.getElementById("goalCurrent").value = g.current;
    document.getElementById("goalDate").value = g.targetDate || "";
    document.getElementById("goalDeleteBtn").style.display = "inline-flex";
  } else {
    document.getElementById("goalModalTitle").textContent = "New Savings Goal";
  }
  openModal("goalModalOverlay");
}
document.getElementById("goalForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("goalName").value.trim();
  const target = parseFloat(document.getElementById("goalTarget").value);
  const current = parseFloat(document.getElementById("goalCurrent").value) || 0;
  const targetDate = document.getElementById("goalDate").value;
  const errorEl = document.getElementById("goalError");

  if (!name || isNaN(target) || target <= 0) {
    errorEl.textContent = "Give the goal a name and a target amount greater than zero.";
    return;
  }
  const id = document.getElementById("goalId").value;
  if (id) {
    const g = state.goals.find(x => x.id === id);
    Object.assign(g, { name, target, current, targetDate });
    Toast.show("Goal updated.");
  } else {
    state.goals.push({ id: uid(), name, target, current, targetDate, createdAt: new Date().toISOString() });
    Toast.show("Goal created.");
  }
  persist("goals");
  closeModal("goalModalOverlay");
  renderCurrentView();
});
document.getElementById("goalDeleteBtn").addEventListener("click", () => {
  const id = document.getElementById("goalId").value;
  confirmDialog("Delete this goal? This can't be undone.", () => {
    state.goals = state.goals.filter(g => g.id !== id);
    persist("goals");
    closeModal("goalModalOverlay");
    renderCurrentView();
    Toast.show("Goal deleted.");
  });
});

function openGoalAddModal(goalId) {
  document.getElementById("goalAddForm").reset();
  document.getElementById("goalAddError").textContent = "";
  document.getElementById("goalAddId").value = goalId;
  openModal("goalAddModalOverlay");
}
document.getElementById("goalAddForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = document.getElementById("goalAddId").value;
  const amountEl = document.getElementById("goalAddAmount");
  const val = parseFloat(amountEl.value);
  if (isNaN(val) || val <= 0) {
    document.getElementById("goalAddError").textContent = "Enter an amount greater than zero.";
    return;
  }
  const g = state.goals.find(x => x.id === id);
  g.current += val;
  persist("goals");
  closeModal("goalAddModalOverlay");
  renderCurrentView();
  Toast.show(`${formatMoney(val)} added to ${g.name}.`);
});

/* ---- Recurring modals ---- */
function openRecurringModal(id = null) {
  const form = document.getElementById("recurringForm");
  form.reset();
  document.getElementById("recurringError").textContent = "";
  document.getElementById("recurringId").value = "";
  document.getElementById("recurringDeleteBtn").style.display = "none";
  const sel = document.getElementById("recurringCategory");
  sel.innerHTML = CONFIG.expenseCategories.map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join("");

  if (id) {
    const r = state.recurring.find(x => x.id === id);
    if (!r) return;
    document.getElementById("recurringModalTitle").textContent = "Edit Recurring Expense";
    document.getElementById("recurringId").value = r.id;
    document.getElementById("recurringName").value = r.name;
    document.getElementById("recurringAmount").value = r.amount;
    sel.value = r.category;
    document.getElementById("recurringFrequency").value = r.frequency;
    document.getElementById("recurringNextDate").value = r.nextDate;
    document.getElementById("recurringDeleteBtn").style.display = "inline-flex";
  } else {
    document.getElementById("recurringModalTitle").textContent = "Add Recurring Expense";
    document.getElementById("recurringNextDate").value = todayISO();
  }
  openModal("recurringModalOverlay");
}
document.getElementById("recurringForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("recurringName").value.trim();
  const amount = parseFloat(document.getElementById("recurringAmount").value);
  const category = document.getElementById("recurringCategory").value;
  const frequency = document.getElementById("recurringFrequency").value;
  const nextDate = document.getElementById("recurringNextDate").value;
  const errorEl = document.getElementById("recurringError");

  if (!name || isNaN(amount) || amount <= 0 || !nextDate) {
    errorEl.textContent = "Fill in a name, a valid amount and a next date.";
    return;
  }
  const id = document.getElementById("recurringId").value;
  if (id) {
    const r = state.recurring.find(x => x.id === id);
    Object.assign(r, { name, amount, category, frequency, nextDate });
    Toast.show("Recurring expense updated.");
  } else {
    state.recurring.push({ id: uid(), name, amount, category, frequency, nextDate, lastRunDate: null });
    Toast.show("Recurring expense added.");
  }
  persist("recurring");
  closeModal("recurringModalOverlay");
  renderCurrentView();
});
document.getElementById("recurringDeleteBtn").addEventListener("click", () => {
  const id = document.getElementById("recurringId").value;
  confirmDialog("Delete this recurring expense?", () => {
    state.recurring = state.recurring.filter(r => r.id !== id);
    persist("recurring");
    closeModal("recurringModalOverlay");
    renderCurrentView();
    Toast.show("Recurring expense deleted.");
  });
});

/* =========================== 12. EVENT WIRING =========================== */
function wireNav() {
  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      location.hash = link.dataset.view;
    });
  });
  document.getElementById("navToggle").addEventListener("click", () => {
    const nav = document.getElementById("mobileNav");
    const isOpen = nav.classList.toggle("open");
    document.getElementById("navToggle").setAttribute("aria-expanded", String(isOpen));
  });
}

function wireTheme() {
  applyTheme(state.settings.theme || "dark");
  const toggle = () => {
    state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
    applyTheme(state.settings.theme);
    persist("settings");
    if (state.currentView === "analytics") renderAnalyticsView();
  };
  document.getElementById("themeToggle").addEventListener("click", toggle);
  document.getElementById("settingsThemeBtn").addEventListener("click", toggle);
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function wireSettings() {
  document.getElementById("settingsToggle").addEventListener("click", () => openModal("settingsModalOverlay"));
  document.getElementById("settingsDemoBtn").addEventListener("click", () => { loadDemoData(); closeModal("settingsModalOverlay"); });
  document.getElementById("settingsExportBtn").addEventListener("click", exportCsv);
  document.getElementById("settingsClearBtn").addEventListener("click", () => {
    confirmDialog("This permanently erases every transaction, budget, goal and setting stored in this browser. Continue?", () => {
      clearAllData();
      closeModal("settingsModalOverlay");
    });
  });
  document.getElementById("footerExportCsv").addEventListener("click", (e) => { e.preventDefault(); exportCsv(); });
  document.getElementById("footerLoadDemo").addEventListener("click", (e) => { e.preventDefault(); loadDemoData(); });
  document.getElementById("footerClearData").addEventListener("click", (e) => {
    e.preventDefault();
    confirmDialog("This permanently erases every transaction, budget, goal and setting stored in this browser. Continue?", clearAllData);
  });
}

function wireAddButtons() {
  document.getElementById("addTransactionBtn").addEventListener("click", () => openTransactionModal());
  document.getElementById("addTransactionBtn2").addEventListener("click", () => openTransactionModal());
  document.getElementById("setOverallBudgetBtn").addEventListener("click", () => openOverallBudgetModal());
  document.getElementById("addCategoryBudgetBtn").addEventListener("click", () => openCategoryBudgetModal());
  document.getElementById("addRecurringBtn").addEventListener("click", () => openRecurringModal());
  document.getElementById("addGoalBtn").addEventListener("click", () => openGoalModal());

  document.getElementById("typeExpenseBtn").addEventListener("click", () => setTxType("expense"));
  document.getElementById("typeIncomeBtn").addEventListener("click", () => setTxType("income"));

  document.querySelectorAll(".cta-card").forEach(card => {
    card.addEventListener("click", () => {
      const action = card.dataset.quick;
      if (action === "add-expense") openTransactionModal();
      else if (action === "set-budget") { location.hash = "budgets"; openOverallBudgetModal(); }
      else if (action === "add-goal") openGoalModal();
    });
  });
}

function wireFilters() {
  const ids = ["filterSearch", "filterType", "filterCategory", "filterPayment", "filterFrom", "filterTo", "filterSort"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    const evt = el.tagName === "SELECT" || el.type === "date" ? "change" : "input";
    el.addEventListener(evt, () => {
      state.txFilters = {
        search: document.getElementById("filterSearch").value,
        type: document.getElementById("filterType").value,
        category: document.getElementById("filterCategory").value,
        payment: document.getElementById("filterPayment").value,
        from: document.getElementById("filterFrom").value,
        to: document.getElementById("filterTo").value,
        sort: document.getElementById("filterSort").value
      };
      renderTransactionsView();
    });
  });
  document.getElementById("clearFiltersBtn").addEventListener("click", () => {
    state.txFilters = { search: "", type: "all", category: "all", payment: "all", from: "", to: "", sort: "date-desc" };
    ids.forEach(id => {
      const el = document.getElementById(id);
      el.value = id === "filterSort" ? "date-desc" : (el.tagName === "SELECT" ? "all" : "");
    });
    renderTransactionsView();
  });
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
}

function wireAnalyticsToggle() {
  document.querySelectorAll("#timeRangeToggle .seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#timeRangeToggle .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.analyticsRange = btn.dataset.range;
      renderOverTimeChart();
    });
  });
}

/* =========================== 13. RECURRING ENGINE =========================== */
function addMonths(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
function addWeeks(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}
function addYears(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}

function processRecurring() {
  const today = todayISO();
  let created = 0;
  state.recurring.forEach(r => {
    let guard = 0;
    while (r.nextDate <= today && guard < 24) { // guard prevents infinite loop on bad data
      // Avoid duplicate: only create if we haven't already logged this exact recurring run
      const alreadyLogged = state.transactions.some(t => t.recurringId === r.id && t.date === r.nextDate);
      if (!alreadyLogged) {
        state.transactions.push({
          id: uid(), type: "expense", amount: r.amount, category: r.category,
          description: r.name, date: r.nextDate, paymentMethod: "Other",
          createdAt: new Date().toISOString(), recurringId: r.id
        });
        created++;
      }
      r.lastRunDate = r.nextDate;
      r.nextDate = r.frequency === "weekly" ? addWeeks(r.nextDate, 1)
        : r.frequency === "yearly" ? addYears(r.nextDate, 1)
        : addMonths(r.nextDate, 1);
      guard++;
    }
  });
  if (created > 0) {
    persist("transactions");
    persist("recurring");
    Toast.show(`${created} recurring expense${created > 1 ? "s" : ""} logged automatically.`);
  }
}

/* =========================== 14. CSV EXPORT =========================== */
function exportCsv() {
  if (state.transactions.length === 0) {
    Toast.show("No transactions to export yet.", "error");
    return;
  }
  const rows = [["Date", "Type", "Category", "Description", "Amount", "Payment Method"]];
  state.transactions.slice().sort(sortByDateDesc).forEach(t => {
    rows.push([t.date, t.type, t.category, t.description, t.amount, t.paymentMethod]);
  });
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = todayISO();
  a.href = url;
  a.download = `spendly-transactions-${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  Toast.show("CSV exported.");
}
function csvEscape(val) {
  const s = String(val ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* =========================== 15. DEMO DATA =========================== */
function loadDemoData() {
  confirmDialog("Load sample data? This adds demo transactions, budgets and goals alongside anything already saved.", () => {
    const cats = CONFIG.expenseCategories.map(c => c.name);
    const incCats = CONFIG.incomeCategories.map(c => c.name);
    const demoTx = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(); d.setDate(d.getDate() - Math.floor(Math.random() * 45));
      demoTx.push({
        id: uid(), type: "expense",
        amount: Math.round((Math.random() * 15000 + 500)),
        category: cats[Math.floor(Math.random() * cats.length)],
        description: ["Lunch at campus", "Bus fare", "Textbook", "Airtime top-up", "Movie night", "Groceries", "Data bundle", "Clinic visit"][Math.floor(Math.random() * 8)],
        date: d.toISOString().slice(0, 10),
        paymentMethod: CONFIG.paymentMethods[Math.floor(Math.random() * CONFIG.paymentMethods.length)],
        createdAt: new Date().toISOString()
      });
    }
    for (let i = 0; i < 4; i++) {
      const d = new Date(); d.setDate(d.getDate() - Math.floor(Math.random() * 45));
      demoTx.push({
        id: uid(), type: "income",
        amount: Math.round((Math.random() * 60000 + 20000)),
        category: incCats[Math.floor(Math.random() * incCats.length)],
        description: "Monthly allowance",
        date: d.toISOString().slice(0, 10),
        paymentMethod: "Bank Transfer",
        createdAt: new Date().toISOString()
      });
    }
    state.transactions.push(...demoTx);
    state.budgets.overall = state.budgets.overall ?? 100000;
    state.budgets.categories = { ...state.budgets.categories, Food: 30000, Transport: 15000, "Data & Airtime": 10000, Entertainment: 10000 };
    if (state.goals.length === 0) {
      state.goals.push(
        { id: uid(), name: "New Laptop", target: 500000, current: 175000, targetDate: "", createdAt: new Date().toISOString() },
        { id: uid(), name: "Emergency Fund", target: 100000, current: 40000, targetDate: "", createdAt: new Date().toISOString() }
      );
    }
    persist("transactions"); persist("budgets"); persist("goals");
    renderCurrentView();
    Toast.show("Demo data loaded.");
  });
}

function clearAllData() {
  Object.values(CONFIG.storageKeys).forEach(k => localStorage.removeItem(k));
  state.transactions = [];
  state.budgets = { overall: null, categories: {} };
  state.goals = [];
  state.recurring = [];
  state.streak = { lastLoggedDate: null, currentStreak: 0, longestStreak: 0 };
  renderCurrentView();
  Toast.show("All data cleared.");
}

/* =========================== 16. INIT =========================== */
function init() {
  document.getElementById("footerYear").textContent = new Date().getFullYear();
  wireNav();
  wireTheme();
  wireSettings();
  wireAddButtons();
  wireFilters();
  wireAnalyticsToggle();

  try { processRecurring(); } catch (err) { console.error("Spendly: recurring engine failed", err); }

  const startView = location.hash.replace("#", "") || "dashboard";
  navigate(startView);
}

document.addEventListener("DOMContentLoaded", init);

/* Register the service worker so Spendly can be installed and used offline.
   Wrapped in feature detection + try/catch so it never breaks the app
   (e.g. when opened directly via file:// where service workers don't run). */
if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Spendly: service worker registration failed (this is fine, the app still works).", err);
    });
  });
}

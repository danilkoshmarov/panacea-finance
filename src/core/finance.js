/**
 * Pure financial calculations for Panacea Finance.
 * No DOM, IndexedDB, browser globals, or platform-specific APIs.
 */

const sum = (items, predicate, selector = item => item.amount) =>
  items.filter(predicate).reduce((total, item) => total + selector(item), 0);

export function calculateAccountBalance(account, transactions = [], transfers = []) {
  if (!account) return 0;
  const opening = Number(account.opening) || 0;
  const income = sum(transactions, item => item.accountId === account.id && item.type === 'income');
  const expenses = sum(transactions, item => item.accountId === account.id && item.type === 'expense');
  const incoming = sum(transfers, item => item.toId === account.id);
  const outgoing = sum(transfers, item => item.fromId === account.id);
  return opening + income - expenses + incoming - outgoing;
}

export function calculateFinancialTotals(accounts = [], transactions = [], transfers = []) {
  const balance = accounts.reduce(
    (total, account) => total + calculateAccountBalance(account, transactions, transfers),
    0
  );
  const income = sum(transactions, item => item.type === 'income');
  const expenses = sum(transactions, item => item.type === 'expense');
  return { balance, income, expenses, net: income - expenses };
}

export function calculateMonthlyAnalytics(transactions = [], month) {
  const items = transactions.filter(item => (item.date || '').slice(0, 7) === month);
  const income = sum(items, item => item.type === 'income');
  const expenses = sum(items, item => item.type === 'expense');
  const expensesByCategory = {};
  for (const item of items) {
    if (item.type === 'expense') {
      const category = item.category || 'Без категории';
      expensesByCategory[category] = (expensesByCategory[category] || 0) + item.amount;
    }
  }
  return {
    month,
    items,
    income,
    expenses,
    net: income - expenses,
    count: items.length,
    expensesByCategory: Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1])
  };
}

export function calculateMoveScenario({
  savings = 0,
  expectedIncome = 0,
  rent = 0,
  food = 0,
  transport = 0,
  otherMonthly = 0,
  oneTime = 0,
  reserveMonths = 0
} = {}) {
  const nonNegative = value => Math.max(0, Number(value) || 0);
  const monthlyExpenses =
    nonNegative(rent) +
    nonNegative(food) +
    nonNegative(transport) +
    nonNegative(otherMonthly);
  const monthlyNet = nonNegative(expectedIncome) - monthlyExpenses;
  const months = Math.min(24, nonNegative(reserveMonths));
  const required = nonNegative(oneTime) + monthlyExpenses * months;
  const gap = required - nonNegative(savings);

  let verdict;
  if (monthlyExpenses === 0 && nonNegative(oneTime) === 0) {
    verdict = 'incomplete';
  } else if (monthlyNet < 0) {
    verdict = 'unsustainable';
  } else if (gap > 0) {
    verdict = 'shortfall';
  } else {
    verdict = 'covered';
  }

  return { monthlyExpenses, monthlyNet, required, gap, reserveMonths: months, verdict };
}

export function calculateUnitEconomics({ sale = 0, cost = 0, otherCosts = 0, feePercent = 0 } = {}) {
  const revenue = Number(sale) || 0;
  const commission = revenue * ((Number(feePercent) || 0) / 100);
  const profit = revenue - (Number(cost) || 0) - (Number(otherCosts) || 0) - commission;
  return {
    revenue,
    commission,
    profit,
    marginPercent: revenue ? (profit / revenue) * 100 : 0
  };
}

export function calculateGoalProgress(current, target) {
  const goal = Number(target) || 0;
  if (goal <= 0) return 0;
  return Math.min(100, (Math.max(0, Number(current) || 0) / goal) * 100);
}

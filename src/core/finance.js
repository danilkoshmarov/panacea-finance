/**
 * Pure financial calculations for Panacea Finance.
 * No DOM, IndexedDB, browser globals, or platform-specific APIs.
 */

const sum = (items, predicate, selector = item => item.amount) =>
  items.filter(predicate).reduce((total, item) => total + selector(item), 0);

export function calculateAccountBalance(account, transactions = [], transfers = []) {
  if (!account) return 0;
  const opening = Number(account.opening) || 0;
  const activeTransactions = transactions.filter(item => !item.voided);\n  const income = sum(activeTransactions, item => item.accountId === account.id && item.type === 'income');
  const expenses = sum(activeTransactions, item => item.accountId === account.id && item.type === 'expense');
  const incoming = sum(transfers, item => item.toId === account.id);
  const outgoing = sum(transfers, item => item.fromId === account.id);
  return opening + income - expenses + incoming - outgoing;
}

export function calculateFinancialTotals(accounts = [], transactions = [], transfers = [], movements = []) {
  const balance = accounts.reduce(
    (total, account) => total + calculateAccountBalance(account, transactions, transfers),
    0
  );
  const activeTransactions = transactions.filter(item => !item.voided);\n  const income = sum(activeTransactions, item => item.type === 'income');
  const operatingExpenses = sum(activeTransactions, item => item.type === 'expense');
  const costOfGoodsSold = sum(movements, item => item.type === 'sale' && !item.voided, item => Number(item.cogs) || 0);
  const expenses = operatingExpenses + costOfGoodsSold;
  return { balance, income, expenses, net: income - expenses };
}

export function calculateMonthlyAnalytics(transactions = [], month, movements = []) {
  const items = transactions.filter(item => !item.voided && (item.date || '').slice(0, 7) === month);
  const monthMovements = movements.filter(item => item.type === 'sale' && !item.voided && (item.date || '').slice(0, 7) === month);
  const income = sum(items, item => item.type === 'income');
  const operatingExpenses = sum(items, item => item.type === 'expense');
  const costOfGoodsSold = sum(monthMovements, item => true, item => Number(item.cogs) || 0);
  const expenses = operatingExpenses + costOfGoodsSold;
  const expensesByCategory = {};
  for (const item of items) {
    if (item.type === 'expense') {
      const category = item.category || 'Без категории';
      expensesByCategory[category] = (expensesByCategory[category] || 0) + item.amount;
    }
  }
  if (costOfGoodsSold) expensesByCategory['Себестоимость проданного'] = costOfGoodsSold;
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

/**
 * Split balances and transaction totals by account purpose.
 * Transactions inherit their classification from the account they use.
 * Transfers between personal and business accounts move capital between
 * scopes without being counted as income or expenses.
 */
export function calculateFinancialTotalsByScope(accounts = [], transactions = [], transfers = [], movements = []) {
  const result = {};
  for (const scope of ['personal', 'business']) {
    const scopedAccounts = accounts.filter(account =>
      (account.scope || (account.type === 'Оборотный капитал' ? 'business' : 'personal')) === scope
    );
    const accountIds = new Set(scopedAccounts.map(account => account.id));
    const scopedTransactions = transactions.filter(item => accountIds.has(item.accountId));
    const scopedProjectIds = new Set(scopedTransactions.map(item => item.projectId).filter(id => id !== undefined));
    const scopedMovements = movements.filter(item => scopedProjectIds.has(item.projectId));
    result[scope] = calculateFinancialTotals(scopedAccounts, scopedTransactions, transfers, scopedMovements);
  }
  return result;
}


/**
 * Inventory value is an asset, not an expense.
 */
export function calculateInventoryValue(products = []) {
  return products.reduce((total, product) => {
    const quantity = Math.max(0, Number(product.quantity) || 0);
    const averageCost = Math.max(0, Number(product.averageCost) || 0);
    return total + quantity * averageCost;
  }, 0);
}

/**
 * Weighted-average cost keeps remaining stock valued consistently after purchases.
 */
export function calculateWeightedAverageCost(currentQuantity, currentAverageCost, addedQuantity, addedUnitCost) {
  const q1 = Number(currentQuantity);
  const c1 = Number(currentAverageCost);
  const q2 = Number(addedQuantity);
  const c2 = Number(addedUnitCost);
  if (![q1, c1, q2, c2].every(Number.isFinite) || q1 < 0 || c1 < 0 || q2 <= 0 || c2 < 0) {
    throw new Error('Invalid inventory cost inputs');
  }
  const totalQuantity = q1 + q2;
  return totalQuantity === 0 ? 0 : ((q1 * c1) + (q2 * c2)) / totalQuantity;
}

/**
 * Project P&L excludes inventory purchases from expenses and recognizes COGS
 * only when the goods are sold.
 */
export function calculateProjectTotals(projectId, transactions = [], accounts = [], movements = []) {
  const businessAccountIds = new Set(accounts
    .filter(account => (account.scope || (account.type === 'Оборотный капитал' ? 'business' : 'personal')) === 'business')
    .map(account => account.id));
  const items = transactions.filter(item => item.projectId === projectId && businessAccountIds.has(item.accountId));
  const income = sum(items, item => item.type === 'income');
  const expenses = sum(items, item => !item.voided && item.type === 'expense' && item.inventoryMovementType !== 'purchase');
  const costOfGoodsSold = sum(movements, item => item.projectId === projectId && item.type === 'sale' && !item.voided, item => item.cogs);
  return {
    income,
    expenses,
    costOfGoodsSold,
    profit: income - expenses - costOfGoodsSold,
    count: items.length
  };
}

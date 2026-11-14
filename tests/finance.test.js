import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAccountBalance,
  calculateFinancialTotals,
  calculateFinancialTotalsByScope,
  calculateProjectTotals,
  calculateInventoryValue,
  calculateWeightedAverageCost,
  calculateMonthlyAnalytics,
  calculateMoveScenario,
  calculateUnitEconomics,
  calculateGoalProgress
} from '../src/core/finance.js';

test('account balance includes income, expenses and transfers without treating transfers as income', () => {
  const account = { id: 1, opening: 1000 };
  const transactions = [
    { accountId: 1, type: 'income', amount: 500 },
    { accountId: 1, type: 'expense', amount: 200 }
  ];
  const transfers = [
    { fromId: 1, toId: 2, amount: 100 },
    { fromId: 2, toId: 1, amount: 50 }
  ];
  assert.equal(calculateAccountBalance(account, transactions, transfers), 1250);
});

test('financial totals sum operation types and account balances', () => {
  const accounts = [{ id: 1, opening: 100 }];
  const transactions = [
    { accountId: 1, type: 'income', amount: 80 },
    { accountId: 1, type: 'expense', amount: 30 }
  ];
  const totals = calculateFinancialTotals(accounts, transactions, []);
  assert.deepEqual(totals, { balance: 150, income: 80, expenses: 30, net: 50 });
});

test('sale revenue subtracts cost of goods sold from net result without reducing cash balance twice', () => {
  const accounts = [{ id: 1, opening: 100, scope: 'business' }];
  const transactions = [
    { id: 1, accountId: 1, type: 'income', amount: 500, inventoryMovementType: 'sale', projectId: 7 }
  ];
  const movements = [{ type: 'sale', projectId: 7, cogs: 250, date: '2026-11-11' }];
  const totals = calculateFinancialTotals(accounts, transactions, [], movements);
  assert.deepEqual(totals, { balance: 600, income: 500, expenses: 250, net: 250 });
  const scoped = calculateFinancialTotalsByScope(accounts, transactions, [], movements);
  assert.equal(scoped.business.net, 250);
  assert.equal(scoped.business.balance, 600);
});

test('monthly analytics filters by calendar month and groups expenses by category', () => {
  const transactions = [
    { date: '2026-11-02', type: 'income', amount: 100, category: 'Sales' },
    { date: '2026-11-03', type: 'expense', amount: 20, category: 'Food' },
    { date: '2026-11-04', type: 'expense', amount: 30, category: 'Food' },
    { date: '2026-10-31', type: 'income', amount: 900, category: 'Other' }
  ];
  const result = calculateMonthlyAnalytics(transactions, '2026-11');
  assert.equal(result.income, 100);
  assert.equal(result.expenses, 50);
  assert.equal(result.net, 50);
  assert.equal(result.count, 3);
  assert.deepEqual(result.expensesByCategory, [['Food', 50]]);
});

test('move scenario computes reserve and identifies an income shortfall', () => {
  const result = calculateMoveScenario({
    savings: 20000, expectedIncome: 25000, rent: 15000, food: 8000,
    transport: 2000, otherMonthly: 3000, oneTime: 10000, reserveMonths: 2
  });
  assert.equal(result.monthlyExpenses, 28000);
  assert.equal(result.monthlyNet, -3000);
  assert.equal(result.required, 66000);
  assert.equal(result.gap, 46000);
  assert.equal(result.verdict, 'unsustainable');
});

test('unit economics includes percentage commission in profit and margin', () => {
  const result = calculateUnitEconomics({ sale: 1000, cost: 600, otherCosts: 50, feePercent: 10 });
  assert.equal(result.commission, 100);
  assert.equal(result.profit, 250);
  assert.equal(result.marginPercent, 25);
});

test('goal progress is capped and handles invalid targets', () => {
  assert.equal(calculateGoalProgress(150, 100), 100);
  assert.equal(calculateGoalProgress(50, 0), 0);
});

test('personal and business finances stay separate while cross-scope transfers only move capital', () => {
  const accounts = [
    { id: 1, opening: 1000, scope: 'personal' },
    { id: 2, opening: 500, scope: 'business' }
  ];
  const transactions = [
    { accountId: 1, type: 'income', amount: 300 },
    { accountId: 1, type: 'expense', amount: 100 },
    { accountId: 2, type: 'income', amount: 800 },
    { accountId: 2, type: 'expense', amount: 250 }
  ];
  const transfers = [{ fromId: 1, toId: 2, amount: 200 }];
  const result = calculateFinancialTotalsByScope(accounts, transactions, transfers);
  assert.deepEqual(result.personal, { balance: 1000, income: 300, expenses: 100, net: 200 });
  assert.deepEqual(result.business, { balance: 1250, income: 800, expenses: 250, net: 550 });
});

test('legacy accounts without scope are classified safely', () => {
  const accounts = [
    { id: 1, opening: 100, type: 'Оборотный капитал' },
    { id: 2, opening: 50, type: 'Банковская карта' }
  ];
  const result = calculateFinancialTotalsByScope(accounts, [], []);
  assert.equal(result.business.balance, 100);
  assert.equal(result.personal.balance, 50);
});


test('project totals include only linked transactions on business accounts', () => {
  const accounts = [
    { id: 1, scope: 'business' },
    { id: 2, scope: 'personal' }
  ];
  const transactions = [
    { id: 1, projectId: 10, accountId: 1, type: 'income', amount: 1200 },
    { id: 2, projectId: 10, accountId: 1, type: 'expense', amount: 450 },
    { id: 3, projectId: 10, accountId: 2, type: 'income', amount: 900 },
    { id: 4, projectId: 11, accountId: 1, type: 'income', amount: 500 }
  ];
  const movements = [{ projectId: 10, type: 'sale', cogs: 300 }];
  assert.deepEqual(calculateProjectTotals(10, transactions, accounts, movements), {
    income: 1200, expenses: 450, costOfGoodsSold: 300, profit: 450, count: 2
  });
});


test('weighted average cost recalculates after a new purchase', () => {
  assert.equal(calculateWeightedAverageCost(10, 100, 10, 160), 130);
  assert.equal(calculateWeightedAverageCost(0, 0, 5, 75), 75);
});

test('inventory is valued as an asset at weighted average cost', () => {
  assert.equal(calculateInventoryValue([
    { quantity: 4, averageCost: 250 },
    { quantity: 3, averageCost: 100 }
  ]), 1300);
});

test('project profit recognizes cost of goods sold, not all purchases', () => {
  const accounts = [{ id: 1, scope: 'business' }];
  const transactions = [
    { projectId: 10, accountId: 1, type: 'expense', amount: 1000, inventoryMovementType: 'purchase' },
    { projectId: 10, accountId: 1, type: 'income', amount: 1800, inventoryMovementType: 'sale' },
    { projectId: 10, accountId: 1, type: 'expense', amount: 100, category: 'Delivery' }
  ];
  const movements = [{ projectId: 10, type: 'sale', cogs: 600 }];
  assert.deepEqual(calculateProjectTotals(10, transactions, accounts, movements), {
    income: 1800, expenses: 100, costOfGoodsSold: 600, profit: 1100, count: 3
  });
});


test('voided sale is excluded from balances, revenue, COGS and project profit', () => {
  const accounts = [{ id: 1, opening: 100, scope: 'business' }];
  const transactions = [
    { id: 1, accountId: 1, type: 'income', amount: 500, projectId: 7, voided: true },
    { id: 2, accountId: 1, type: 'income', amount: 200, projectId: 7 }
  ];
  const movements = [
    { type: 'sale', projectId: 7, cogs: 250, voided: true },
    { type: 'sale', projectId: 7, cogs: 100 }
  ];
  const totals = calculateFinancialTotals(accounts, transactions, [], movements);
  assert.deepEqual(totals, { balance: 300, income: 200, expenses: 100, net: 100 });
  const project = calculateProjectTotals(7, transactions, accounts, movements);
  assert.deepEqual(project, { income: 200, expenses: 0, costOfGoodsSold: 100, profit: 100, count: 1 });
});

test('monthly analytics excludes voided sale transactions and their cost of goods sold', () => {
  const transactions = [
    { date: '2026-11-11', type: 'income', amount: 500, voided: true },
    { date: '2026-11-11', type: 'income', amount: 200 }
  ];
  const movements = [
    { date: '2026-11-11', type: 'sale', cogs: 250, voided: true },
    { date: '2026-11-11', type: 'sale', cogs: 100 }
  ];
  const result = calculateMonthlyAnalytics(transactions, '2026-11', movements);
  assert.equal(result.income, 200);
  assert.equal(result.expenses, 100);
  assert.equal(result.net, 100);
  assert.equal(result.count, 1);
});


test('inventory purchases reduce cash but are not counted as profit expenses before sale', () => {
  const accounts = [{ id: 1, opening: 2000, scope: 'business' }];
  const transactions = [
    { id: 1, accountId: 1, type: 'expense', amount: 1000, inventoryMovementType: 'purchase', projectId: 7, date: '2026-11-10' },
    { id: 2, accountId: 1, type: 'income', amount: 500, inventoryMovementType: 'sale', projectId: 7, date: '2026-11-11' }
  ];
  const movements = [
    { type: 'purchase', projectId: 7, total: 1000, cogs: 0, date: '2026-11-10' },
    { type: 'sale', projectId: 7, total: 500, cogs: 200, date: '2026-11-11' }
  ];
  const totals = calculateFinancialTotals(accounts, transactions, [], movements);
  assert.deepEqual(totals, { balance: 1500, income: 500, expenses: 200, net: 300 });
  const scoped = calculateFinancialTotalsByScope(accounts, transactions, [], movements);
  assert.equal(scoped.business.balance, 1500);
  assert.equal(scoped.business.expenses, 200);
  assert.equal(scoped.business.net, 300);
});

test('monthly analytics excludes stock purchases from profit expenses and categories', () => {
  const transactions = [
    { date: '2026-11-10', type: 'expense', amount: 1000, category: 'Закупка товара', inventoryMovementType: 'purchase' },
    { date: '2026-11-11', type: 'income', amount: 500, category: 'Продажа товара', inventoryMovementType: 'sale' },
    { date: '2026-11-12', type: 'expense', amount: 50, category: 'Доставка' }
  ];
  const movements = [
    { date: '2026-11-10', type: 'purchase', cogs: 0 },
    { date: '2026-11-11', type: 'sale', cogs: 200 }
  ];
  const result = calculateMonthlyAnalytics(transactions, '2026-11', movements);
  assert.equal(result.income, 500);
  assert.equal(result.expenses, 250);
  assert.equal(result.net, 250);
  assert.deepEqual(result.expensesByCategory, [
    ['Себестоимость проданного', 200],
    ['Доставка', 50]
  ]);
  assert.equal(result.count, 3);
});


test('sale cancellation guard accepts a fully matching sale and linked income', () => {
  const sale = { id: 11, type: 'sale', transactionId: 21, productId: 31, projectId: 41, accountId: 51, quantity: 2, unitCost: 100, unitPrice: 250, total: 500, cogs: 200 };
  const cash = { id: 21, type: 'income', amount: 500, accountId: 51, projectId: 41, inventoryMovementType: 'sale' };
  const product = { id: 31, projectId: 41, quantity: 3, averageCost: 100 };
  assert.deepEqual(validateSaleCancellation(sale, cash, product, []), { quantity: 2, restoredCost: 200 });
});

test('sale cancellation guard rejects a linked transaction from another account', () => {
  const sale = { id: 11, type: 'sale', transactionId: 21, productId: 31, projectId: 41, accountId: 51, quantity: 2, unitCost: 100, unitPrice: 250, total: 500, cogs: 200 };
  const cash = { id: 21, type: 'income', amount: 500, accountId: 999, projectId: 41, inventoryMovementType: 'sale' };
  const product = { id: 31, projectId: 41, quantity: 3, averageCost: 100 };
  assert.throws(() => validateSaleCancellation(sale, cash, product, []), /does not match/);
});

test('sale cancellation guard rejects wrong transaction type, project, amount and missing inventory link', () => {
  const sale = { id: 11, type: 'sale', transactionId: 21, productId: 31, projectId: 41, accountId: 51, quantity: 2, unitCost: 100, unitPrice: 250, total: 500, cogs: 200 };
  const product = { id: 31, projectId: 41, quantity: 3, averageCost: 100 };
  for (const patch of [
    { type: 'expense' },
    { projectId: 99 },
    { amount: 499 },
    { inventoryMovementType: undefined }
  ]) {
    const cash = { id: 21, type: 'income', amount: 500, accountId: 51, projectId: 41, inventoryMovementType: 'sale', ...patch };
    assert.throws(() => validateSaleCancellation(sale, cash, product, []), /does not match/);
  }
});

test('sale cancellation guard rejects mismatched sale math, product and an existing reversal', () => {
  const sale = { id: 11, type: 'sale', transactionId: 21, productId: 31, projectId: 41, accountId: 51, quantity: 2, unitCost: 100, unitPrice: 250, total: 500, cogs: 200 };
  const cash = { id: 21, type: 'income', amount: 500, accountId: 51, projectId: 41, inventoryMovementType: 'sale' };
  const product = { id: 31, projectId: 41, quantity: 3, averageCost: 100 };
  assert.throws(() => validateSaleCancellation({ ...sale, cogs: 300 }, cash, product, []), /amounts do not reconcile/);
  assert.throws(() => validateSaleCancellation(sale, cash, { ...product, projectId: 99 }, []), /product does not match/);
  assert.throws(() => validateSaleCancellation(sale, cash, product, [{ type: 'sale_reversal', originalMovementId: 11 }]), /already has/);
});

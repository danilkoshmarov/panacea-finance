import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAccountBalance,
  calculateFinancialTotals,
  calculateFinancialTotalsByScope,
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
  assert.deepEqual(result.business, { balance: 1050, income: 800, expenses: 250, net: 550 });
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

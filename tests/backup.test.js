import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('function validateBackup(data){');
const end = html.indexOf('\nconst esc=', start);
assert.notEqual(start, -1, 'validateBackup must exist in index.html');
assert.notEqual(end, -1, 'validateBackup must have a clear end marker');
const validateBackup = new Function(html.slice(start, end) + '\nreturn validateBackup;')();

function cancelledSaleBackup() {
  return {
    app: 'Panacea Finance',
    version: 5,
    accounts: [{ id: 1, name: 'Бизнес', type: 'Оборотный капитал', scope: 'business', opening: 1000 }],
    transactions: [{
      id: 1, type: 'income', amount: 200, accountId: 1, category: 'Продажа товара',
      date: '2026-11-11', note: 'Продажа: товар', projectId: 1,
      inventoryMovementType: 'sale', voided: true
    }],
    transfers: [],
    goals: [],
    projects: [{ id: 1, name: 'Товарка', type: 'resale', description: '' }],
    products: [{ id: 1, name: 'Товар', sku: '', projectId: 1, quantity: 10, averageCost: 100 }],
    inventoryMovements: [
      { id: 1, type: 'opening', productId: 1, projectId: 1, quantity: 10, unitCost: 100, unitPrice: 0, total: 1000, cogs: 0, date: '2026-11-10' },
      { id: 2, type: 'sale', productId: 1, projectId: 1, accountId: 1, transactionId: 1, quantity: 2, unitCost: 100, unitPrice: 100, total: 200, cogs: 200, date: '2026-11-11', voided: true },
      { id: 3, type: 'sale_reversal', productId: 1, projectId: 1, quantity: 2, unitCost: 100, unitPrice: 0, total: 200, cogs: 0, date: '2026-11-11', originalMovementId: 2, note: 'Отмена продажи' }
    ]
  };
}

test('backup import accepts a cancelled sale and its stock reversal', () => {
  const backup = cancelledSaleBackup();
  const restored = validateBackup(backup);
  assert.equal(restored.products[0].quantity, 10);
  assert.equal(restored.products[0].averageCost, 100);
});

test('backup import rejects a reversal that does not reference its cancelled sale', () => {
  const backup = cancelledSaleBackup();
  backup.inventoryMovements[2].originalMovementId = 999;
  assert.throws(() => validateBackup(backup), /Некорректная запись отмены продажи/);
});

test('backup import rejects a cancelled sale with no reversal movement', () => {
  const backup = cancelledSaleBackup();
  backup.inventoryMovements.pop();
  assert.throws(() => validateBackup(backup), /отсутствует возврат товара/);
});

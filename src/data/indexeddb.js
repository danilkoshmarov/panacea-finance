import { validateSaleCancellation } from '../core/finance.js';\n\n/**
 * IndexedDB adapter for Panacea Finance.
 * UI code depends on this small async API instead of managing transactions.
 */

const DATABASE_NAME = 'panacea-finance';
const DATABASE_VERSION = 4;
const STORE_NAMES = ['accounts', 'transactions', 'transfers', 'goals', 'projects', 'products', 'inventoryMovements'];

let databasePromise;

function assertStoreName(name) {
  if (!STORE_NAMES.includes(name)) {
    throw new Error(`Unknown Panacea Finance store: ${name}`);
  }
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

export function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = event => {
      const database = request.result;
      for (const name of STORE_NAMES) {
        if (!database.objectStoreNames.contains(name)) {
          database.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        }
      }
      if (event.oldVersion < 2) {
        const accounts = request.transaction.objectStore('accounts');
        const cursorRequest = accounts.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const account = cursor.value;
          if (!['personal', 'business'].includes(account.scope)) {
            account.scope = account.type === 'Оборотный капитал' ? 'business' : 'personal';
            cursor.update(account);
          }
          cursor.continue();
        };
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };

    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error || new Error('Could not open local database'));
    };

    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error('Database upgrade is blocked by another open Panacea Finance window'));
    };
  });

  return databasePromise;
}

async function getDatabase() {
  if (!databasePromise) {
    throw new Error('Local database is not initialized. Call openDatabase() first.');
  }
  return databasePromise;
}

export async function getAll(storeName) {
  assertStoreName(storeName);
  const database = await getDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const done = transactionDone(transaction);
  const [result] = await Promise.all([requestResult(transaction.objectStore(storeName).getAll()), done]);
  return result;
}

export async function add(storeName, record) {
  assertStoreName(storeName);
  const database = await getDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const done = transactionDone(transaction);
  const [id] = await Promise.all([requestResult(transaction.objectStore(storeName).add(record)), done]);
  return id;
}

export async function put(storeName, record) {
  assertStoreName(storeName);
  const database = await getDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const done = transactionDone(transaction);
  const [id] = await Promise.all([requestResult(transaction.objectStore(storeName).put(record)), done]);
  return id;
}

/**
 * Atomically update stock, record the movement and record the matching cash
 * transaction. A failed part aborts the entire IndexedDB transaction.
 */
export async function recordInventoryMovement({ product, movement, transactionRecord }) {
  const database = await getDatabase();
  const transaction = database.transaction(['products', 'inventoryMovements', 'transactions'], 'readwrite');
  const done = transactionDone(transaction);
  const productStore = transaction.objectStore('products');
  const movementStore = transaction.objectStore('inventoryMovements');
  const transactionStore = transaction.objectStore('transactions');
  let transactionId;
  let movementId;
  const transactionRequest = transactionStore.add(transactionRecord);
  transactionRequest.onsuccess = () => {
    transactionId = transactionRequest.result;
    movement.transactionId = transactionId;
    const movementRequest = movementStore.add(movement);
    movementRequest.onsuccess = () => { movementId = movementRequest.result; };
    movementRequest.onerror = () => transaction.abort();
  };
  transactionRequest.onerror = () => transaction.abort();
  productStore.put(product);
  await done;
  return { transactionId, movementId };
}

/**
 * Add already-owned stock without recording a cash expense.
 * Opening inventory is an asset brought into the ledger, not a new purchase.
 */
export async function recordOpeningInventoryMovement({ product, movement }) {
  const database = await getDatabase();
  const transaction = database.transaction(['products', 'inventoryMovements'], 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore('products').put(product);
  const movementId = await requestResult(transaction.objectStore('inventoryMovements').add(movement));
  await done;
  return { movementId };
}

/**
 * Reclassify an incorrectly entered historical purchase as opening stock.
 * Keeps its quantity and cost in the inventory ledger, but removes the
 * linked false cash-expense transaction atomically.
 */
export async function reclassifyPurchaseAsOpening(movementId) {
  const database = await getDatabase();
  const transaction = database.transaction(['inventoryMovements', 'transactions'], 'readwrite');
  const done = transactionDone(transaction);
  const movementStore = transaction.objectStore('inventoryMovements');
  const request = movementStore.get(Number(movementId));
  let updatedMovement;
  request.onsuccess = () => {
    const movement = request.result;
    if (!movement || movement.type !== 'purchase' || !Number.isSafeInteger(movement.transactionId)) {
      transaction.abort();
      return;
    }
    updatedMovement = { ...movement, type: 'opening', unitPrice: 0, cogs: 0 };
    delete updatedMovement.accountId;
    delete updatedMovement.transactionId;
    transaction.objectStore('transactions').delete(movement.transactionId);
    movementStore.put(updatedMovement);
  };
  request.onerror = () => transaction.abort();
  await done;
  return updatedMovement;
}

/**
 * Cancel a sale atomically: restore stock, void the linked cash transaction,
 * mark the original movement as cancelled and append an audit movement.
 * Nothing is physically deleted, so the inventory trail remains explainable.
 */
export async function cancelSale(movementId) {
  const database = await getDatabase();
  const transaction = database.transaction(['products', 'inventoryMovements', 'transactions'], 'readwrite');
  const done = transactionDone(transaction);
  const movements = transaction.objectStore('inventoryMovements');
  const products = transaction.objectStore('products');
  const transactions = transaction.objectStore('transactions');

  const saleRequest = movements.get(Number(movementId));
  saleRequest.onsuccess = () => {
    const sale = saleRequest.result;
    if (!sale || sale.type !== 'sale' || sale.voided || !Number.isSafeInteger(sale.transactionId)) {
      transaction.abort();
      return;
    }

    const productRequest = products.get(Number(sale.productId));
    const cashRequest = transactions.get(Number(sale.transactionId));
    const allMovementsRequest = movements.getAll();
    let product;
    let cashRecord;
    let allMovements;
    const ready = () => {
      if (!product || !cashRecord || !allMovements) return;
      try {
        const { quantity: restoredQuantity, restoredCost } =
          validateSaleCancellation(sale, cashRecord, product, allMovements);
        const currentQuantity = Number(product.quantity);
        const currentValue = currentQuantity * Number(product.averageCost);
        const nextQuantity = currentQuantity + restoredQuantity;
        const nextAverageCost = nextQuantity > 0
          ? (currentValue + restoredCost) / nextQuantity
          : 0;

        const cancelledAt = new Date().toISOString();
        movements.put({ ...sale, voided: true, cancelledAt });
        transactions.put({ ...cashRecord, voided: true, voidedAt: cancelledAt });
        products.put({ ...product, quantity: nextQuantity, averageCost: nextAverageCost });
        movements.add({
          type: 'sale_reversal',
          productId: sale.productId,
          projectId: sale.projectId,
          quantity: restoredQuantity,
          unitCost: restoredCost / restoredQuantity,
          unitPrice: 0,
          total: restoredCost,
          cogs: 0,
          date: cancelledAt.slice(0, 10),
          originalMovementId: sale.id,
          note: 'Отмена продажи',
          createdAt: cancelledAt
        });
      } catch {
        transaction.abort();
      }
    };
    productRequest.onsuccess = () => { product = productRequest.result; ready(); };
    cashRequest.onsuccess = () => { cashRecord = cashRequest.result; ready(); };
    allMovementsRequest.onsuccess = () => { allMovements = allMovementsRequest.result; ready(); };
    productRequest.onerror = () => transaction.abort();
    cashRequest.onerror = () => transaction.abort();
    allMovementsRequest.onerror = () => transaction.abort();
  };
  saleRequest.onerror = () => transaction.abort();

  await done;
  return { movementId: Number(movementId), cancelled: true };
}

export async function remove(storeName, id) {
  assertStoreName(storeName);
  const database = await getDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const done = transactionDone(transaction);
  await Promise.all([requestResult(transaction.objectStore(storeName).delete(Number(id))), done]);
}

export async function clearAll() {
  const database = await getDatabase();
  const transaction = database.transaction(STORE_NAMES, 'readwrite');
  const done = transactionDone(transaction);
  for (const name of STORE_NAMES) {
    transaction.objectStore(name).clear();
  }
  await done;
}

export async function replaceAllStores(data) {
  const database = await getDatabase();
  const transaction = database.transaction(STORE_NAMES, 'readwrite');
  const done = transactionDone(transaction);

  for (const name of STORE_NAMES) {
    const store = transaction.objectStore(name);
    store.clear();
    for (const record of data[name]) {
      store.put(record);
    }
  }

  await done;
}

export const stores = Object.freeze([...STORE_NAMES]);

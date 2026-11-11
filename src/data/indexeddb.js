/**
 * IndexedDB adapter for Panacea Finance.
 * UI code depends on this small async API instead of managing transactions.
 */

const DATABASE_NAME = 'panacea-finance';
const DATABASE_VERSION = 2;
const STORE_NAMES = ['accounts', 'transactions', 'transfers', 'goals'];

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

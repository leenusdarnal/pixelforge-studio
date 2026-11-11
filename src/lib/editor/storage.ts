import type { ProjectSnapshot, RecoveryRecord } from './project';

const DB_NAME = 'pixelforge-studio-local';
const STORE_NAME = 'snapshots';
let database: Promise<IDBDatabase> | null = null;

export type RecoveryOverview = {
  current: RecoveryRecord | null;
  backupCount: number;
  latestSavedAt: number | null;
};

function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      database = null;
      reject(request.error ?? new Error('Could not open local storage.'));
    };
    request.onblocked = () => {
      database = null;
      reject(new Error('Local storage upgrade is blocked by another tab.'));
    };
  });
  return database;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local storage request failed.'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Local storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Local storage transaction was cancelled.'));
  });
}

/** Read the most recent autosave record from this device. */
export async function getCurrentRecovery(): Promise<RecoveryRecord | null> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const record = await requestResult(transaction.objectStore(STORE_NAME).get('current')) as RecoveryRecord | undefined;
  return record ?? null;
}

/** Return a small, non-sensitive summary of the IndexedDB recovery records. */
export async function getRecoveryOverview(): Promise<RecoveryOverview> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const done = transactionComplete(transaction);
  const records = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as RecoveryRecord[];
  await done;

  const current = records.find((record) => record.id === 'current') ?? null;
  const backups = records.filter((record) => record.id.startsWith('backup-'));
  const latestSavedAt = records.reduce<number | null>(
    (latest, record) => latest === null ? record.savedAt : Math.max(latest, record.savedAt),
    null
  );

  return {
    current,
    backupCount: backups.length,
    latestSavedAt
  };
}

/** Clear only PixelForge project recovery snapshots; the installed app cache is untouched. */
export async function clearRecoveryData(): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const done = transactionComplete(transaction);
  transaction.objectStore(STORE_NAME).clear();
  await done;
}

/** Save the current project and retain the three newest recovery copies. */
export async function persistProject(project: ProjectSnapshot): Promise<void> {
  const db = await openDatabase();
  const savedAt = Date.now();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const done = transactionComplete(transaction);
  const store = transaction.objectStore(STORE_NAME);
  store.put({ id: 'current', savedAt, project } satisfies RecoveryRecord);
  store.put({ id: 'backup-' + savedAt, savedAt, project } satisfies RecoveryRecord);
  await done;

  const readTransaction = db.transaction(STORE_NAME, 'readonly');
  const all = await requestResult(readTransaction.objectStore(STORE_NAME).getAll()) as RecoveryRecord[];
  const backups = all
    .filter((record) => record.id.startsWith('backup-'))
    .sort((a, b) => b.savedAt - a.savedAt);
  if (backups.length > 3) {
    const cleanup = db.transaction(STORE_NAME, 'readwrite');
    const cleanupDone = transactionComplete(cleanup);
    backups.slice(3).forEach((record) => cleanup.objectStore(STORE_NAME).delete(record.id));
    await cleanupDone;
  }
}

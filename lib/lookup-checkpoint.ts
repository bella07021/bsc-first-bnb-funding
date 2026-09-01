const DATABASE_NAME = 'bsc-first-bnb-funding';
const STORE_NAME = 'lookup-checkpoints';
const CHECKPOINT_KEY = 'active-lookup';

export type LookupCheckpoint<Result> = {
  version: 1;
  addresses: string[];
  results: Result[];
  complete: boolean;
  savedAt: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export function loadLookupCheckpoint<Result>() {
  return withStore<LookupCheckpoint<Result> | undefined>('readonly', (store) =>
    store.get(CHECKPOINT_KEY),
  );
}

export function saveLookupCheckpoint<Result>(
  checkpoint: LookupCheckpoint<Result>,
) {
  return withStore<IDBValidKey>('readwrite', (store) =>
    store.put(checkpoint, CHECKPOINT_KEY),
  );
}

export function clearLookupCheckpoint() {
  return withStore<undefined>('readwrite', (store) =>
    store.delete(CHECKPOINT_KEY),
  );
}

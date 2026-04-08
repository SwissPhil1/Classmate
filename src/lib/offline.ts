/**
 * IndexedDB-based offline queue for writes that happen while offline.
 * Syncs to Supabase on reconnect with last-write-wins strategy.
 */

const DB_NAME = 'radloop-offline'
const DB_VERSION = 1
const STORE_NAME = 'pending_writes'

interface PendingWrite {
  id: string
  table: string
  operation: 'insert' | 'update' | 'upsert'
  data: Record<string, unknown>
  timestamp: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export async function queueOfflineWrite(write: Omit<PendingWrite, 'id' | 'timestamp'>): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)

  const entry: PendingWrite = {
    id: crypto.randomUUID(),
    ...write,
    timestamp: Date.now(),
  }

  store.add(entry)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getPendingWrites(): Promise<PendingWrite[]> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function removePendingWrite(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  store.delete(id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncPendingWrites(supabase: any): Promise<{ synced: number; failed: number }> {
  const writes = await getPendingWrites()
  let synced = 0
  let failed = 0

  // Sort by timestamp (oldest first)
  writes.sort((a, b) => a.timestamp - b.timestamp)

  for (const write of writes) {
    try {
      const table = supabase.from(write.table)
      let result: { error: unknown }

      switch (write.operation) {
        case 'insert':
          result = await table.insert(write.data).select()
          break
        case 'upsert':
          result = await table.upsert(write.data).select()
          break
        case 'update':
          result = await table.update(write.data).eq('id', write.data.id)
          break
        default:
          result = { error: 'Unknown operation' }
      }

      if (!result.error) {
        await removePendingWrite(write.id)
        synced++
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }

  return { synced, failed }
}

/** Register service worker and set up sync listener */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  navigator.serviceWorker.register('/sw.js').catch(console.error)

  // Listen for sync messages from SW
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_REQUESTED') {
      // Trigger sync from main thread
      window.dispatchEvent(new CustomEvent('radloop:sync'))
    }
  })

  // Listen for online/offline
  window.addEventListener('online', () => {
    window.dispatchEvent(new CustomEvent('radloop:sync'))
  })
}

/** Check if we're online */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

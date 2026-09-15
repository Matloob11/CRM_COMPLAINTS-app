import { api, ApiError } from '@/api/client'
import type { Attachment } from '@/api/types'
import { Sha256Stream } from './sha256'

/**
 * Resumable chunked upload manager.
 *
 * The owner refused any size cap, so this is built for the multi-gigabyte case
 * as the normal case, not the edge case:
 *  - progress is driven by real chunk acknowledgements, not a fake timer;
 *  - a failed chunk is retried with exponential backoff and resumes from the
 *    last acknowledged chunk (the PUT endpoint is idempotent);
 *  - going offline pauses rather than fails, and resumes on `online`;
 *  - hashing happens in a worker, and file bytes are read one slice at a time,
 *    so the tab stays responsive and memory stays flat while the user keeps
 *    typing and reading.
 *
 * The manager lives outside React so an upload survives closing the modal or
 * switching to another complaint.
 */

export type UploadStatus =
  | 'preparing'
  | 'uploading'
  | 'retrying'
  | 'offline'
  | 'finalizing'
  | 'done'
  | 'error'
  | 'canceled'

export interface UploadTask {
  id: string
  scope: string
  name: string
  size: number
  mime: string
  uploadedBytes: number
  status: UploadStatus
  error: string | null
  attachment: Attachment | null
  previewUrl: string | null
  bytesPerSecond: number
  attempt: number
}

const MAX_ATTEMPTS = 8
const HASH_SLICE = 4 * 1024 * 1024
const DEFAULT_CHUNK = 8 * 1024 * 1024

type Listener = () => void

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `u_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(id)
        reject(new DOMException('aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

function waitForOnline(signal: AbortSignal): Promise<void> {
  if (navigator.onLine) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const done = () => {
      window.removeEventListener('online', done)
      resolve()
    }
    window.addEventListener('online', done)
    signal.addEventListener(
      'abort',
      () => {
        window.removeEventListener('online', done)
        reject(new DOMException('aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

/** Non-retryable server answers: retrying them would only burn the user's time. */
function isPermanent(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  return error.status === 401 || error.status === 403 || error.status === 413 || error.status === 422
}

class UploadManager {
  private tasks = new Map<string, UploadTask>()
  private controllers = new Map<string, AbortController>()
  private files = new Map<string, File>()
  private listeners = new Set<Listener>()
  private snapshot: UploadTask[] = []

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): UploadTask[] => this.snapshot

  private emit(): void {
    this.snapshot = Array.from(this.tasks.values())
    this.listeners.forEach((listener) => listener())
  }

  private patch(id: string, patch: Partial<UploadTask>): void {
    const current = this.tasks.get(id)
    if (!current) return
    this.tasks.set(id, { ...current, ...patch })
    this.emit()
  }

  tasksFor(scope: string): UploadTask[] {
    return this.snapshot.filter((task) => task.scope === scope)
  }

  /** Attachment ids for a scope that finished and can be sent with a message. */
  readyAttachmentIds(scope: string): string[] {
    const ids: string[] = []
    for (const task of this.snapshot) {
      if (task.scope === scope && task.status === 'done' && task.attachment) {
        ids.push(task.attachment.id)
      }
    }
    return ids
  }

  enqueue(files: File[], scope: string): UploadTask[] {
    const created: UploadTask[] = []
    for (const file of files) {
      const id = makeId()
      const task: UploadTask = {
        id,
        scope,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        uploadedBytes: 0,
        status: 'preparing',
        error: null,
        attachment: null,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        bytesPerSecond: 0,
        attempt: 0,
      }
      this.tasks.set(id, task)
      this.files.set(id, file)
      created.push(task)
    }
    this.emit()
    for (const task of created) {
      const file = this.files.get(task.id)
      if (file) void this.run(task.id, file)
    }
    return created
  }

  cancel(id: string): void {
    this.controllers.get(id)?.abort()
    this.controllers.delete(id)
    this.patch(id, { status: 'canceled' })
  }

  retry(id: string): void {
    const file = this.files.get(id)
    if (!file) return
    this.patch(id, { status: 'preparing', error: null, uploadedBytes: 0, attempt: 0 })
    void this.run(id, file)
  }

  remove(id: string): void {
    const task = this.tasks.get(id)
    if (task?.previewUrl) URL.revokeObjectURL(task.previewUrl)
    this.controllers.get(id)?.abort()
    this.controllers.delete(id)
    this.files.delete(id)
    this.tasks.delete(id)
    this.emit()
  }

  clearScope(scope: string): void {
    for (const task of Array.from(this.tasks.values())) {
      if (task.scope === scope) this.remove(task.id)
    }
  }

  private hashFile(file: File, signal: AbortSignal): Promise<string> {
    // Worker path keeps the main thread free on large files.
    try {
      const worker = new Worker(new URL('./sha256.worker.ts', import.meta.url), { type: 'module' })
      return new Promise<string>((resolve, reject) => {
        const id = makeId()
        worker.onmessage = (event: MessageEvent<{ id: string; hash?: string; error?: string }>) => {
          if (event.data.hash) {
            worker.terminate()
            resolve(event.data.hash)
          } else if (event.data.error) {
            worker.terminate()
            reject(new Error(event.data.error))
          }
        }
        worker.onerror = () => {
          worker.terminate()
          reject(new Error('hash worker failed'))
        }
        signal.addEventListener('abort', () => worker.terminate(), { once: true })
        worker.postMessage({ id, file, sliceSize: HASH_SLICE })
      }).catch(() => hashOnMainThread(file, signal))
    } catch {
      return hashOnMainThread(file, signal)
    }
  }

  private async run(id: string, file: File): Promise<void> {
    const controller = new AbortController()
    this.controllers.set(id, controller)
    const { signal } = controller

    try {
      const hashPromise = this.hashFile(file, signal)
      // A rejected hash must not surface as an unhandled rejection while the
      // chunk loop is still running; it is awaited for real further down.
      hashPromise.catch(() => undefined)

      const init = await api.uploadInit({
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        size_bytes: file.size,
      })
      const chunkSize = init.chunk_size > 0 ? init.chunk_size : DEFAULT_CHUNK
      const chunkCount = Math.max(1, Math.ceil(file.size / chunkSize))

      this.patch(id, { status: 'uploading' })

      const startedAt = performance.now()
      let sent = 0

      for (let index = 0; index < chunkCount; index += 1) {
        const start = index * chunkSize
        const end = Math.min(start + chunkSize, file.size)
        const blob = file.slice(start, end)

        let attempt = 0
        for (;;) {
          try {
            if (!navigator.onLine) {
              this.patch(id, { status: 'offline' })
              await waitForOnline(signal)
              this.patch(id, { status: 'uploading' })
            }
            await api.uploadChunk(init.upload_id, index, blob, signal)
            break
          } catch (error) {
            if (signal.aborted) throw error
            if (isPermanent(error)) throw error
            attempt += 1
            if (attempt >= MAX_ATTEMPTS) throw error
            this.patch(id, { status: 'retrying', attempt })
            await sleep(Math.min(1000 * 2 ** (attempt - 1), 20_000), signal)
            this.patch(id, { status: 'uploading' })
          }
        }

        sent = end
        const elapsed = (performance.now() - startedAt) / 1000
        this.patch(id, {
          uploadedBytes: sent,
          bytesPerSecond: elapsed > 0 ? sent / elapsed : 0,
          attempt: 0,
        })
      }

      this.patch(id, { status: 'finalizing' })
      const checksum = await hashPromise
      const result = await api.uploadComplete(init.upload_id, {
        checksum_sha256: checksum,
        size_bytes: file.size,
      })

      this.patch(id, {
        status: 'done',
        uploadedBytes: file.size,
        attachment: result.attachment ?? null,
      })
    } catch (error) {
      if (signal.aborted) {
        this.patch(id, { status: 'canceled' })
        return
      }
      this.patch(id, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Upload failed',
      })
    } finally {
      this.controllers.delete(id)
    }
  }
}

/**
 * Blob.arrayBuffer() is missing in older Safari (and in jsdom), so fall back to
 * FileReader rather than failing the whole upload at the checksum step.
 */
export function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('could not read file slice'))
    reader.readAsArrayBuffer(blob)
  })
}

async function hashOnMainThread(file: File, signal: AbortSignal): Promise<string> {
  const hasher = new Sha256Stream()
  for (let offset = 0; offset < file.size; offset += HASH_SLICE) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    const buffer = await readBlob(file.slice(offset, Math.min(offset + HASH_SLICE, file.size)))
    hasher.update(new Uint8Array(buffer))
    // Yield so the composer stays interactive between slices.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return hasher.digestHex()
}

export const uploadManager = new UploadManager()

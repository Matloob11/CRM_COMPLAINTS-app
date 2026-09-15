/// <reference lib="webworker" />
import { Sha256Stream } from './sha256'

/**
 * Hashes a File slice by slice off the main thread, so a 2 GB video never
 * blocks typing or scrolling while its checksum is computed.
 */
interface HashRequest {
  id: string
  file: File
  sliceSize: number
}

self.onmessage = async (event: MessageEvent<HashRequest>) => {
  const { id, file, sliceSize } = event.data
  const hasher = new Sha256Stream()
  try {
    for (let offset = 0; offset < file.size; offset += sliceSize) {
      const slice = file.slice(offset, Math.min(offset + sliceSize, file.size))
      const buffer = await (typeof slice.arrayBuffer === 'function'
        ? slice.arrayBuffer()
        : new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as ArrayBuffer)
            reader.onerror = () => reject(reader.error ?? new Error('read failed'))
            reader.readAsArrayBuffer(slice)
          }))
      hasher.update(new Uint8Array(buffer))
      self.postMessage({ id, progress: Math.min(offset + sliceSize, file.size) })
    }
    self.postMessage({ id, hash: hasher.digestHex() })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'hash failed' })
  }
}

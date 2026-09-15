import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'

/**
 * The upload manager is the piece most likely to fail quietly on a real
 * multi-gigabyte file, so it is tested against a stubbed API: chunk sequencing,
 * resume after a transient failure, and cancel.
 */
const uploadInit = vi.fn()
const uploadChunk = vi.fn()
const uploadComplete = vi.fn()

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client')
  return {
    ...actual,
    api: {
      uploadInit: (...args: unknown[]) => uploadInit(...args),
      uploadChunk: (...args: unknown[]) => uploadChunk(...args),
      uploadComplete: (...args: unknown[]) => uploadComplete(...args),
    },
  }
})

async function importManager() {
  vi.resetModules()
  const module = await import('@/lib/uploads')
  return module.uploadManager
}

function fileOf(bytes: number, name = 'video.mp4'): File {
  return new File([new Uint8Array(bytes)], name, { type: 'video/mp4' })
}

async function settle(manager: { getSnapshot: () => Array<{ status: string }> }) {
  for (let i = 0; i < 400; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
    const tasks = manager.getSnapshot()
    if (tasks.length > 0 && tasks.every((t) => ['done', 'error', 'canceled'].includes(t.status))) {
      return
    }
  }
  throw new Error('uploads did not settle')
}

beforeEach(() => {
  uploadInit.mockReset()
  uploadChunk.mockReset()
  uploadComplete.mockReset()
  uploadInit.mockResolvedValue({ upload_id: 'up_1', chunk_size: 1024 })
  uploadComplete.mockImplementation((_id: string, body: { size_bytes: number }) =>
    Promise.resolve({
      attachment_id: 'att_1',
      attachment: {
        id: 'att_1',
        original_name: 'video.mp4',
        mime: 'video/mp4',
        size_bytes: body.size_bytes,
        width: null,
        height: null,
        duration: null,
        url: '/api/v1/attachments/att_1',
        thumbnail_url: null,
      },
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('chunked upload', () => {
  it('splits the file into ordered chunks and reports the server checksum', async () => {
    uploadChunk.mockResolvedValue({ received: 1024 })
    const manager = await importManager()

    manager.enqueue([fileOf(3 * 1024 + 10)], 'complaint:1')
    await settle(manager)

    const indexes = uploadChunk.mock.calls.map((call) => call[1])
    expect(indexes).toEqual([0, 1, 2, 3])

    const task = manager.getSnapshot()[0]
    expect(task?.status).toBe('done')
    expect(task?.uploadedBytes).toBe(3 * 1024 + 10)
    expect(task?.attachment?.id).toBe('att_1')

    // The checksum is computed client-side and handed to /complete, as the
    // backend contract requires.
    const completeBody = uploadComplete.mock.calls[0]?.[1] as { checksum_sha256: string }
    expect(completeBody.checksum_sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('resumes from the failed chunk instead of restarting the transfer', async () => {
    let failed = false
    uploadChunk.mockImplementation((_id: string, index: number) => {
      if (index === 1 && !failed) {
        failed = true
        return Promise.reject(new Error('network reset'))
      }
      return Promise.resolve({ received: 1024 })
    })

    const manager = await importManager()
    manager.enqueue([fileOf(3 * 1024)], 'complaint:1')
    await settle(manager)

    const indexes = uploadChunk.mock.calls.map((call) => call[1])
    // Chunk 1 is retried; chunk 0 is never re-sent.
    expect(indexes).toEqual([0, 1, 1, 2])
    expect(manager.getSnapshot()[0]?.status).toBe('done')
  })

  it('gives up immediately on a permanent rejection', async () => {
    uploadChunk.mockRejectedValue(new ApiError(403, 'Not permitted'))
    const manager = await importManager()

    manager.enqueue([fileOf(2048)], 'complaint:1')
    await settle(manager)

    expect(uploadChunk).toHaveBeenCalledTimes(1)
    expect(manager.getSnapshot()[0]?.status).toBe('error')
  })

  it('cancels in flight and reports only completed uploads as sendable', async () => {
    uploadChunk.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ received: 1024 }), 40)),
    )
    const manager = await importManager()

    const [task] = manager.enqueue([fileOf(50 * 1024)], 'complaint:9')
    await new Promise((resolve) => setTimeout(resolve, 30))
    manager.cancel(task!.id)
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(manager.getSnapshot()[0]?.status).toBe('canceled')
    expect(manager.readyAttachmentIds('complaint:9')).toEqual([])
  })
})

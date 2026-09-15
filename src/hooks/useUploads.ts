import { useSyncExternalStore } from 'react'
import { uploadManager, type UploadTask } from '@/lib/uploads'

const EMPTY: UploadTask[] = []

/** Live view of the uploads belonging to one scope ("new", "complaint:12", ...). */
export function useUploads(scope: string): UploadTask[] {
  const all = useSyncExternalStore(uploadManager.subscribe, uploadManager.getSnapshot, () => EMPTY)
  return all.filter((task) => task.scope === scope)
}

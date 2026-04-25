'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/image-compression'
import { uploadEntityImage, getImageUrl } from '@/lib/supabase/storage'
import { createEntityImage } from '@/lib/supabase/queries'
import type { EntityImage } from '@/lib/types'

export type UploadStatus = 'compressing' | 'uploading' | 'saved' | 'error'

export interface UploadFileState {
  fileId: string
  fileName: string
  pct: number
  status: UploadStatus
  error?: string
}

interface UseImageUploadOpts {
  userId: string
  entityId: string
  /** display_order assigned to the next uploaded image. Increments per file. */
  baseDisplayOrder: number
  onSaved: (image: EntityImage) => void
}

const MAX_CONCURRENT = 3

export function useImageUpload({ userId, entityId, baseDisplayOrder, onSaved }: UseImageUploadOpts) {
  const [progress, setProgress] = useState<Map<string, UploadFileState>>(new Map())
  const inFlightRef = useRef(0)
  const orderRef = useRef(baseDisplayOrder)

  const setFileState = useCallback((fileId: string, patch: Partial<UploadFileState>) => {
    setProgress((prev) => {
      const next = new Map(prev)
      const existing = next.get(fileId)
      if (!existing) return prev
      next.set(fileId, { ...existing, ...patch })
      return next
    })
  }, [])

  const clearCompleted = useCallback(() => {
    setProgress((prev) => {
      const next = new Map<string, UploadFileState>()
      for (const [id, state] of prev) {
        if (state.status !== 'saved') next.set(id, state)
      }
      return next
    })
  }, [])

  const processOne = useCallback(
    async (fileId: string, file: File, sourceUrl: string | null) => {
      const supabase = createClient()
      try {
        setFileState(fileId, { status: 'compressing', pct: 10 })
        const compressed = await compressImage(file)

        setFileState(fileId, { status: 'uploading', pct: 50 })
        const storagePath = await uploadEntityImage(supabase, userId, entityId, compressed.blob, 'webp')

        const order = orderRef.current++
        const record = await createEntityImage(supabase, {
          entity_id: entityId,
          user_id: userId,
          storage_path: storagePath,
          display_order: order,
          width: compressed.width,
          height: compressed.height,
          file_size_bytes: compressed.sizeBytes,
          source_url: sourceUrl,
        })

        const url = await getImageUrl(supabase, storagePath)
        setFileState(fileId, { status: 'saved', pct: 100 })
        onSaved({ ...record, url })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setFileState(fileId, { status: 'error', pct: 0, error: message })
        toast.error(`${file.name}: ${message}`)
        throw err
      }
    },
    [userId, entityId, onSaved, setFileState]
  )

  const upload = useCallback(
    async (files: File[], sourceUrl: string | null = null) => {
      if (files.length === 0) return

      const queue: { fileId: string; file: File }[] = files.map((file) => {
        const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`
        return { fileId, file }
      })

      // Seed progress map for all files at once.
      setProgress((prev) => {
        const next = new Map(prev)
        for (const { fileId, file } of queue) {
          next.set(fileId, {
            fileId,
            fileName: file.name,
            pct: 0,
            status: 'compressing',
          })
        }
        return next
      })

      // Simple concurrency limiter.
      let cursor = 0
      const workers: Promise<void>[] = []
      const runNext = async (): Promise<void> => {
        while (cursor < queue.length) {
          const idx = cursor++
          const { fileId, file } = queue[idx]
          inFlightRef.current++
          try {
            await processOne(fileId, file, sourceUrl)
          } catch {
            // error already captured in progress state
          } finally {
            inFlightRef.current--
          }
        }
      }
      for (let i = 0; i < Math.min(MAX_CONCURRENT, queue.length); i++) {
        workers.push(runNext())
      }
      await Promise.all(workers)
    },
    [processOne]
  )

  const anyInFlight = inFlightRef.current > 0

  return { upload, progress, anyInFlight, clearCompleted }
}

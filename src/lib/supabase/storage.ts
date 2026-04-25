import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'entity-images'

/**
 * Upload a (compressed) image blob to Supabase Storage for an entity.
 * Path: {userId}/{entityId}/{uuid}.{ext}
 *
 * Phase 1: caller compresses to WebP via src/lib/image-compression.ts before
 * calling this — no size cap is enforced here because compression already
 * keeps payloads small (max edge 2048px @ q0.85).
 */
export async function uploadEntityImage(
  supabase: SupabaseClient,
  userId: string,
  entityId: string,
  body: Blob,
  ext = 'webp'
): Promise<string> {
  const uuid = crypto.randomUUID()
  const storagePath = `${userId}/${entityId}/${uuid}.${ext}`
  const contentType = body.type || `image/${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, body, {
      contentType,
      upsert: false,
    })

  if (error) throw error
  return storagePath
}

/**
 * Get a URL for a storage path.
 * Tries getPublicUrl first (works if bucket is public).
 * Falls back to signed URL if needed.
 */
export function getImagePublicUrl(
  supabase: SupabaseClient,
  storagePath: string
): string {
  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath)
  return data.publicUrl
}

/**
 * Get a working URL for a storage path — uses signed URL for private buckets.
 */
export async function getImageUrl(
  supabase: SupabaseClient,
  storagePath: string
): Promise<string> {
  // Use signed URL (works regardless of public/private bucket setting)
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600)
  if (error || !data) {
    // Fallback to public URL
    return getImagePublicUrl(supabase, storagePath)
  }
  return data.signedUrl
}

/**
 * Get a signed URL for private bucket access (1 hour expiry).
 */
export async function getImageSignedUrl(
  supabase: SupabaseClient,
  storagePath: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600)

  if (error) throw error
  return data.signedUrl
}

/**
 * Delete an image from storage.
 */
export async function deleteStorageImage(
  supabase: SupabaseClient,
  storagePath: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath])
  if (error) throw error
}

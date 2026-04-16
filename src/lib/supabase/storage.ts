import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'entity-images'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * Upload an image to Supabase Storage for an entity.
 * Path: {userId}/{entityId}/{uuid}.{ext}
 */
export async function uploadEntityImage(
  supabase: SupabaseClient,
  userId: string,
  entityId: string,
  file: File
): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Image trop volumineuse (max 5 Mo)')
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  if (!allowedExts.includes(ext)) {
    throw new Error('Format non supporté. Utilisez JPG, PNG ou WebP.')
  }

  const uuid = crypto.randomUUID()
  const storagePath = `${userId}/${entityId}/${uuid}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
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

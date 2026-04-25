import imageCompression from 'browser-image-compression'

export interface CompressedImage {
  blob: Blob
  width: number
  height: number
  sizeBytes: number
  mimeType: string
}

const MAX_WIDTH_OR_HEIGHT = 2048
const QUALITY = 0.85

/**
 * Compress a user-supplied image to WebP at quality 0.85, max edge 2048 px.
 * Returns the compressed blob plus measured dimensions and final byte size.
 *
 * EXIF is preserved by browser-image-compression's default behavior.
 *
 * Throws if the file isn't decodable as an image (corrupt, HEIC unsupported by
 * Safari's <img>, etc.). Caller is expected to surface the error to the user.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: MAX_WIDTH_OR_HEIGHT,
    initialQuality: QUALITY,
    fileType: 'image/webp',
    useWebWorker: true,
    preserveExif: true,
  })

  const dims = await measureDimensions(compressed)

  return {
    blob: compressed,
    width: dims.width,
    height: dims.height,
    sizeBytes: compressed.size,
    mimeType: compressed.type || 'image/webp',
  }
}

function measureDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

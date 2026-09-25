/* ==========================================================================
 * PayKal — préparation des captures d'écran de reçu
 * --------------------------------------------------------------------------
 * Les captures prises sur téléphone pèsent souvent 3 à 6 Mo. On les
 * redimensionne et recompresse côté navigateur avant l'envoi vers Supabase
 * Storage : téléversement plus rapide, stockage plus léger, et l'on reste
 * sous la limite des 8 Mo.
 * ========================================================================== */

import { MAX_PROOF_BYTES } from './config'

export interface PreparedImage {
  blob: Blob
  file: File
  dataUrl: string
  width: number
  height: number
  originalBytes: number
  bytes: number
  compressed: boolean
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif']

export function isAcceptedProof(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type.toLowerCase())) return true
  // Certains navigateurs mobiles ne renseignent pas le type : on se fie à l'extension.
  return /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function loadImage(file: File, timeoutMs = 12000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    let settled = false
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      URL.revokeObjectURL(url)
      action()
    }
    const timer = window.setTimeout(
      () => finish(() => reject(new Error('Décodage de l’image trop long : le fichier d’origine sera utilisé.'))),
      timeoutMs,
    )
    image.onload = () => finish(() => resolve(image))
    image.onerror = () =>
      finish(() => reject(new Error('Impossible de lire cette image. Essayez une capture PNG ou JPG.')))
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Compression de l’image impossible.'))
      },
      'image/jpeg',
      quality,
    )
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Redimensionne (max `maxDimension` px) et recompresse en JPEG.
 * Si la compression échoue ou grossit le fichier, l'original est conservé.
 */
export async function prepareProof(file: File, maxDimension = 1600, quality = 0.82): Promise<PreparedImage> {
  if (!isAcceptedProof(file)) {
    throw new Error('Format non pris en charge. Utilisez une capture PNG, JPG ou WEBP.')
  }
  if (file.size > MAX_PROOF_BYTES) {
    throw new Error(`Fichier trop volumineux (${humanSize(file.size)}). Maximum : 8 Mo.`)
  }

  try {
    const image = await loadImage(file)
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas indisponible dans ce navigateur.')
    // Fond blanc : évite les zones noires si l'image d'origine a de la transparence.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    const blob = await canvasToBlob(canvas, quality)
    if (blob.size >= file.size && scale === 1) {
      // La « compression » n'apporte rien : on garde l'original.
      return {
        blob: file,
        file,
        dataUrl: await blobToDataUrl(file),
        width: image.naturalWidth,
        height: image.naturalHeight,
        originalBytes: file.size,
        bytes: file.size,
        compressed: false,
      }
    }

    const baseName = (file.name || 'recu').replace(/\.[^.]+$/, '')
    const compressedFile = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
    return {
      blob,
      file: compressedFile,
      dataUrl: await blobToDataUrl(blob),
      width,
      height,
      originalBytes: file.size,
      bytes: blob.size,
      compressed: true,
    }
  } catch (error) {
    // Dernier recours : envoi de l'original tel quel.
    if (file.size <= MAX_PROOF_BYTES) {
      return {
        blob: file,
        file,
        dataUrl: await blobToDataUrl(file),
        width: 0,
        height: 0,
        originalBytes: file.size,
        bytes: file.size,
        compressed: false,
      }
    }
    throw error
  }
}

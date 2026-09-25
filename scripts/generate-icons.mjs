/* ==========================================================================
 * PayKal — génération des icônes PNG de la PWA
 * --------------------------------------------------------------------------
 * Écrit les PNG (192, 512, maskable 512, apple-touch 180) sans aucune
 * dépendance externe : encodage PNG maison basé sur zlib (module `node:zlib`).
 *
 *   node scripts/generate-icons.mjs
 * ========================================================================== */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(__dirname, '..', 'public', 'icons')
const SS = 3 // facteur de sur-échantillonnage (anti-aliasing)

/* ------------------------------- Encodage PNG ------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // profondeur 8 bits
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0 // filtre "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* --------------------------------- Dessin --------------------------------- */

const TEAL_TOP = [18, 166, 159]
const TEAL_BOTTOM = [6, 95, 91]
const AMBER_TOP = [255, 218, 101]
const AMBER_BOTTOM = [223, 155, 0]

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
]

/** Test d'appartenance à un rectangle aux coins arrondis. */
function insideRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2 || (x >= x0 + r && x <= x1 - r) || (y >= y0 + r && y <= y1 - r)
}

/** Coordonnées normalisées 0..1 → test d'appartenance des formes. */
function shapeAt(x, y, options) {
  // x, y : 0..1 ; renvoie [r, g, b, a]
  const { maskable, scale = 1, offset = 0 } = options

  // --- Fond ---
  let background = null
  const radius = maskable ? 0 : 0.225 // ~116/512
  const inRounded =
    radius === 0 ||
    (x > radius && x < 1 - radius) ||
    (y > radius && y < 1 - radius) ||
    (x - radius) ** 2 + (y - radius) ** 2 < radius ** 2 ||
    (x - (1 - radius)) ** 2 + (y - radius) ** 2 < radius ** 2 ||
    (x - radius) ** 2 + (y - (1 - radius)) ** 2 < radius ** 2 ||
    (x - (1 - radius)) ** 2 + (y - (1 - radius)) ** 2 < radius ** 2
  if (inRounded) background = mix(TEAL_TOP, TEAL_BOTTOM, y)

  // Logo recentré / mis à l'échelle (zone sûre pour les icônes maskable)
  const lx = (x - 0.5) / scale + 0.5 + offset
  const ly = (y - 0.5) / scale + 0.5 + offset

  let color = background

  // --- Bulle de discussion blanche ---
  const bubble = insideRoundedRect(lx, ly, 0.225, 0.215, 0.775, 0.665, 0.09)
  const tail =
    ly >= 0.6 &&
    ly < 0.86 &&
    lx > 0.245 &&
    lx < 0.5 &&
    insideRoundedRect(lx, ly, 0.245, 0.6, lx + 0.001, 0.86, 0.02) &&
    lx - 0.245 < (0.86 - ly) * 1.05
  if (bubble || tail) color = [255, 255, 255]

  // --- Pièce ambre avec un « + » ---
  const coinDistance = Math.hypot(lx - 0.5, ly - 0.45)
  if (coinDistance < 0.145) {
    color = mix(AMBER_TOP, AMBER_BOTTOM, (ly - 0.3) / 0.3)
    // Croix blanche
    const plus = Math.abs(lx - 0.5) < 0.022 || Math.abs(ly - 0.45) < 0.022
    const inPlus = plus && Math.abs(lx - 0.5) < 0.098 && Math.abs(ly - 0.45) < 0.098
    if (inPlus) color = [255, 255, 255]
  }

  if (!color) return [0, 0, 0, 0]
  return [color[0], color[1], color[2], 255]
}

function renderIcon(size, { maskable = false, logoScale = 1 } = {}) {
  const rgba = Buffer.alloc(size * size * 4)
  const options = { maskable, scale: logoScale }
  const sub = SS * SS

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (px + (sx + 0.5) / SS) / size
          const y = (py + (sy + 0.5) / SS) / size
          const [cr, cg, cb, ca] = shapeAt(x, y, options)
          r += cr * ca
          g += cg * ca
          b += cb * ca
          a += ca
        }
      }
      const index = (py * size + px) * 4
      if (a > 0) {
        rgba[index] = Math.round(r / a)
        rgba[index + 1] = Math.round(g / a)
        rgba[index + 2] = Math.round(b / a)
        rgba[index + 3] = Math.round(a / sub)
      }
    }
  }

  return encodePng(size, size, rgba)
}

/* ---------------------------------- Sortie -------------------------------- */

mkdirSync(OUTPUT_DIR, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, options: {} },
  { file: 'icon-512.png', size: 512, options: {} },
  { file: 'maskable-512.png', size: 512, options: { maskable: true, logoScale: 0.72 } },
  { file: 'apple-touch-icon.png', size: 180, options: {} },
  { file: 'favicon-48.png', size: 48, options: {} },
]

for (const target of targets) {
  const png = renderIcon(target.size, target.options)
  const path = resolve(OUTPUT_DIR, target.file)
  writeFileSync(path, png)
  console.log(`✅ ${target.file} — ${target.size}×${target.size} (${(png.length / 1024).toFixed(1)} Ko)`)
}

console.log(`\nIcônes PWA générées dans ${OUTPUT_DIR}`)

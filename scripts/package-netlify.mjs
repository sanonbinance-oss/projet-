/* ==========================================================================
 * PayKal — création de l'archive ZIP prête pour Netlify Drop
 * --------------------------------------------------------------------------
 * Le contenu du ZIP est EXACTEMENT celui de dist/, à sa racine :
 *
 *   paykal-netlify-dist.zip
 *   ├── index.html
 *   ├── _redirects
 *   ├── _headers
 *   ├── manifest.webmanifest
 *   ├── sw.js
 *   ├── favicon.svg
 *   ├── robots.txt
 *   ├── assets/…
 *   └── icons/…
 *
 * Utilise l'outil système `zip` s'il est disponible (portable, préserve les
 * noms de fichiers), sinon un repli Node (moteur ZIP 100 % intégré).
 *
 *   node scripts/package-netlify.mjs [nom-archive.zip]
 * ========================================================================== */

import { execFileSync } from 'node:child_process'
import { deflateRawSync, crc32 as zlibCrc32 } from 'node:zlib'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = join(ROOT, 'dist')
const archiveName = process.argv[2] ?? 'paykal-netlify-dist.zip'
const ARCHIVE = resolve(ROOT, archiveName)

if (!existsSync(DIST)) {
  console.error('❌ dist/ introuvable. Lancez d’abord : npm install && npm run build')
  process.exit(1)
}

for (const required of ['index.html', '_redirects', 'manifest.webmanifest', 'sw.js']) {
  if (!existsSync(join(DIST, required))) {
    console.error(`❌ dist/${required} est absent : lancez « npm run build » avant de créer l’archive.`)
    process.exit(1)
  }
}

/* ------------------------- Repli : moteur ZIP Node ------------------------ */

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
  if (typeof zlibCrc32 === 'function') return zlibCrc32(buffer) >>> 0
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear())
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

function walk(directory, base = directory) {
  const entries = []
  for (const name of readdirSync(directory).sort()) {
    const full = join(directory, name)
    const stats = statSync(full)
    if (stats.isDirectory()) entries.push(...walk(full, base))
    else if (stats.isFile()) entries.push({ full, relative: relative(base, full).split(/[\\/]/).join('/'), size: stats.size, mtime: stats.mtime })
  }
  return entries
}

function createZipWithNode(outputPath, files) {
  const localParts = []
  const centralParts = []
  let offset = 0
  const { time, day } = dosDateTime()

  for (const file of files) {
    const nameBuffer = Buffer.from(file.relative, 'utf8')
    const content = readFileSync(file.full)
    const compressed = deflateRawSync(content, { level: 9 })
    const useDeflate = compressed.length < content.length
    const data = useDeflate ? compressed : content
    const method = useDeflate ? 8 : 0
    const crc = crc32(content)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4) // version requise
    localHeader.writeUInt16LE(0x0800, 6) // noms UTF-8
    localHeader.writeUInt16LE(method, 8)
    localHeader.writeUInt16LE(time, 10)
    localHeader.writeUInt16LE(day, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(content.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localParts.push(localHeader, nameBuffer, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(method, 10)
    centralHeader.writeUInt16LE(time, 12)
    centralHeader.writeUInt16LE(day, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(content.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    centralParts.push(centralHeader, nameBuffer)
    offset += localHeader.length + nameBuffer.length + data.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  writeFileSync(outputPath, Buffer.concat([...localParts, centralDirectory, end]))
}

/* ------------------------------- Création -------------------------------- */

if (existsSync(ARCHIVE)) rmSync(ARCHIVE)

let methodUsed = 'zip (outil système)'
try {
  // Chemin ABSOLU en sortie : le dossier courant est dist/, l'archive doit
  // être créée à la racine du projet (et non dans dist/).
  execFileSync('zip', ['-r', '-9', '-q', ARCHIVE, '.'], { cwd: DIST, stdio: 'inherit' })
} catch {
  methodUsed = 'moteur ZIP interne (Node)'
  const files = walk(DIST)
  createZipWithNode(ARCHIVE, files)
}

const size = statSync(ARCHIVE).size
console.log('\n=============================================================')
console.log(' Archive Netlify PayKal générée')
console.log('=============================================================')
console.log(`📦 Fichier   : ${ARCHIVE}`)
console.log(`📊 Taille    : ${(size / 1024).toFixed(1)} Ko`)
console.log(`🧰 Méthode   : ${methodUsed}`)
console.log('📁 Contenu   : index.html, _redirects, _headers, manifest.webmanifest, sw.js, assets/, icons/ (à la racine)')
console.log('=============================================================')
console.log('\n➡️  Déploiement : ouvrez https://app.netlify.com/drop puis glissez-déposez ')
console.log('    ce fichier ZIP (ou le dossier dist/ entier).\n')

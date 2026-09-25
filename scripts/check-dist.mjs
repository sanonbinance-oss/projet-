/* ==========================================================================
 * PayKal — vérification du dossier dist/ après le build
 * --------------------------------------------------------------------------
 * Exécuté automatiquement par `npm run build` (script `postbuild`).
 * Garantit que l'archive Netlify est déployable telle quelle :
 *   - index.html À LA RACINE de dist/ (jamais dans dist/pwa/)
 *   - _redirects contenant « /* /index.html 200 »
 *   - manifest.webmanifest valide (nom + icônes 192/512)
 *   - sw.js présent
 *   - dossier assets/ à la racine + liens index.html corrects
 * ========================================================================== */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '..', 'dist')

const failures = []
const warnings = []
const checks = []

function ok(label, detail = '') {
  checks.push({ status: 'ok', label, detail })
}
function fail(label, detail) {
  checks.push({ status: 'fail', label, detail })
  failures.push(`${label} — ${detail}`)
}
function warn(label, detail) {
  checks.push({ status: 'warn', label, detail })
  warnings.push(`${label} — ${detail}`)
}

/* ------------------------------- Présence -------------------------------- */

if (!existsSync(DIST)) {
  console.error('❌ dist/ introuvable : lancez `npm run build` avant ce contrôle.')
  process.exit(1)
}

const requiredFiles = ['index.html', '_redirects', 'manifest.webmanifest', 'sw.js', 'favicon.svg']
for (const file of requiredFiles) {
  const path = join(DIST, file)
  if (existsSync(path)) {
    ok(`${file} à la racine de dist/`, `${(statSync(path).size / 1024).toFixed(1)} Ko`)
  } else {
    fail(`${file} manquant`, `Attendu à la racine de dist/ (${path})`)
  }
}

/* ------------------------- Absence de sous-dossier pwa/ ------------------- */

if (existsSync(join(DIST, 'pwa'))) {
  fail('Sous-dossier dist/pwa/ détecté', 'index.html doit être à la RACINE de dist/, pas dans dist/pwa/.')
} else {
  ok('Aucun sous-dossier pwa/', 'Structure conforme pour Netlify Drop')
}

/* ---------------------------- Dossier assets/ ---------------------------- */

const assetsDir = join(DIST, 'assets')
if (existsSync(assetsDir)) {
  const files = readdirSync(assetsDir)
  const js = files.filter((file) => file.endsWith('.js'))
  const css = files.filter((file) => file.endsWith('.css'))
  if (js.length > 0 && css.length > 0) {
    ok('assets/ à la racine', `${js.length} fichier(s) JS, ${css.length} fichier(s) CSS`)
  } else {
    warn('assets/ incomplet', `JS: ${js.length}, CSS: ${css.length}`)
  }
} else {
  fail('dossier assets/ manquant', 'Le build doit produire dist/assets/')
}

/* ------------------------------ _redirects ------------------------------- */

if (existsSync(join(DIST, '_redirects'))) {
  const content = readFileSync(join(DIST, '_redirects'), 'utf8')
  if (/\/\*\s+\/index\.html\s+200/.test(content)) {
    ok('Règle SPA _redirects', '« /* /index.html 200 » présente')
  } else {
    fail('Règle SPA absente de _redirects', `Contenu trouvé : ${JSON.stringify(content.trim().slice(0, 80))}`)
  }
}

/* --------------------------- manifest.webmanifest ------------------------ */

if (existsSync(join(DIST, 'manifest.webmanifest'))) {
  try {
    const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'))
    if (!manifest.name || !manifest.short_name) {
      warn('Manifest sans name/short_name', 'Requis pour l’installation PWA.')
    } else {
      ok('Manifest lisible', `${manifest.name} · start_url ${manifest.start_url}`)
    }
    const sizes = (manifest.icons ?? []).map((icon) => icon.sizes)
    if (sizes.includes('192x192') && sizes.includes('512x512')) {
      ok('Icônes PWA 192 & 512', sizes.join(', '))
    } else {
      warn('Icônes PWA incomplètes', `Tailles déclarées : ${sizes.join(', ') || '(aucune)'}`)
    }
    const missingIcons = (manifest.icons ?? [])
      .map((icon) => String(icon.src).replace(/^\//, ''))
      .filter((src) => !src.endsWith('.svg') && !existsSync(join(DIST, src)))
    if (missingIcons.length > 0) {
      fail('Icônes du manifest absentes de dist/', missingIcons.join(', '))
    } else {
      ok('Fichiers d’icônes présents', `${(manifest.icons ?? []).length} icône(s)`)
    }
  } catch (error) {
    fail('manifest.webmanifest illisible', String(error))
  }
}

/* -------------------------------- sw.js ---------------------------------- */

if (existsSync(join(DIST, 'sw.js'))) {
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8')
  if (sw.includes('/index.html') && sw.includes("mode === 'navigate'")) {
    ok('Service Worker adapté au routing SPA', 'Repli de navigation vers index.html détecté')
  } else {
    warn('Service Worker sans repli de navigation', 'Les routes profondes peuvent échouer hors-ligne.')
  }
}

/* --------------------------- index.html et liens ------------------------- */

if (existsSync(join(DIST, 'index.html'))) {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8')
  if (/src="\/assets\//.test(html) && /href="\/assets\//.test(html)) {
    ok('Liens absolus /assets/ dans index.html', 'Compatible racine de site Netlify')
  } else if (/src="\.\/assets\//.test(html)) {
    fail('Liens relatifs ./assets/ dans index.html', 'Utilisez base: "/" dans vite.config.ts')
  } else {
    warn('Liens assets non détectés', 'Vérifiez la balise <script type="module"> d’index.html')
  }
  if (html.includes('/manifest.webmanifest') && html.includes('/sw.js') === false) {
    ok('Manifest référencé dans index.html', '')
  }
  if (html.includes('id="root"')) {
    ok('Point de montage React (#root) présent', '')
  } else {
    fail('Élément #root absent d’index.html', 'React ne peut pas se monter.')
  }
  if (/\/src\/main\.tsx/.test(html)) {
    fail('index.html référence le source TypeScript', 'Le build a copié le fichier source au lieu de le compiler.')
  }
}

/* -------------------------- Variables compilées -------------------------- */

const jsFiles = existsSync(assetsDir) ? readdirSync(assetsDir).filter((file) => file.endsWith('.js')) : []
const bundleText = jsFiles.map((file) => readFileSync(join(assetsDir, file), 'utf8')).join('\n')

if (bundleText.includes('sxtlttaswhodbtcjjdyn.supabase.co')) {
  ok('URL Supabase de repli compilée dans le bundle', 'https://sxtlttaswhodbtcjjdyn.supabase.co')
} else {
  fail('URL Supabase de repli absente du bundle', 'Vérifiez src/lib/config.ts')
}

if (bundleText.includes('sb_publishable_52fS1oqVHBvScTshCyU2lQ_dWruxGkn')) {
  ok('Clé publique Supabase compilée dans le bundle', 'fallback actif')
} else {
  fail('Clé publique Supabase absente du bundle', 'Vérifiez src/lib/config.ts')
}

if (bundleText.includes('074452674')) {
  ok('Numéro de transfert compilé dans le bundle', '074452674')
} else {
  warn('Numéro de transfert introuvable', 'Vérifiez TRANSFER_NUMBER dans src/lib/config.ts')
}

/* ------------------------------ Routes SPA ------------------------------- */

const routeNeedles = ['/admin/transactions', '/admin/messages', '/admin/clients', '/recharger', '/transactions', '/messages', '/diagnostic']
const missingRoutes = routeNeedles.filter((route) => !bundleText.includes(route))
if (missingRoutes.length === 0) {
  ok('Routes client + admin présentes dans le bundle', routeNeedles.join(' · '))
} else {
  fail('Routes manquantes dans le bundle', missingRoutes.join(', '))
}

/* -------------------------------- Résumé -------------------------------- */

const icon = (status) => (status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌')
console.log('\n=============================================================')
console.log(' PayKal — contrôle du build (dist/)')
console.log('=============================================================')
for (const check of checks) {
  console.log(`${icon(check.status)} ${check.label}${check.detail ? ` — ${check.detail}` : ''}`)
}
console.log('-------------------------------------------------------------')
console.log(`${checks.filter((c) => c.status === 'ok').length} OK · ${warnings.length} avertissement(s) · ${failures.length} erreur(s)`)
console.log('=============================================================\n')

if (failures.length > 0) {
  console.error('❌ Le dossier dist/ n’est pas déployable en l’état :')
  for (const failure of failures) console.error(`   • ${failure}`)
  process.exit(1)
}

console.log('🎉 dist/ est prêt pour Netlify (index.html, _redirects, manifest.webmanifest, sw.js, assets/ à la racine).')

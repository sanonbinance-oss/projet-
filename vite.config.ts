import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * PayKal — configuration Vite
 *
 * Contraintes Netlify / PWA :
 *  - `base: '/'`        => index.html et le dossier `assets/` DOIVENT être à la racine de dist/
 *  - `outDir: 'dist'`   => dossier publié sur Netlify (Netlify Drop : glisser le CONTENU de dist/)
 *  - `server/preview.allowedHosts: true` => autorise les domaines de prévisualisation
 *    (types "") utilisés par l'environnement d'aperçu.
 */
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Noms stables et hachés : compatibles avec les en-têtes immuables de Netlify.
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
    allowedHosts: true,
  },
})

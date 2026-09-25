# PayKal — Livraison du build Netlify

> **Statut : livré et vérifié ✅** — archive prête à glisser-déposer sur Netlify Drop :
> **`paykal-netlify-dist.zip`** (447 Ko, 41 fichiers, `index.html` à la racine).

---

## 1. Ce qui a été vérifié avant livraison

### Compilation (`npm install` puis `npm run build`)

```
✅ 19 contrôles du dossier dist/ — 0 avertissement, 0 erreur
✅ index.html, _redirects, _headers, manifest.webmanifest, sw.js, favicon.svg, robots.txt à la racine
✅ Aucun sous-dossier dist/pwa/ (contrôle bloquant dans le build)
✅ assets/ à la racine + liens absolus /assets/… dans index.html
✅ Règle SPA « /* /index.html 200 » présente dans _redirects
✅ Manifest lisible : icônes 192×192, 512×512, maskable 512, apple-touch 180 (fichiers réellement présents)
✅ Service Worker adapté au routing SPA (repli de navigation vers index.html)
✅ URL Supabase de repli, clé publique et numéro 074452674 bien compilés dans le bundle
✅ Routes client + admin présentes dans le bundle
```

### Tests fonctionnels (`npm test` — 24 tests, tous verts)

| Domaine | Vérifié |
| --- | --- |
| Authentification | Écran de connexion avec les **2 interfaces** (Client/Parent · Administration), refus des identifiants invalides, création de compte client |
| Rechargement client | Affichage de **074452674**, validation du montant, exigence de la **capture du reçu**, dépôt de la demande + **référence générée**, bouton **reçu PDF** |
| Suivi client | Statuts **En attente / Validé / Refusé**, filtres, téléchargement du reçu PDF |
| Messagerie client | Envoi et affichage d'un message à destination de l'administration |
| Admin | Tableau de bord, **file d'attente de validation**, **affichage de la preuve (capture)**, **validation** d'un paiement, **refus** avec motif obligatoire, messagerie globale, fichier clients |
| Sécurité des rôles | Visiteur non connecté → redirigé vers la connexion ; client connecté → exclu de `/admin` |
| Routage | Route inconnue → page 404 PayKal ; page `/diagnostic` fonctionnelle |
| Configuration | Repli Supabase compilé, client Supabase unique (Auth + base + Storage + Realtime) |
| Documents | Reçu **PDF** réellement généré (jsPDF) et **export CSV** administratif |

### Vérification du site compilé servi en HTTP

```
index.html : 2 395 octets, 7 ressources référencées → 11 × HTTP 200, 0 erreur
/admin/transactions · /recharger · /messages · /profil · /route-inconnue → index.html servi (SPA OK)
_redirects : « /*    /index.html   200 »        manifest start_url : /?source=pwa
sw.js : 6 477 octets · repli de navigation SPA présent
```

### Test du mode développement

```
npm run dev → serveur prêt en 205 ms, HTTP 200, module /src/main.tsx servi correctement
```

> ⚠️ **Point à connaître** : l'environnement de construction utilisé ici bloque les connexions vers
> `*.supabase.co` (pare-feu du bac à sable). Les appels Supabase doivent donc être validés **depuis
> votre navigateur**. C'est justement pour cela que l'application a été dotée d'un **repli intégré** :
> si Supabase ne répond pas, elle affiche un bandeau explicite et propose le mode démonstration, au
> lieu d'écrire « Failed to fetch ».

---

## 2. Déploiement en 3 étapes

1. Ouvrez **<https://app.netlify.com/drop>**.
2. Glissez-déposez **`paykal-netlify-dist.zip`** (ou le dossier `dist/`).
3. Le site est en ligne. Chaque route (`/admin`, `/recharger`, `/transactions`, `/messages`…) est
   accessible directement grâce à `_redirects`.

### Pour activer le backend Supabase (obligatoire pour les données réelles)

1. <https://supabase.com/dashboard> → projet **sxtlttaswhodbtcjjdyn** → **SQL Editor**.
2. Collez **tout** le contenu de `supabase/schema.sql` → **Run**.
   *(tables `profiles`/`transactions`/`messages`, politiques RLS, bucket Storage `receipts` 8 Mo, Realtime)*
3. **Authentication → Providers → Email** : désactivez « Confirm email » pour des comptes actifs
   immédiatement, ou laissez-le activé et demandez aux clients de confirmer leur e-mail.
4. **Authentication → URL Configuration** : ajoutez l'URL Netlify (`https://votre-site.netlify.app`).
5. Créez votre compte depuis l'application, puis passez-le en administrateur :

   ```sql
   update public.profiles set role = 'admin' where email = 'votre-admin@exemple.com';
   ```

6. Ouvrez `/diagnostic` sur le site déployé : chaque ligne passe au vert (URL, clé, endpoint Auth,
   table `transactions`, bucket `receipts`, Service Worker, manifest, règle SPA).

---

## 3. Configuration Supabase (repli déjà intégré, rien à faire sur Netlify)

```ts
// src/lib/config.ts
const url     = import.meta.env.VITE_SUPABASE_URL      || "https://sxtlttaswhodbtcjjdyn.supabase.co"
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_52fS1oqVHBvScTshCyU2lQ_dWruxGkn"
```

Les variables d'environnement Netlify sont donc **facultatives** : même absentes, le build se connecte
au bon projet. Si vous les définissez, utilisez exactement les noms `VITE_SUPABASE_URL` et
`VITE_SUPABASE_ANON_KEY` (voir `.env.example`).

---

## 4. Interfaces livrées

**Espace client / parent**
`/` accueil (numéro de transfert, statistiques, actions rapides) · `/recharger` (montant, moyen de
paiement Wave/Orange Money/MTN/Moov, téléversement de la capture avec compression automatique,
référence de suivi) · `/transactions` (En attente / Validé / Refusé + reçu PDF) · `/messages`
(messagerie avec l'administration) · `/profil` (profil, installation PWA, mode démo).

**Espace administration**
`/admin` tableau de bord (file d'attente, messages non lus, dernières activités) ·
`/admin/transactions` (recherche, filtres, **capture du reçu en plein écran avec zoom**,
**Valider / Refuser** avec motif, notification automatique au client, export CSV) ·
`/admin/messages` (messagerie globale toutes conversations) · `/admin/clients` (volumes rechargés,
demandes en attente, ouverture directe d'une conversation) · `/diagnostic` (diagnostic technique).

**Confort d'exploitation** : PWA installable (manifest + Service Worker, icônes 192/512/maskable),
temps réel Supabase (les deux interfaces se rafraîchissent sans rechargement), repli mode
démonstration, messages d'erreur en français expliquant la cause et la correction.

---

## 5. Fichiers remis

| Fichier | Rôle |
| --- | --- |
| **`paykal-netlify-dist.zip`** | **Archive prête pour Netlify Drop** (`index.html`, `_redirects`, `_headers`, `manifest.webmanifest`, `sw.js`, `assets/`, `icons/` à la racine) |
| `dist/` | Même contenu, non compressé |
| `supabase/schema.sql` | Schéma complet à exécuter une fois dans Supabase |
| `README.md` | Installation, routes, configuration, dépannage |
| `scripts/check-dist.mjs` | Contrôle automatique du build (exécuté après chaque `npm run build`) |
| `scripts/package-netlify.mjs` | Régénère l'archive ZIP (`npm run package:netlify`) |
| `scripts/generate-icons.mjs` | Régénère les icônes PWA (`node scripts/generate-icons.mjs`) |
| `src/test/paykal.test.tsx` | 24 tests de parcours client + admin |

### Régénérer entièrement la livraison

```bash
npm install
npm test                  # 24 tests
npm run build             # build + 19 contrôles de conformité
npm run package:netlify   # paykal-netlify-dist.zip
```

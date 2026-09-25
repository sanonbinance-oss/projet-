# PayKal — PWA de messagerie et de rechargement/paiement

Application web progressive (React + TypeScript + Vite + Supabase) réunissant **deux interfaces** :

| Interface | Rôle | Fonctions |
| --- | --- | --- |
| **Espace client / parent** | `client` | Création de compte, connexion, **messagerie** avec l'administration, **rechargement** : affichage du numéro de transfert **074452674**, saisie du montant, téléversement de la capture du reçu, suivi **En attente / Validé / Refusé** et **téléchargement du reçu PDF** |
| **Espace administration** | `admin` | **Tableau de bord**, vue détaillée des paiements reçus avec **affichage des preuves/captures téléversées**, **validation ou refus** de chaque paiement (avec motif), **messagerie globale** pour répondre aux clients, fichier clients, export CSV |

---

## 1. Démarrage rapide

```bash
npm install       # installe les dépendances
npm run dev       # serveur de développement : http://localhost:5173
npm test          # 24 tests de parcours (client + admin) en mode démonstration
npm run build     # build de production + contrôle automatique de dist/
npm run package:netlify   # crée l'archive paykal-netlify-dist.zip
```

> **Sans backend**, l'application reste entièrement navigable : un **mode démonstration**
> (données locales dans le navigateur) s'active depuis l'écran de connexion ou automatiquement
> si Supabase est injoignable. Aucun écran blanc, aucune erreur « Failed to fetch ».

---

## 2. Configuration Supabase (repli intégré)

Les identifiants **publics** sont codés en repli dans `src/lib/config.ts` :

```ts
const url     = import.meta.env.VITE_SUPABASE_URL      || "https://sxtlttaswhodbtcjjdyn.supabase.co"
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_52fS1oqVHBvScTshCyU2lQ_dWruxGkn"
```

Conséquence : **même si vous oubliez les variables d'environnement sur Netlify, l'application se connecte
quand même** au bon projet Supabase — c'est ce qui supprime le cas classique du « Failed to fetch »
dû à une variable manquante au moment du build.

Les variables restent utilisables (Site settings → Environment variables) :

| Variable | Valeur |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://sxtlttaswhodbtcjjdyn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_52fS1oqVHBvScTshCyU2lQ_dWruxGkn` |
| `VITE_TRANSFER_NUMBER` *(optionnel)* | `074452674` |
| `VITE_CURRENCY` *(optionnel)* | `XOF` |

### 2.1 Créer les tables, la sécurité et le Storage

1. Ouvrez <https://supabase.com/dashboard> → projet `sxtlttaswhodbtcjjdyn`.
2. **SQL Editor** → *New query* → collez tout le contenu de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Le script crée les tables `profiles`, `transactions`, `messages`, les politiques RLS, le bucket
   Storage **receipts** (8 Mo max, images) et active le Realtime sur les transactions et messages.
3. **Authentication → Providers → Email** : désactivez *Confirm email* si vous voulez que les comptes
   soient actifs immédiatement après l'inscription (sinon l'utilisateur doit confirmer par e-mail).
4. **Authentication → URL Configuration** : ajoutez l'URL Netlify (et `http://localhost:5173` en local)
   dans *Site URL* / *Redirect URLs*.
5. **Passer un compte en administrateur** : créez le compte depuis l'application, puis exécutez

   ```sql
   update public.profiles set role = 'admin' where email = 'votre-admin@exemple.com';
   ```

6. Ouvrez `/diagnostic` dans l'application : un contrôle visuel confirme en un écran que l'URL, la clé,
   l'endpoint Auth, la table `transactions`, le bucket `receipts`, le Service Worker, le manifest et la
   règle SPA sont opérationnels.

---

## 3. Déploiement Netlify (glisser-déposer)

```bash
npm run build              # produit dist/ et vérifie sa conformité (19 contrôles)
npm run package:netlify    # produit paykal-netlify-dist.zip
```

Puis <https://app.netlify.com/drop> → déposez **`paykal-netlify-dist.zip`** (ou le dossier `dist/`).

### Structure exigée — et garantie par le build

```
dist/                     ← racine du site (index.html À LA RACINE, jamais dans pwa/)
├── index.html
├── _redirects            ← /*    /index.html   200        (routing SPA)
├── _headers              ← cache du SW/index + en-têtes de sécurité
├── manifest.webmanifest
├── sw.js                 ← Service Worker (repli de navigation SPA)
├── favicon.svg
├── robots.txt
├── assets/               ← JS/CSS hachés
└── icons/                ← icon-192, icon-512, maskable-512, apple-touch-icon
```

- **Routing SPA** : `public/_redirects` contient `/* /index.html 200`, donc `/admin`, `/recharger`,
  `/transactions`, `/messages`… fonctionnent en accès direct et au rafraîchissement (F5).
- **PWA** : `manifest.webmanifest` (icônes 192/512 + maskable, `display: standalone`, raccourcis) et
  `sw.js` (coquille applicative en cache, repli de navigation, **jamais** de cache sur les requêtes
  Supabase, purge des anciens caches à chaque nouvelle version).
- **Anti-sous-dossier `pwa/`** : `vite.config.ts` fixe `base: '/'` et `outDir: 'dist'` ; `npm run build`
  échoue explicitement si un dossier `dist/pwa/` apparaît.

---

## 4. Routes de l'application

| Route | Accès | Contenu |
| --- | --- | --- |
| `/connexion`, `/login` | public | Connexion avec sélecteur **Client / Administration** |
| `/inscription`, `/register` | public | Création de compte client |
| `/` | client | Accueil : numéro de transfert, statistiques, actions rapides |
| `/recharger` | client | Numéro **074452674**, montant, moyen de paiement, capture du reçu |
| `/transactions` | client | Suivi **En attente / Validé / Refusé** + reçu PDF |
| `/messages` | client | Messagerie avec l'administration |
| `/profil` | client | Profil, installation PWA, mode démo |
| `/admin` | admin | Tableau de bord + file d'attente de validation |
| `/admin/transactions` | admin | Vue détaillée, **preuves**, **Valider / Refuser**, export CSV |
| `/admin/messages` | admin | Messagerie globale (toutes les conversations) |
| `/admin/clients` | admin | Fichier clients, volumes, demandes en attente |
| `/diagnostic` | tous | Diagnostic technique |

---

## 5. Comptes de démonstration (mode démo uniquement)

| Rôle | E-mail | Mot de passe |
| --- | --- | --- |
| Administrateur | `admin@paykal.app` | `Admin#2024` |
| Client | `client@paykal.app` | `Client#2024` |
| Client | `moussa@paykal.app` | `Client#2024` |

Le mode démo se force aussi par l'URL : `https://votre-site.netlify.app/?demo=1`.

---

## 6. Structure du projet

```
src/
├── App.tsx                 Routage SPA (lazy loading par écran)
├── main.tsx                Entrée + enregistrement du Service Worker
├── pwa.ts                  Service Worker, invite d'installation, état réseau
├── styles.css              Design system complet (mobile-first)
├── components/             AppShell, ChatView, TransactionCard, ProofViewer, ReviewDialog, ui
├── context/                SessionContext (auth + mode), ToastContext (notifications)
├── hooks/                  useUnread (badges de messages non lus)
├── lib/
│   ├── config.ts           Repli Supabase, numéro de transfert, constantes métier
│   ├── supabaseClient.ts   Client Supabase (création unique)
│   ├── api.ts              API « live » : Auth, PostgreSQL, Realtime, Storage
│   ├── demoApi.ts          Backend de démonstration (localStorage)
│   ├── backend.ts          Sélection live/démo + test de joignabilité
│   ├── pdf.ts              Reçu PDF (jsPDF, chargé à la demande)
│   ├── csv.ts              Export CSV (admin)
│   ├── diagnostics.ts      Contrôles de diagnostic + journal d'erreurs
│   ├── format.ts           Montants, dates, statuts, messages d'erreur clairs
│   └── image.ts            Compression des captures avant téléversement
├── pages/                  Login, Register, ClientHome, Recharge, Transactions,
│                           ClientMessages, Profile, Diagnostics, NotFound
└── pages/admin/            AdminDashboard, AdminTransactions, AdminMessages, AdminClients
scripts/
├── check-dist.mjs          Contrôle du build (19 vérifications, lancé après `npm run build`)
├── package-netlify.mjs     Archive ZIP prête pour Netlify Drop
└── generate-icons.mjs      Génération des icônes PNG de la PWA
supabase/schema.sql         Schéma complet à exécuter dans Supabase
```

---

## 7. Dépannage

| Symptôme | Cause probable | Correction |
| --- | --- | --- |
| « Les tables PayKal sont introuvables » | `supabase/schema.sql` non exécuté | SQL Editor → Run |
| « Clé publique invalide » | clé révoquée dans Supabase | *Settings → API keys* → régénérer et mettre à jour la variable ou le repli |
| « Le bucket Storage receipts est absent » | section Storage du script non exécutée | relancer `supabase/schema.sql` |
| « E-mail non confirmé » | *Confirm email* activé | confirmer l'e-mail, ou désactiver l'option |
| Page blanche sur une route profonde (Netlify) | `_redirects` absent | vérifier `dist/_redirects` (`npm run build` le garantit) |
| Ancienne version affichée après déploiement | cache du Service Worker | `/diagnostic` → **Vider le cache PWA**, ou recharger deux fois |
| Erreur « Failed to fetch » malgré tout | réseau/FAI bloquant `*.supabase.co` | l'application bascule automatiquement en mode démo ; sinon changer de réseau |

---

**PayKal v1.0.0** — numéro de transfert officiel : **074452674**

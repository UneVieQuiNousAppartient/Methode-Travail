# Brique « Admin » — coquille, appels API, confirmations, fiches, tableaux, double authentification

Kit CRM (methode-travail) — origine : KHI Educ (CRM d'un service de tutorat), oct. 2026. Code nettoyé de tout ce
qui était propre au client : marque, textes, onglets métier ; couleurs renommées en jetons `brand-*`.

## À quoi ça sert

Monter l'écran d'administration d'un CRM (Next.js App Router, JavaScript, Tailwind) avec ce qui a coûté cher à
mettre au point la première fois :

- **coquille** : barre latérale à navigation configurable + barre du haut alignées, tiroir mobile ;
- **`apiFetch`** : jeton Supabase, refus 403 en un seul toast, bascule vers l'écran du code de double authentification ;
- **cartes de confirmation** (jamais `window.confirm`) et **menu « ⋯ »** des lignes ;
- **fiche en page** portée par l'adresse (`?client=<id>`), retour navigateur compris ;
- **tableaux** (en-tête triable, pagination numérotée), **cartes de chiffres clés** et **graphiques** accessibles ;
- **double authentification** côté écran : code, inscription, « Se souvenir de cet appareil 30 jours », appareils
  de confiance, paramètres de sécurité du compte, et la même garde pour un espace client ;
- un **squelette** d'écran admin qui assemble le tout, et les **règles d'écran** (`PATTERNS.md`).

Lire `PATTERNS.md` avant d'écrire le premier onglet métier.

## Fichiers (chemins dans le projet)

| Fichier | Rôle |
|---|---|
| `app/admin/AdminClient.exemple.jsx` | Squelette : rôle (`/v1/auth/role`), droits (`/v1/admin/me`), rachat de l'appareil de confiance, garde MFA, `loadData` unique, `refreshAfterChange`, fiche en page, toasts, `ConfirmProvider`. À renommer `AdminClient.jsx` |
| `components/admin/AdminSidebar.jsx` | Barre latérale ; prop `sections` (navigation), `brandName`, `logo`, `permissions` |
| `components/admin/adminNav.js` | **Exemple** de navigation (`getNavSections`), titres (`navTitles`), filtre par permission (`visibleItems`) |
| `components/admin/AdminHeader.jsx` | Barre du haut ; emplacement libre `actions` (cloche, langue…) |
| `components/admin/AdminAuthLayout.jsx` | Gabarit des écrans d'accès (connexion, code) ; variantes `team` / `space`, prop `panel` |
| `components/admin/common/ConfirmDialog.jsx` | `ConfirmProvider`, `useConfirm`, `confirmAction` (`tone: "danger"`, `typeToConfirm`), `Busy` |
| `components/admin/common/ActionMenu.jsx` | Menu « ⋯ » des lignes |
| `components/admin/common/useDetailRoute.js` | Fiche en page : `open / close / dismiss`, `isDetailOpenInUrl` |
| `components/admin/common/formatDate.js` | Date et heure lisibles, sans casser sur une valeur invalide |
| `components/admin/ui/table.jsx` | `Table…`, `SortableHead`, `TablePagination`, `pageWindow` |
| `components/admin/ui/charts.jsx` | `ChartCard`, `AreaTrend`, `BarCompare`, `DonutBreakdown`, `HorizontalBars`, `Sparkline`, `KpiCard` |
| `components/admin/ui/card.jsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` |
| `components/admin/mfa/MfaShared.jsx` | Pièces communes, `rememberThisDevice`, `redeemTrustedDevice`, `MfaShell` |
| `components/admin/mfa/MfaChallenge.jsx` | Écran « Code de vérification » (plusieurs appareils essayés à la suite) |
| `components/admin/mfa/MfaEnroll.jsx` | Inscription (obligatoire pleine page, ou dans Paramètres) |
| `components/admin/mfa/MfaSettingsSection.jsx` | Paramètres › Sécurité du compte : appareils, ajout, retrait |
| `components/admin/mfa/TrustedDevicesSection.jsx` | Appareils de confiance (30 jours) : liste, oublier un / tous |
| `components/mfa/SpaceMfaGate.jsx` | Même garde pour un espace client (`readSpaceMfaGate`, `SpaceMfaGate`) |
| `components/ui/dropdown-menu.jsx` | Menu déroulant shadcn/ui (base de `ActionMenu`) — garder celui du projet s'il existe |
| `lib/adminClient/apiFetch.js` | `createApiFetch` (fabrique), `useApiFetch` (crochet), `MFA_GATE_CODES`, `errorDetail` |
| `lib/adminClient/brand.js` | Valeurs par défaut de la marque (`name`, `logo`, `mfaIssuer`, `contactHref`, `siteHref`) |
| `lib/supabaseClient.js` | Client Supabase navigateur (`getSupabaseBrowser`) — garder celui du projet s'il existe |
| `lib/utils.js` | `cn()` (clsx + tailwind-merge) — si le projet a déjà celui de shadcn, n'y ajouter que le bloc `text-button` |

## Dépendances npm

Versions en production sur le projet d'origine (oct. 2026) :

```bash
npm i sonner@2.0.8 lucide-react@0.577.0 recharts@3.10.1 \
      @radix-ui/react-alert-dialog@1.2.1 @radix-ui/react-dropdown-menu@2.2.1 \
      clsx@2.1.1 tailwind-merge@3.7.0 @supabase/ssr@0.12.7 @supabase/supabase-js@2.118.0
npm i -D tailwindcss@^3.4.17 tailwindcss-animate@1.0.7
```

Pile : `next@16.4.2`, `react@19.3.1`. `<Toaster />` de `sonner` doit être monté une fois (ex. `app/layout.jsx`).
`tailwindcss-animate` fournit `animate-in`, `fade-in-0`, `zoom-in-95` (fenêtres et menus).

## Dépendances aux autres briques

- **`kits/crm/auth/`** (obligatoire) — routes appelées par cette brique :
  `GET /v1/auth/role` (membre de l'équipe ?), `GET /v1/admin/me` (`{ email, name, role, role_label, permissions,
  mfa: { enrolled, aal, required, required_for_all, code, trusted_device } }`), `POST /v1/auth/mfa/trust`,
  `POST /v1/auth/mfa/trusted-session`, `GET|DELETE /v1/auth/mfa/devices`, et le refus `403 { code: "mfa_…" }` de
  `lib/mfa.js`. `permissions` est l'objet de booléens de `lib/roles.js` (`permissionsOf`). Installer `auth/` d'abord.
- **`kits/crm/tests/`** — harnais de simulation de l'admin réel (`tests/simulation/harness.mjs`) pour la
  vérification ci-dessous.
- Aucun import de code d'une autre brique : la dépendance passe par les routes HTTP.

## Jetons Tailwind requis

Toutes les couleurs de la brique sont des jetons `brand-*`. À coller dans `tailwind.config.js` (valeurs d'origine,
à remplacer par la palette de la marque en gardant les **mêmes rôles** : `night` = fond foncé et texte principal,
`darkgold` = accent qui porte du texte blanc, `gold` = accent d'icône seulement) :

```js
// tailwind.config.js
module.exports = {
    theme: {
        extend: {
            colors: {
                brand: {
                    gold: "#B8860B",       // icônes, traits d'accent — jamais de fond sous du texte blanc
                    darkgold: "#9A6F08",   // pastilles et boutons à texte blanc (4,5:1), texte sur champagne
                    champagne: "#F3E7C8",  // survols, fonds de pastilles
                    ivory: "#FAF7F0",      // fond de page de l'admin
                    warmwhite: "#FFFDF8",  // barre latérale, cartes
                    night: "#10243B",      // texte principal, onglet actif, volet des écrans d'accès
                    nightsoft: "#1B3654",  // survol du marine
                    anthracite: "#252525", // texte courant
                    warmgray: "#625E57",   // texte secondaire
                    beige: "#DECFAE",      // bordures
                },
            },
            boxShadow: {
                premium: "0 4px 24px rgba(0,0,0,0.08)",
                subtle: "0 2px 12px rgba(0,0,0,0.05)",
            },
            fontSize: {
                button: ["15px", { lineHeight: "1", fontWeight: "600" }],
            },
            fontFamily: {
                serif: ["var(--font-serif)", "Georgia", "serif"], // titres ; var(--font-serif) posée par next/font
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
};
```

`components/admin/ui/charts.jsx` recopie ces couleurs **en hexadécimal** (`SLOTS`, `GRID`, `AXIS`) : Recharts
dessine en SVG et ne lit pas les classes. Les changer aussi.

Classes shadcn/ui utilisées (variables CSS de `globals.css` de shadcn, déjà là si le projet l'a installé) :
`destructive` (boutons « danger »), `popover`, `popover-foreground`, `accent`, `accent-foreground` (menu
déroulant). Sans shadcn : ajouter `destructive: "hsl(var(--destructive))"` etc. dans `colors`, et les variables
`--destructive`, `--popover`, `--accent`… dans `:root` (sur le projet d'origine, `--destructive: 42 90% 32%`).

Classes globales utilisées (à coller dans `app/globals.css`) :

```css
@layer components {
    .btn-primary {
        @apply inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-brand-night bg-brand-night px-5 text-button text-white transition-[background-color,border-color,color] duration-150 ease-out hover:bg-brand-nightsoft hover:border-brand-nightsoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50;
    }
    .btn-secondary {
        @apply inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-brand-beige bg-white px-5 text-button text-brand-night transition-[background-color,border-color,color] duration-150 ease-out hover:border-brand-gold/60 hover:bg-brand-champagne/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50;
    }
    .input-field {
        @apply w-full rounded-[8px] border border-brand-beige bg-white px-4 py-3 text-sm text-brand-anthracite outline-none transition-colors duration-200 placeholder:text-brand-warmgray/60 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20;
    }
}
```

Utilitaires de thème utilisés : `shadow-subtle`, `shadow-premium`, `text-button`, `font-serif` (définis ci-dessus).

## Langues (i18n)

Chaque composant reçoit `t` en prop : `t("Texte avec {clé}", { clé: valeur })` → chaîne. Les textes sources sont
en français ; l'i18n du projet les traduit.

- **Sans i18n** : `const t = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s);`
  défini **hors** de tout composant (c'est le `plainT` par défaut du squelette).
- **Avec i18n** : `t` et `setLang` doivent être **stables** (`useCallback` / `useMemo` dans le fournisseur), sinon
  l'admin charge tout deux fois au démarrage (`PATTERNS.md` [8]).
- `locale` (ex. `"fr-CA"`, `"en-CA"`) sert aux dates (`formatDate`) et au nom des appareils inscrits.

## Étapes d'adaptation

1. Installer `kits/crm/auth/` (migrations, `lib/`, routes) et vérifier que `GET /v1/admin/me` répond.
2. Copier les fichiers de cette brique aux mêmes chemins ; garder `lib/utils.js`, `lib/supabaseClient.js` et
   `components/ui/dropdown-menu.jsx` du projet s'ils existent déjà.
3. Jetons `brand-*`, ombres, `text-button`, classes `.btn-*` / `.input-field`, plugin `tailwindcss-animate`
   (section ci-dessus) ; couleurs hexadécimales de `charts.jsx`.
4. `lib/adminClient/brand.js` : nom de l'entreprise, logo, nom dans l'application d'authentification, page de
   contact. Contrôler le contraste de la nouvelle palette (texte blanc ≥ 4,5:1 sur `darkgold` et `night`).
5. `components/admin/adminNav.js` : remplacer l'exemple par les onglets du projet (clé, libellé, icône, pastille,
   permission — clés de `permissionsOf` de `lib/roles.js`).
6. `app/admin/AdminClient.exemple.jsx` → `AdminClient.jsx` ; `app/admin/page.jsx` le monte. Remplacer les routes
   d'exemple (`/v1/admin/clients`, `/v1/admin/actions`) ; ajouter le formulaire de connexion (point d'extension) ;
   ajouter les onglets métier, chacun avec un toast de réussite et d'erreur et un appel à `refreshAfterChange`.
7. Monter `<Toaster />` (sonner) une fois dans le gabarit racine.
8. Espace client à double authentification obligatoire : `readSpaceMfaGate(supabase, user)` AVANT toute lecture,
   puis `<SpaceMfaGate gate={…} audience="client" … />` à la place de l'espace tant que la garde n'est pas `null`.

## Points d'extension (non fournis)

- Formulaire de connexion (mot de passe, Google, anti-robots, mot de passe oublié) : le squelette n'affiche qu'un
  titre ; voir la brique `auth/`.
- Cloche de notifications, sélecteur de langue : prop `actions` d'`AdminHeader`.
- Assistant IA : props `onOpenAssistant` (barre latérale et barre du haut) ; le panneau lui-même n'est pas fourni.
- Le retrait d'un appareil d'authentification (`MfaSettingsSection`) garde sa propre fenêtre accessible (piège du
  focus, Échap) plutôt que `ConfirmDialog` : elle affiche un avertissement différent pour le dernier appareil.

## Comment vérifier

1. **Syntaxe et imports** (sans projet) : copier la brique dans un dossier temporaire, installer `@babel/parser`,
   analyser chaque `.js/.jsx` et vérifier que chaque import `@/…` pointe vers un fichier de la brique (méthode
   suivie à la création du kit : 23 fichiers, 0 problème). Jamais de `node_modules` dans ce dépôt.
2. **Dans le projet** : `npm run lint && npm run build`.
3. **Admin réel** : harnais de simulation `kits/crm/tests/simulation/harness.mjs` (Playwright, voir la brique
   `tests/`) — connexion, écran du code, « se souvenir de cet appareil », chaque action de chaque onglet, en
   vérifiant pour chacune : un toast de réussite ou d'erreur, l'absence de `window.confirm` (aucun `dialog`
   natif), la liste ET le centre d'actions à jour sans recharger la page.
4. **À la main** : onglet Réseau au chargement — chaque route appelée une seule fois (`PATTERNS.md` [8]) ; les
   deux traits horizontaux de la coquille alignés ([9]) ; refuser un rôle → un seul toast ([3]) ; ouvrir une fiche,
   recharger, bouton « retour » ([7]).

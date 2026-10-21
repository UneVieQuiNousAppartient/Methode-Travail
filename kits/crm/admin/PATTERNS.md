# Règles d'écran de l'admin

Kit CRM (methode-travail) — origine : KHI Educ, oct. 2026. Règles qui ont fait leurs preuves sur un CRM réel
(simulations de l'admin, retours de la cliente, revues qa). Chacune a un **pourquoi** : sans lui, la règle saute
à la première échéance. Les numéros [1]…[11] sont repris en commentaire dans `app/admin/AdminClient.exemple.jsx`.

## [1] Confirmation maison pour toute action destructive — jamais `window.confirm`

**Pourquoi.** `window.confirm` bloque la page, ne se met pas aux couleurs, ne dit pas ce qui va disparaître,
s'accepte par réflexe avec Entrée, et les tests de bout en bout doivent l'intercepter à part. Une carte maison
nomme l'objet, met le bouton en rouge et, pour l'irréversible, fait **taper un mot**.

```jsx
// Une fois, en haut de l'écran
<ConfirmProvider t={t}>…</ConfirmProvider>

// Dans un gestionnaire (même hors d'un composant : confirmAction)
const ok = await confirmAction({
    title: t("Supprimer {name} ?", { name: c.name }),
    description: t("Le client et son historique seront effacés. Cette action est définitive."),
    confirmLabel: t("Supprimer définitivement"),
    tone: "danger",
    typeToConfirm: t("supprimer"),   // bouton grisé tant que le mot n'est pas tapé
});
if (!ok) return;
```

Sans `ConfirmProvider` monté, `confirmAction` retombe sur `window.confirm` : jamais d'action sans accord.
Les actions risquées d'un menu « ⋯ » (`ActionMenu`, `tone: "danger"`) passent par là, jamais directement.

## [2] Un message de réussite ET un message d'erreur pour chaque ajout, modification, suppression

**Pourquoi.** Une action sans retour visible est refaite (doublons) ou crue faite alors qu'elle a échoué. Les
simulations ont trouvé des boutons qui ne disaient rien en cas d'échec réseau, et d'autres qui ne disaient rien en
cas de réussite « partielle » (étape enregistrée, mais courriel non parti).

```jsx
const res = await apiFetch(`/v1/admin/clients/${id}`, { method: "DELETE" }).catch(() => null); // réseau coupé → null
if (!res?.ok) {
    if (res?.status !== 403) toast.error(await errorDetail(res, t("Le client n'a pas été supprimé.")));
    return;
}
toast.success(t("Client supprimé"));
// Réussite partielle : le dire, avec quoi faire
if (data.emailed === false) toast.warning(t("Enregistré, mais le courriel n'est pas parti. Réessayez."));
```

## [3] Un seul toast par refus 403 — identifiant = texte

**Pourquoi.** Au chargement, dix routes refusées au même rôle donnaient dix toasts identiques empilés. `apiFetch`
affiche le refus **une fois**, avec `{ id: msg }` : `sonner` remplace un toast de même identifiant au lieu d'en
ajouter un. L'appelant ne redit donc rien sur un 403.

```js
// lib/adminClient/apiFetch.js
const msg = typeof data.detail === "string" && data.detail ? data.detail : t("Accès réservé à un autre rôle.");
notify.error(msg, { id: msg });
// côté appelant
if (res?.status !== 403) toast.error(...);
```

Un 403 portant `code: "mfa_required" | "mfa_enrollment_required"` n'est pas un refus de rôle : pas de toast,
l'écran du code prend la place de l'admin (`onMfaGate`).

## [4] Mise à jour optimiste : restaurer l'état si le serveur refuse

**Pourquoi.** Changer l'écran tout de suite rend l'admin rapide, mais un échec laissé affiché fait croire à une
modification qui n'existe pas. Garder la valeur d'avant, et la remettre en cas d'échec — avec un message [2].

```jsx
setClients((l) => l.map((x) => (x.id === c.id ? { ...x, status } : x)));
const res = await apiFetch(path, { method: "PATCH", body: JSON.stringify({ status }) }).catch(() => null);
if (!res?.ok) {
    setClients((l) => l.map((x) => (x.id === c.id ? { ...x, status: c.status } : x))); // retour arrière
    if (res?.status !== 403) toast.error(t("La modification n'a pas été enregistrée."));
    return;
}
```

## [5] Sélection groupée vidée quand la liste affichée change

**Pourquoi.** Une sélection gardée après un changement de filtre, de page ou d'onglet agit sur des lignes que
l'utilisateur **ne voit plus** : « Archiver (3) » archivait des fiches d'un autre filtre.

```jsx
useEffect(() => setSelected(new Set()), [tab, filter, page, clients]);
```

## [6] Après toute modification, rafraîchir aussi les vues dérivées — en silence, une seule fois

**Pourquoi.** Une fiche supprimée restait affichée dans « Priorités du jour » et le centre d'actions, qui avaient
leur propre chargement. Et une relecture qui rallume « Chargement… » fait clignoter tout l'écran après chaque
clic. Une seule fonction, appelée par **chaque** action ; une **clé** relance les vues dérivées ; les relectures
sont **silencieuses** (`{ quiet: true }`) ; aucune vue ne recharge deux fois.

```jsx
const refreshAfterChange = useCallback(() => {
    loadData({ quiet: true });         // listes, sans écran de chargement
    setRefreshKey((k) => k + 1);       // centre d'actions, priorités… (useEffect sur refreshKey)
    if (briefLoadedRef.current) loadBrief(false, { quiet: true }); // une analyse déjà affichée seulement
}, [loadData, loadBrief]);

// Dans chaque vue dérivée : « Chargement… » au premier passage seulement
const loaded = useRef(false);
if (items === null && !loaded.current) return <Spinner />;
```

## [7] Fiche en page (adresse `?<param>=<id>`) plutôt que panneau latéral

**Pourquoi.** Un panneau n'a pas d'adresse : pas de lien à envoyer à un collègue, pas de favori, le bouton
« retour » du navigateur quitte l'admin, et un rechargement perd la fiche. `useDetailRoute` porte la fiche dans
l'adresse, garde la liste montée (masquée, filtres conservés), rend défilement et focus au retour.

```jsx
const route = useDetailRoute("client");
route.open(id);      // pushState ?client=<id>
route.close();       // remonte l'historique jusqu'à la liste (plusieurs fiches ouvertes à la suite comprises)
route.dismiss();     // ferme sans historique : changement d'onglet, lien de notification
<div hidden={Boolean(route.id)}>…liste…</div>
{route.id && <Fiche id={route.id} onBack={route.close} />}
```

## [8] Fonction de traduction `t` et `setLang` stables

**Pourquoi.** `apiFetch` dépend de `t` (message du 403) ; `loadData` dépend d'`apiFetch` ; l'effet de chargement
dépend de `loadData`. Un `t` recréé à chaque rendu — ou un `setLang` recréé qui change la valeur du contexte —
relance toute la chaîne : **l'admin chargeait toutes ses données deux fois au démarrage**.

```jsx
// Fournisseur i18n
const setLang = useCallback((l) => { /* … */ }, []);
const value = useMemo(() => ({ lang, setLang, t: (k, p) => translate(lang, k, p) }), [lang, setLang]);
// Sans i18n : défini hors du composant
const plainT = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s);
```

Contrôle : onglet Réseau des outils du navigateur au chargement de l'admin — chaque route n'apparaît qu'**une** fois
(en développement, StrictMode double les effets : vérifier sur `next build && next start`).

## [9] Barre latérale et barre du haut de même hauteur

**Pourquoi.** Deux traits horizontaux décalés d'un pixel se voient sur toutes les pages. La barre du haut fait
`h-16` plus sa bordure ; le bloc du logo de la barre latérale fait `box-content h-16` (la bordure s'ajoute à la
hauteur au lieu d'être prise dedans) : les deux traits tombent au même endroit.

```jsx
// AdminSidebar
<div className="box-content flex h-16 … border-b border-brand-beige/60">…logo…</div>
// AdminHeader
<header className="sticky top-0 border-b border-brand-beige/60"><div className="flex h-16 …">…</div></header>
```

## [10] Contraste : jamais de texte blanc sur l'or clair

**Pourquoi.** Blanc sur `#B8860B` ≈ 3,2:1 : sous le seuil WCAG AA (4,5:1) pour du texte courant, illisible au
soleil sur un téléphone. L'or clair sert aux **icônes et accents** ; une pastille ou un bouton à texte blanc prend
l'or **foncé** (`brand-darkgold`) ou le marine ; un texte sur fond champagne prend l'or foncé ou le marine.

```jsx
<span className="bg-brand-darkgold text-white">3</span>        {/* oui */}
<span className="bg-brand-champagne text-brand-darkgold">3</span> {/* oui */}
<span className="bg-brand-gold text-white">3</span>            {/* non */}
```

Textes d'au moins 12 px (`text-xs`) partout dans l'admin.

## [11] Pas de logique métier dans l'écran — le serveur reçoit les droits, l'écran les affiche

**Pourquoi.** Une règle codée dans l'écran (qui peut supprimer, quel statut suit quel autre, qui reçoit une
relance) diverge de celle du serveur, et se contourne avec un `curl`. Le serveur est **seul juge** : il refuse en
403. L'écran lit `permissions` de `GET /v1/admin/me` uniquement pour **masquer** ce qui serait refusé (confort),
et se contente d'afficher la réponse. Une règle qui compte vit dans `lib/` côté serveur, avec son test.

```jsx
// Masquer un bouton : oui (confort)
{ label: t("Supprimer"), tone: "danger", hidden: !me?.permissions?.lead_delete, onSelect: … }
// Décider à la place du serveur : non
if (me.role === "admin") await apiFetch(…)   // le serveur le refuserait de toute façon, ou pire, ne le refuserait pas
```

Même principe pour la double authentification : l'écran du code n'apparaît que si `/v1/admin/me` (ou un 403)
le demande ; l'écran ne calcule jamais seul qui doit fournir un code.

---
name: audit-seo
description: Audit SEO d'un site — technique, contenu, performance, accessibilité ; s'appuie sur marketing:seo-audit et sur Lighthouse déjà en CI. Rapport priorisé, sans rien modifier.
when_to_use: Avant une refonte ou une mise en ligne importante, quand le trafic organique baisse, ou à la demande de Camille pour VieSolution ou un client
user-invocable: true
argument-hint: "[url-ou-route] [rapide|complet]"
allowed-tools: Read, Grep, Glob, Bash, Agent, WebFetch
disallowed-tools: Edit, Write
model: opus
effort: medium
---

# Audit SEO

> **Modèle `methode-travail`** : les chemins, pages et numéros d'issues cités ci-dessous viennent de VieSolution, à titre d'exemple. Les remplacer par ceux du projet à l'installation.

Rapport priorisé ; **ne modifie rien**. Les corrections deviennent ensuite un
petit chantier (`nouveau-projet petit`) ou des issues GitHub.

Lire `docs/ETAT-ACTUEL.md`. **Jamais `SUIVI-TACHES.md` en entier** (pour
l'historique SEO : `grep -n "SEO" SUIVI-TACHES.md docs/suivi/*.md`).

Si la skill `marketing:seo-audit` est disponible (plugin `marketing` gardé
pour ce projet), s'en servir pour la grille et le format, et compléter avec
les contrôles ci-dessous propres au dépôt.

## 1. Technique
```bash
# métadonnées : chaque page publique passe-t-elle par buildPageMetadata ?
grep -rL "buildPageMetadata\|generateMetadata" src/app/*/page.tsx src/app/*/*/page.tsx
cat src/app/sitemap.ts src/app/robots.ts
```
- Titre et description uniques par page, `canonical`, `hreflang` FR/EN/ES.
- Sitemap complet (croiser avec les routes de `src/app/`), `robots` cohérent.
- Codes HTTP : 200 sur les pages, 301 propres, aucun lien interne en 404
  (`curl -s -o /dev/null -w "%{http_code}"` sur un serveur de dev).
- Données structurées (JSON-LD : Organization, FAQ, Article) valides.

## 2. Contenu
- Un H1 par page, hiérarchie Hn logique, intention de recherche claire.
- Maillage interne : chaque page atteignable en cliquant (voir `nouvelle-page`).
- Contenu dupliqué entre langues ou entre pages proches.
- Conformité AMF du contenu (éducatif, aucun produit ni assureur promu).

## 3. Performance
- Lighthouse tourne déjà en CI (`.github/workflows/lighthouse.yml`, informatif,
  budget `lighthouse-budget.json`) : lire le dernier rapport de `main`
  ou `staging` (il ne tourne plus sur les PR depuis le 15 oct.) ; sinon le
  lancer à la main depuis l'onglet Actions (minutes comptées).
- En local au besoin : `npm run build && npm run start`, puis Lighthouse sur
  3 pages max. Core Web Vitals (LCP, CLS, INP), poids des images
  (règle de performance du projet, s'il en a une).

## 4. Accessibilité
- Score Lighthouse a11y, labels associés (issue #97), contraste AA, focus
  visible, textes alternatifs.

## Agents et modèles
Contrôles mécaniques sur beaucoup de pages (liens, balises, sitemap) :
un agent `model: "haiku"`. Analyse de contenu (rédactionnelle) : `model: "sonnet"`. Au plus 2
en parallèle ; rapide = l'agent principal seul.

## Rapport
Tableau : constat · preuve · impact (élevé/moyen/faible) · effort · correctif
proposé. Trois priorités en tête. Terminer par le **coût réel**.

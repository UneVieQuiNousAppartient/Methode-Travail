---
name: audit-seo
description: Audit SEO d'un site — technique, contenu, performance, accessibilité ; s'appuie sur marketing:seo-audit et sur Lighthouse déjà en CI. Rapport priorisé, sans rien modifier.
when_to_use: Avant une refonte ou une mise en ligne importante, quand le trafic organique baisse, ou à la demande de Camille pour un site
user-invocable: true
argument-hint: "[url-ou-route] [rapide|complet]"
allowed-tools: Read, Grep, Glob, Bash, Agent, WebFetch
disallowed-tools: Edit, Write
model: opus
effort: medium
---

# Audit SEO

> Chemins et commandes : **Fiche projet** de `CLAUDE.md` (Routes publiques, Sitemap et navigation, Langues,
> Serveur local). Les éléments marqués *Exemple* viennent de VieSolution (Next.js).

Rapport priorisé ; **ne modifie rien**. Les corrections deviennent ensuite un
petit chantier (`nouveau-projet petit`) ou des issues GitHub.

Lire `docs/ETAT-ACTUEL.md`. **Jamais `SUIVI-TACHES.md` en entier** (pour
l'historique SEO : `grep -n "SEO" SUIVI-TACHES.md docs/suivi/*.md`).

Si la skill `marketing:seo-audit` est disponible (plugin `marketing` gardé
pour ce projet), s'en servir pour la grille et le format, et compléter avec
les contrôles ci-dessous propres au dépôt.

## 1. Technique
- Chaque page publique (dossier **Routes publiques**) a ses métadonnées :
  titre et description uniques, `canonical`, `hreflang` pour chaque langue de
  la ligne **Langues**. *Exemple (VieSolution, Next.js)* :
  ```bash
  grep -rL "buildPageMetadata\|generateMetadata" src/app/*/page.tsx src/app/*/*/page.tsx
  cat src/app/sitemap.ts src/app/robots.ts
  ```
- Sitemap complet (croiser avec les routes publiques), `robots` cohérent
  (pages privées exclues).
- Codes HTTP : 200 sur les pages, 301 propres, aucun lien interne en 404
  (`curl -s -o /dev/null -w "%{http_code}"` sur le serveur local).
- Données structurées (JSON-LD : Organization, FAQ, Article) valides, sans
  donnée que le client n'a pas fournie (note, prix, horaires).

## 2. Contenu
- Un H1 par page, hiérarchie Hn logique, intention de recherche claire.
- Maillage interne : chaque page atteignable en cliquant (voir `nouvelle-page`).
- Contenu dupliqué entre langues ou entre pages proches.
- Conformité du contenu au cadre du secteur, s'il y en a un (*exemple
  VieSolution* : AMF — éducatif, aucun produit ni assureur promu).

## 3. Performance
- Si Lighthouse tourne en CI (*exemple VieSolution* :
  `.github/workflows/lighthouse.yml`, budget `lighthouse-budget.json`) : lire
  le dernier rapport de la branche de production ; sinon le lancer à la main
  (minutes de CI comptées).
- En local au besoin : build de production puis Lighthouse sur 3 pages max.
  Core Web Vitals (LCP, CLS, INP), poids des images (règle de performance du
  projet, s'il en a une).

## 4. Accessibilité
- Score Lighthouse a11y, labels associés à leurs champs, contraste AA, focus
  visible, textes alternatifs.

## Agents et modèles
Contrôles mécaniques sur beaucoup de pages (liens, balises, sitemap) :
un agent `model: "haiku"`. Analyse de contenu (rédactionnelle) : `model: "sonnet"`. Au plus 2
en parallèle ; rapide = l'agent principal seul.

## Rapport
Tableau : constat · preuve · impact (élevé/moyen/faible) · effort · correctif
proposé. Trois priorités en tête. Terminer par le **coût réel**.

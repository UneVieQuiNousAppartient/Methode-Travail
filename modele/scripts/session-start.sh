#!/bin/bash
# Hook SessionStart (déclaré dans .claude/settings.json) — prépare une session
# Claude Code dans le cloud : dépendances, navigateur de test, état du projet.
# Hors cloud (poste local) : ne fait rien. Modèle « methode-travail » : adapter
# l'étape 1 à la pile du projet (npm, pip, …) ; l'étape 2 ne sert qu'avec Playwright.
# Idempotent : relançable à la main sans effet de bord.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"

# 1. Dépendances — npm ci seulement si node_modules manque ou si le
#    package-lock.json a changé depuis la dernière installation.
STAMP="node_modules/.package-lock.stamp"
if [ ! -f package-lock.json ]; then
  echo "[session-start] pas de package-lock.json : étape npm sautée" >&2
elif [ ! -d node_modules ] || [ ! -f "$STAMP" ] || ! cmp -s package-lock.json "$STAMP"; then
  echo "[session-start] npm ci…" >&2
  if npm ci --no-audit --no-fund --loglevel=error >&2; then
    cp package-lock.json "$STAMP"
  else
    echo "[session-start] npm ci a échoué : session ouverte sans dépendances à jour" >&2
  fi
else
  echo "[session-start] dépendances à jour" >&2
fi

# 2. Navigateur de test — Playwright attend une révision de Chromium que le
#    conteneur n'a pas forcément (/opt/pw-browsers). On crée un dossier de
#    liens symboliques portant les révisions attendues, sans rien télécharger.
SRC=/opt/pw-browsers
BROWSERS_JSON=node_modules/playwright-core/browsers.json
if [ -d "$SRC" ] && [ -f "$BROWSERS_JSON" ]; then
  DEST="$HOME/.cache/pw-browsers-projet"
  mkdir -p "$DEST"
  have_chromium=$(ls -d "$SRC"/chromium-[0-9]* 2>/dev/null | sort -V | tail -1 || true)
  have_shell=$(ls -d "$SRC"/chromium_headless_shell-[0-9]* 2>/dev/null | sort -V | tail -1 || true)
  # Les versions récentes rangent le binaire ailleurs (chrome-linux64/chrome,
  # chrome-headless-shell-linux64/chrome-headless-shell) que /opt
  # (chrome-linux/chrome, chrome-linux/headless_shell) : on recrée les deux
  # arborescences avec des liens fichier par fichier.
  link_tree() { # $1 = dossier source, $2 = dossier à créer
    mkdir -p "$2"
    [ -d "$1" ] || { echo "[session-start] absent : $1 (navigateur non câblé)" >&2; return 0; }
    for f in "$1"/*; do ln -sfn "$f" "$2/$(basename "$f")"; done
  }
  for name in chromium chromium-headless-shell; do
    rev=$(node -e "const b=require('./$BROWSERS_JSON').browsers.find(x=>x.name==='$name');process.stdout.write(b?b.revision:'')")
    [ -z "$rev" ] && continue
    if [ "$name" = chromium ]; then
      [ -z "$have_chromium" ] && continue
      d="$DEST/chromium-$rev"; rm -rf "$d"; mkdir -p "$d"
      link_tree "$have_chromium/chrome-linux" "$d/chrome-linux"
      link_tree "$have_chromium/chrome-linux" "$d/chrome-linux64"
    else
      [ -z "$have_shell" ] && continue
      d="$DEST/chromium_headless_shell-$rev"; rm -rf "$d"; mkdir -p "$d"
      link_tree "$have_shell/chrome-linux" "$d/chrome-linux"
      link_tree "$have_shell/chrome-linux" "$d/chrome-headless-shell-linux64"
      ln -sfn "$have_shell/chrome-linux/headless_shell" "$d/chrome-headless-shell-linux64/chrome-headless-shell"
    fi
    touch "$d/INSTALLATION_COMPLETE" "$d/DEPENDENCIES_VALIDATED"
  done
  # ffmpeg et autres dossiers présents tels quels
  for extra in "$SRC"/ffmpeg-*; do [ -e "$extra" ] && ln -sfn "$extra" "$DEST/$(basename "$extra")"; done
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    grep -qs "PLAYWRIGHT_BROWSERS_PATH=$DEST" "$CLAUDE_ENV_FILE" || \
      echo "export PLAYWRIGHT_BROWSERS_PATH=$DEST" >> "$CLAUDE_ENV_FILE"
  fi
  echo "[session-start] navigateur de test : PLAYWRIGHT_BROWSERS_PATH=$DEST" >&2
fi

# 3. État du projet — affiché en contexte de la session (stdout).
echo "## Démarrage de session"
echo "Branche : $(git branch --show-current 2>/dev/null || echo '?')"
changes=$(git status --short 2>/dev/null | head -20 || true)
echo "Fichiers modifiés : ${changes:-aucun}"
if [ -f docs/ETAT-ACTUEL.md ]; then
  echo
  cat docs/ETAT-ACTUEL.md
fi

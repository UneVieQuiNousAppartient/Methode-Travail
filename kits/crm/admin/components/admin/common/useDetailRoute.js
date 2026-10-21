// Kit CRM (methode-travail) — origine : KHI Educ, components/admin/common/useDetailRoute.js, oct. 2026. À adapter : voir BRIQUE.md.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Fiche en page avec sa propre adresse (plutôt qu'un panneau latéral) : ex. fiche client (?client=<id>), fiche
// commande (?commande=<id>). Bouton « retour » du navigateur, favori, lien à envoyer, rechargement et nouvel
// onglet retrouvent la fiche ; « Retour à la liste » remonte toutes les fiches ouvertes à la suite ; position de
// défilement et focus de la liste rendus au retour. La liste elle-même reste montée par l'appelant (masquée).
//
//   const route = useDetailRoute("client");
//   route.open(id, { draftId, openComposer }) · route.close() · route.id · route.draftId · route.openComposer
const paramInUrl = (param) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(param));
// Une fiche de ce type est-elle ouverte dans l'adresse courante ? (fonction stable, utilisable hors du crochet)
export const isDetailOpenInUrl = (param) => Boolean(paramInUrl(param));

const CLOSED = { id: null, draftId: null, openComposer: false };

export function useDetailRoute(param) {
    const [state, setState] = useState(CLOSED);
    const openId = useRef(null);
    const listScroll = useRef(0);
    // Élément cliqué dans la liste : le focus clavier y revient au retour (accessibilité).
    const listFocus = useRef(null);

    const set = useCallback((next) => {
        openId.current = next.id;
        setState(next);
    }, []);

    const clear = useCallback(() => {
        set(CLOSED);
        requestAnimationFrame(() => {
            window.scrollTo(0, listScroll.current);
            const el = listFocus.current;
            if (el && el.isConnected) el.focus({ preventScroll: true });
        });
    }, [set]);

    const open = useCallback(
        (id, { draftId = null, openComposer = false } = {}) => {
            if (!id) return;
            if (!paramInUrl(param)) {
                listScroll.current = window.scrollY;
                listFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            }
            set({ id: String(id), draftId, openComposer });
            const url = new URL(window.location.href);
            if (url.searchParams.get(param) !== String(id)) {
                url.searchParams.set(param, id);
                url.searchParams.delete("draft");
                // `depth` : nombre de fiches de ce type ouvertes à la suite depuis la liste (fiche A, puis B…).
                const prev = window.history.state;
                const depth = (prev?.kitDetail === param ? prev.depth || 1 : 0) + 1;
                window.history.pushState({ kitDetail: param, depth }, "", url);
            }
            window.scrollTo(0, 0);
        },
        [param, set],
    );

    const close = useCallback(() => {
        // Ouverte depuis la liste : on remonte d'autant de fiches qu'on en a ouvert à la suite, jusqu'à la liste
        // (le « popstate » referme la fiche).
        const st = window.history.state;
        if (st?.kitDetail === param) {
            window.history.go(-(st.depth || 1));
            return;
        }
        // Ouverte directement par son adresse : on retire le paramètre sans quitter l'admin.
        const url = new URL(window.location.href);
        url.searchParams.delete(param);
        url.searchParams.delete("draft");
        window.history.replaceState(null, "", url);
        clear();
    }, [param, clear]);

    // Fermer sans passer par l'historique (changement d'onglet, lien de notification) : on retire le paramètre de
    // l'adresse courante. Deux fiches de types différents se ferment ainsi sans se gêner.
    const dismiss = useCallback(() => {
        if (!paramInUrl(param) && !openId.current) return;
        const url = new URL(window.location.href);
        url.searchParams.delete(param);
        url.searchParams.delete("draft");
        window.history.replaceState(null, "", url);
        clear();
    }, [param, clear]);

    useEffect(() => {
        // Arrivée par l'adresse (lien de notification, favori, rechargement, nouvel onglet).
        const params = new URLSearchParams(window.location.search);
        if (params.get(param)) set({ id: params.get(param), draftId: params.get("draft"), openComposer: false });
        const onPop = () => {
            const id = paramInUrl(param);
            if (id) {
                set({ id, draftId: null, openComposer: false });
                window.scrollTo(0, 0);
            } else if (openId.current) {
                // Seule la fiche ouverte se referme (et rend le défilement) : l'autre type de fiche n'y touche pas.
                clear();
            }
        };
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, [param, set, clear]);

    return { ...state, open, close, dismiss };
}

// Kit CRM (methode-travail) — origine : KHI Educ, app/[lang]/admin/AdminClient.jsx (assemblage, sans les onglets métier), oct. 2026. À adapter : voir BRIQUE.md.
"use client";

// SQUELETTE d'écran admin : montre comment les pièces du kit s'assemblent. Les routes /v1/admin/clients et
// /v1/admin/actions sont des EXEMPLES (à remplacer par celles du projet) ; /v1/auth/role, /v1/admin/me et
// /v1/auth/mfa/* viennent de kits/crm/auth/. Renommer en AdminClient.jsx et monter dans app/admin/page.jsx :
//   export default function Page() { return <AdminClient />; }
// Règles d'écran appliquées ici : voir PATTERNS.md (numéros entre crochets).

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { useApiFetch, errorDetail, MFA_GATE_CODES } from "@/lib/adminClient/apiFetch";
import { ConfirmProvider, confirmAction } from "@/components/admin/common/ConfirmDialog";
import { ActionMenu } from "@/components/admin/common/ActionMenu";
import { useDetailRoute } from "@/components/admin/common/useDetailRoute";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminAuthLayout } from "@/components/admin/AdminAuthLayout";
import { getNavSections, navTitles } from "@/components/admin/adminNav";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/admin/ui/table";
import { MfaChallenge } from "@/components/admin/mfa/MfaChallenge";
import { MfaEnroll } from "@/components/admin/mfa/MfaEnroll";
import { MfaSettingsSection } from "@/components/admin/mfa/MfaSettingsSection";
import { redeemTrustedDevice } from "@/components/admin/mfa/MfaShared";

// Sans i18n : t(s, { clé }) remplace {clé}. Défini HORS du composant, donc stable [8]. Avec une i18n, passer son
// `t` en prop — à condition qu'il soit stable lui aussi (useMemo / useCallback dans le fournisseur).
const plainT = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s);

export const AdminClient = ({ t = plainT, locale = "fr-CA" }) => {
    const [user, setUser] = useState(null);
    const [checking, setChecking] = useState(true);
    const [authError, setAuthError] = useState(false);
    // GET /v1/admin/me : { email, name, role, role_label, permissions, mfa }. L'écran n'en tire que de l'affichage ;
    // le serveur décide [11].
    const [me, setMe] = useState(null);
    // null | "mfa_required" | "mfa_enrollment_required" : tant qu'il est posé, l'écran du code remplace l'admin et
    // aucune donnée n'est chargée (le serveur refuserait tout en 403).
    const [mfaGate, setMfaGate] = useState(null);
    // Code demandé volontairement (Paramètres › Sécurité, session de confiance) : annulable.
    const [codeRequested, setCodeRequested] = useState(false);
    const [tab, setTab] = useState("today");
    const [menuOpen, setMenuOpen] = useState(false);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(() => new Set());
    // Clé de rafraîchissement des vues dérivées (centre d'actions, priorités) [6].
    const [refreshKey, setRefreshKey] = useState(0);
    const clientRoute = useDetailRoute("client"); // fiche en page : ?client=<id> [7]

    // setMfaGate est stable : apiFetch ne change que si `t` change [8].
    const apiFetch = useApiFetch({ t, onMfaGate: setMfaGate });

    // Membre de l'équipe ? Puis droits et état de la double authentification, AVANT d'afficher quoi que ce soit.
    const verifyAdmin = useCallback(
        async (authUser) => {
            const data = await (await apiFetch("/v1/auth/role")).json().catch(() => ({}));
            if (data.role !== "admin") {
                setAuthError(true);
                await getSupabaseBrowser().auth.signOut();
                return;
            }
            try {
                let meRes = await apiFetch("/v1/admin/me");
                // Appareil de confiance : code demandé mais témoin « 30 jours » présent → la session devient session
                // de confiance, /me est relu et l'écran du code n'apparaît pas.
                const first = meRes.ok ? await meRes.clone().json().catch(() => null) : null;
                if (first?.mfa?.code === "mfa_required" && (await redeemTrustedDevice())) meRes = await apiFetch("/v1/admin/me");
                if (meRes.ok) {
                    const meData = await meRes.json();
                    setMe(meData);
                    // Posé dans le même rendu que setUser : le chargement des données attend l'écran du code.
                    setMfaGate(MFA_GATE_CODES.includes(meData?.mfa?.code) ? meData.mfa.code : null);
                }
            } catch {
                // /me injoignable : l'interface reste complète, le serveur refuse en 403 au besoin.
            }
            setAuthError(false);
            setUser({ email: authUser.email });
        },
        [apiFetch],
    );

    // Après un code, une inscription ou un appareil retiré : le serveur dit ce qu'il exige encore.
    const refreshMe = useCallback(async () => {
        const res = await apiFetch("/v1/admin/me").catch(() => null);
        if (res?.status === 401) return setUser(null);
        const meData = res?.ok ? await res.json() : null;
        if (meData) setMe(meData);
        setMfaGate(MFA_GATE_CODES.includes(meData?.mfa?.code) ? meData.mfa.code : null);
    }, [apiFetch]);

    useEffect(() => {
        (async () => {
            const { data } = await getSupabaseBrowser().auth.getUser();
            if (data?.user) await verifyAdmin(data.user);
            setChecking(false);
        })();
    }, [verifyAdmin]);

    // UN seul chargement au démarrage. { quiet: true } : relecture sans écran « Chargement… » [6].
    const loadData = useCallback(
        async ({ quiet = false } = {}) => {
            if (!quiet) setLoading(true);
            try {
                const res = await apiFetch("/v1/admin/clients");
                if (res.status === 401) return setUser(null);
                if (res.ok) setClients(await res.json());
            } finally {
                if (!quiet) setLoading(false);
            }
        },
        [apiFetch],
    );
    useEffect(() => {
        if (user && !mfaGate) loadData();
    }, [user, mfaGate, loadData]);

    // Après TOUT ajout, modification ou suppression : listes ET vues dérivées, en silence [6].
    const refreshAfterChange = useCallback(() => {
        loadData({ quiet: true });
        setRefreshKey((k) => k + 1);
    }, [loadData]);

    // Sélection groupée vidée quand la liste affichée change (onglet, filtre, relecture) [5].
    useEffect(() => setSelected(new Set()), [tab, clients]);

    const dismissClient = clientRoute.dismiss;
    const selectTab = useCallback(
        (k) => {
            dismissClient(); // changer d'onglet referme la fiche, sans passer par l'historique
            setTab(k);
        },
        [dismissClient],
    );

    // Modification optimiste : l'écran change tout de suite, et revient en arrière si le serveur refuse [4].
    const toggleFollowed = async (c) => {
        const status = c.status === "suivi" ? "nouveau" : "suivi";
        setClients((list) => list.map((x) => (x.id === c.id ? { ...x, status } : x)));
        const res = await apiFetch(`/v1/admin/clients/${c.id}`, { method: "PATCH", body: JSON.stringify({ status }) }).catch(() => null);
        if (!res?.ok) {
            setClients((list) => list.map((x) => (x.id === c.id ? { ...x, status: c.status } : x)));
            if (res?.status !== 403) toast.error(await errorDetail(res, t("La modification n'a pas été enregistrée."))); // 403 : déjà signalé [3]
            return;
        }
        toast.success(status === "suivi" ? t("Client marqué comme suivi") : t("Client remis en « nouveau »")); // [2]
        refreshAfterChange();
    };

    // Action destructive : carte de confirmation maison, mot à taper, jamais window.confirm [1].
    const deleteClient = async (c) => {
        const ok = await confirmAction({
            title: t("Supprimer {name} ?", { name: c.name }),
            description: t("Le client et son historique seront effacés. Cette action est définitive."),
            confirmLabel: t("Supprimer définitivement"),
            tone: "danger",
            typeToConfirm: t("supprimer"),
        });
        if (!ok) return;
        const res = await apiFetch(`/v1/admin/clients/${c.id}`, { method: "DELETE" }).catch(() => null);
        if (!res?.ok) {
            if (res?.status !== 403) toast.error(await errorDetail(res, t("Le client n'a pas été supprimé.")));
            return;
        }
        toast.success(t("Client supprimé"));
        if (clientRoute.id === String(c.id)) clientRoute.close();
        refreshAfterChange();
    };

    const logout = async () => {
        await getSupabaseBrowser().auth.signOut();
        setUser(null);
        setMe(null);
        setMfaGate(null);
    };

    if (checking) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-brand-ivory">
                <Loader2 className="h-6 w-6 animate-spin text-brand-darkgold" aria-label={t("Chargement…")} />
            </main>
        );
    }
    if (!user) {
        // Point d'extension : formulaire de connexion (mot de passe, Google, anti-robots) — voir kits/crm/auth/BRIQUE.md.
        return (
            <AdminAuthLayout t={t} testid="admin-login">
                <h1 className="font-serif text-2xl font-bold text-brand-night">{t("Connexion")}</h1>
                {authError && <p role="alert" className="mt-4 text-sm font-semibold text-brand-darkgold">{t("Ce compte n'a pas accès à l'administration.")}</p>}
            </AdminAuthLayout>
        );
    }
    if (mfaGate === "mfa_required") {
        return (
            <MfaChallenge
                t={t}
                userEmail={user.email}
                onVerified={async () => {
                    setCodeRequested(false);
                    await refreshMe();
                }}
                onLogout={logout}
                defaultRemember={!codeRequested}
                onCancel={codeRequested ? () => (setCodeRequested(false), setMfaGate(null)) : undefined}
            />
        );
    }
    if (mfaGate === "mfa_enrollment_required") {
        return <MfaEnroll mandatory t={t} locale={locale} userEmail={user.email} onEnrolled={refreshMe} onLogout={logout} />;
    }

    const sections = getNavSections(t, { clients: clients.filter((c) => c.status === "nouveau").length });
    const detail = clientRoute.id ? clients.find((c) => String(c.id) === clientRoute.id) : null;
    const sidebarProps = { sections, tab, t, userEmail: user.email, permissions: me?.permissions || null, roleLabel: me?.role_label || "" };

    return (
        <ConfirmProvider t={t}>
            <div data-testid="admin-dashboard" className="flex min-h-screen bg-brand-ivory">
                {menuOpen && (
                    <div id="admin-mobile-drawer" role="dialog" aria-modal="true" aria-label={t("Menu de navigation")} className="fixed inset-0 z-50 lg:hidden">
                        <div className="fixed inset-0 bg-brand-night/60" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                        <div className="relative z-10 h-full w-72 max-w-[85vw]">
                            <AdminSidebar {...sidebarProps} setTab={selectTab} isMobile onClose={() => setMenuOpen(false)} />
                        </div>
                    </div>
                )}
                <AdminSidebar {...sidebarProps} setTab={selectTab} />
                <div className="min-w-0 flex-1">
                    <AdminHeader
                        t={t}
                        title={detail ? t("Fiche client") : navTitles(sections)[tab]}
                        onLogout={logout}
                        onToggleMenu={() => setMenuOpen((v) => !v)}
                        isMobileMenuOpen={menuOpen}
                        userName={me?.name || ""}
                        roleLabel={me?.role_label || ""}
                    />
                    <main className="px-5 py-8 md:px-8">
                        {tab === "settings" ? (
                            <MfaSettingsSection
                                t={t}
                                locale={locale}
                                mfa={me?.mfa || null}
                                onChanged={refreshMe}
                                flashMessage={(m) => toast.success(m)}
                                onRequestCode={() => (setCodeRequested(true), setMfaGate("mfa_required"))}
                            />
                        ) : null}
                        {tab === "today" ? <ActionCenter apiFetch={apiFetch} refreshKey={refreshKey} t={t} /> : null}
                        {/* Fiche en page : la liste reste montée (masquée), filtres et défilement conservés au retour [7]. */}
                        {clientRoute.id ? (
                            <section data-testid="client-detail">
                                <button type="button" className="btn-secondary" onClick={clientRoute.close}>
                                    {t("Retour à la liste")}
                                </button>
                                <h2 className="mt-4 font-serif text-2xl font-bold text-brand-night">{detail?.name || t("Client introuvable")}</h2>
                            </section>
                        ) : null}
                        <div hidden={tab !== "clients" || Boolean(clientRoute.id)}>
                            {loading ? <p className="text-sm text-brand-warmgray">{t("Chargement…")}</p> : null}
                            <p className="mb-2 text-xs text-brand-warmgray">{t("{n} sélectionné(s)", { n: selected.size })}</p>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8" />
                                        <TableHead>{t("Nom")}</TableHead>
                                        <TableHead className="w-12" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {clients.map((c) => (
                                        <TableRow key={c.id} className="cursor-pointer" onClick={() => clientRoute.open(c.id)}>
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    aria-label={t("Sélectionner {name}", { name: c.name })}
                                                    checked={selected.has(c.id)}
                                                    onChange={() => setSelected((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                                                />
                                            </TableCell>
                                            <TableCell className="font-semibold text-brand-night">{c.name}</TableCell>
                                            <TableCell>
                                                <ActionMenu
                                                    label={t("Actions")}
                                                    testId={`client-actions-${c.id}`}
                                                    items={[
                                                        { label: c.status === "suivi" ? t("Remettre en « nouveau »") : t("Marquer comme suivi"), icon: Check, onSelect: () => toggleFollowed(c) },
                                                        { separator: true },
                                                        { label: t("Supprimer définitivement"), icon: Trash2, tone: "danger", onSelect: () => deleteClient(c) },
                                                    ]}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </main>
                </div>
            </div>
        </ConfirmProvider>
    );
};

// Vue dérivée (centre d'actions, priorités du jour) : relue à chaque changement de `refreshKey`. Premier chargement
// avec « Chargement… », relectures suivantes en silence : pas de clignotement après chaque action [6].
function ActionCenter({ apiFetch, refreshKey, t }) {
    const [items, setItems] = useState(null);
    const loaded = useRef(false);
    useEffect(() => {
        let cancelled = false;
        apiFetch("/v1/admin/actions")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (cancelled || !data) return;
                loaded.current = true;
                setItems(Array.isArray(data) ? data : []);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [apiFetch, refreshKey]);
    if (items === null && !loaded.current) return <p className="text-sm text-brand-warmgray">{t("Chargement…")}</p>;
    return (
        <ul data-testid="action-center" className="space-y-2">
            {(items || []).map((a) => (
                <li key={a.id} className="rounded-xl border border-brand-beige bg-white px-4 py-3 text-sm text-brand-night">
                    {a.label}
                </li>
            ))}
        </ul>
    );
}

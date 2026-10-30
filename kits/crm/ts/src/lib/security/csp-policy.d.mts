// Kit CRM TS (methode-travail) — origine : VieSolution-CSF, src/lib/security/csp-policy.d.mts, commit 508f19a (2026-10-30) ; généralisé : déclarations des fonctions ajoutées au kit.
export type CspMode = 'observation' | 'actif';
export declare const CSP_REPORT_PATH: string;
export declare function cspSource(ownPolicyPrefixes?: readonly string[]): string;
export declare function cspMode(): CspMode;
export declare function cspHeaderName(mode?: CspMode): string;
export declare function extraOrigins(): string[];
export declare function cspDirectives(): Record<string, string[]>;
export declare function buildContentSecurityPolicy(options?: { mode?: CspMode }): string;
export declare function cspHeader(options?: { mode?: CspMode }): { key: string; value: string };

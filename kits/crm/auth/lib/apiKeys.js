// Kit CRM (methode-travail) — origine : KHI Educ, lib/apiKeys.js, oct. 2026. À adapter : voir BRIQUE.md.
import { createHash, randomInt } from "node:crypto";

// Clés d'accès à l'API admin (agents, intégrations) : préfixe + 40 caractères alphanumériques.
// Seul le haché SHA-256 est stocké (api_keys.key_hash) ; la valeur n'est montrée
// qu'une fois, à la création. Utilisation : `Authorization: Bearer crm_…`.
// Le préfixe distingue une clé d'un jeton Supabase sans requête : à changer par projet.

export const API_KEY_PREFIX = "crm_";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const isApiKey = (token) => typeof token === "string" && token.startsWith(API_KEY_PREFIX);

export const hashApiKey = (key) => createHash("sha256").update(key).digest("hex");

export const generateApiKey = () => {
    let out = API_KEY_PREFIX;
    for (let i = 0; i < 40; i++) out += ALPHABET[randomInt(ALPHABET.length)];
    return out;
};

// Partie affichable d'une clé (pour la reconnaître dans la liste).
export const apiKeyPrefix = (key) => key.slice(0, 12);

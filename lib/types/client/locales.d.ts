/**
 * sapper board dictionaries.
 */
/** Dictionary namespace owned by this plugin. */
export declare const NS = "sapper";
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    title: string;
    'library.title': string;
    loading: string;
    'empty.title': string;
    'empty.body': string;
    counts: string;
    goal: string;
    'kind.host': string;
    'kind.service': string;
    'kind.cred': string;
    'kind.vuln': string;
    'kind.loot': string;
    'kind.flag': string;
    'kind.note': string;
    error: string;
};
/** English dictionary, checked against the Chinese key set. */
export declare const en: typeof zh;
export type SapperKey = keyof typeof zh;
//# sourceMappingURL=locales.d.ts.map
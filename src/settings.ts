import { PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import { PRO_UI } from './pro';
import type GlossaryTermAuditPlugin from './main';
export interface GlossaryTermAuditSettings {
    wholeTerm: boolean;
    ignoreCase: boolean;
    csv: string;
    source: string;
    target: string;
    profiles: {
        name: string;
        csv: string;
    }[];
}
export const DEFAULT_SETTINGS: GlossaryTermAuditSettings = { wholeTerm: true, ignoreCase: true, csv: 'source,approved,forbidden\npump,pompe,pompa', source: '', target: '', profiles: [] };
export function normalizeSettings(value: unknown): GlossaryTermAuditSettings {
    const s = value && typeof value === 'object' ? value as Partial<GlossaryTermAuditSettings> : {};
    return { wholeTerm: typeof s.wholeTerm === 'boolean' ? s.wholeTerm : true, ignoreCase: typeof s.ignoreCase === 'boolean' ? s.ignoreCase : true,
        csv: typeof s.csv === 'string' ? s.csv : DEFAULT_SETTINGS.csv, source: typeof s.source === 'string' ? s.source : '', target: typeof s.target === 'string' ? s.target : '',
        profiles: Array.isArray(s.profiles) ? s.profiles.filter(p => p && typeof p.name === 'string' && typeof p.csv === 'string').map(p => ({ name: p.name, csv: p.csv })) : [] };
}
export class GlossaryTermAuditSettingTab extends PluginSettingTab {
    constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], readonly auditPlugin: GlossaryTermAuditPlugin) { super(app, auditPlugin); }
    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            { name: 'Whole terms', desc: 'Require a letter, number or underscore boundary around a term.', control: { type: 'toggle', key: 'wholeTerm', defaultValue: true } },
            { name: 'Ignore case', desc: 'Compare lower case surface forms.', control: { type: 'toggle', key: 'ignoreCase', defaultValue: true } },
            ...(this.auditPlugin.pro ? sponsorsSettingItems(this.auditPlugin.pro, PRO_UI) : []),
        ];
    }
}

import { afterEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import GlossaryTermAuditPlugin from '../src/main';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings';
import { bindPro, resetPro } from '../src/pro';
import type { SponsorsManager } from '../src/license/index';
import manifest from '../manifest.json';
const csv = 'source,approved,forbidden\npump,pompe,pompa';
function plugin() { const app = App.createConfigured__({ files: { 'Job/Source.md': 'pump\n\npump', 'Job/Target.md': 'pompe\n\nmoteur' } }); return new GlossaryTermAuditPlugin(app as never, manifest as never); }
function pro() { bindPro({ isPro: () => true, onChange: () => () => undefined } as unknown as SponsorsManager); }
afterEach(resetPro);
describe('Plugin operations', () => {
    it('loads default settings', async () => { const p = plugin(); await p.loadSettings(); expect(p.settings).toEqual(DEFAULT_SETTINGS); });
    it('repairs saved settings', () => { expect(normalizeSettings({ wholeTerm: 5, ignoreCase: null, profiles: [null, { name: 3, csv: 'x' }] })).toEqual(DEFAULT_SETTINGS); });
    it('checks a real in-memory pair', async () => { expect((await plugin().checkPair('Job/Source.md', 'Job/Target.md', csv)).report.findings[0]).toMatchObject({ paragraph: 2, targetLine: 2 }); });
    it('rejects missing notes', async () => { await expect(plugin().checkPair('missing.md', 'Job/Target.md', csv)).rejects.toThrow('two Markdown'); });
    it('blocks folder checks without Pro', async () => { await expect(plugin().checkFolder('Job', 'source,target\nSource.md,Target.md', csv)).rejects.toThrow('need Pro'); });
    it('blocks saved and loaded profiles without Pro', async () => { const p = plugin(); await expect(p.saveProfile('Client', csv)).rejects.toThrow('need Pro'); expect(() => p.loadProfile('Client')).toThrow('need Pro'); });
    it('checks a declared folder pair with Pro', async () => { pro(); const result = await plugin().checkFolder('Job', 'source,target\nSource.md,Target.md', csv); expect(result).toHaveLength(1); expect(result[0]?.report.findings).toHaveLength(1); });
    it('saves and replaces separate profiles with Pro', async () => { pro(); const p = plugin(); await p.saveProfile('A', csv); await p.saveProfile('B', csv); await p.saveProfile('A', csv.replace('pompe', 'POMPE')); expect(p.settings.profiles).toHaveLength(2); expect(p.loadProfile('A')).toContain('POMPE'); });
    it('keeps profiles in saved plugin data', async () => { pro(); const p = plugin(); await p.saveProfile('A', csv); p.settings = normalizeSettings(null); await p.loadSettings(); expect(p.loadProfile('A')).toBe(csv); });
    it('rejects empty profiles and empty folder declarations', async () => { pro(); const p = plugin(); await expect(p.saveProfile('', csv)).rejects.toThrow('profile name'); await expect(p.checkFolder('Job', 'source,target', csv)).rejects.toThrow('at least one'); });
    it('stops a folder check at a missing note', async () => { pro(); await expect(plugin().checkFolder('Job', 'source,target\nSource.md,Target.md\nSource.md,Gone.md', csv)).rejects.toThrow('two Markdown'); });
    it('stops a folder check when Pro turns off between pairs', async () => { let n = 0; bindPro({ isPro: () => n++ < 2, onChange: () => () => undefined } as unknown as SponsorsManager); await expect(plugin().checkFolder('Job', 'source,target\nSource.md,Target.md\nSource.md,Target.md', csv)).rejects.toThrow('Pro is off'); });
});

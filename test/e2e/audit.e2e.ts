import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { pluginId, reloadPlugin } from './load';
interface AuditPlugin {
    openAudit(): void;
    settings: {
        source: string;
        target: string;
        csv: string;
        profiles: {
            name: string;
            csv: string;
        }[];
    };
    pro: {
        signOut(): void;
        opts: {
            http: unknown;
        };
        refreshNow(): Promise<void>;
    };
    modals: Set<{
        close(): void;
    }>;
    saveProfile(name: string, csv: string): Promise<void>;
    checkFolder(folder: string, pairs: string, csv: string): Promise<{
        report: {
            findings: unknown[];
        };
    }[]>;
}
const CSV = 'source,approved,forbidden\npump,pompe,pompa';
async function start(csv = CSV, source = 'Job/Source.md', target = 'Job/Target.md'): Promise<void> {
    await browser.executeObsidian(({ app }, id, csv, source, target) => {
        const p = (app as unknown as {
            plugins: {
                plugins: Record<string, AuditPlugin>;
            };
        }).plugins.plugins[id]!;
        for (const m of [...p.modals])
            m.close();
        p.settings.source = source;
        p.settings.target = target;
        p.settings.csv = csv;
        p.openAudit();
    }, pluginId, csv, source, target);
    await browser.$('.gta-check').waitForDisplayed();
}
async function run(): Promise<string> {
    await browser.$('.gta-check').click();
    await browser.waitUntil(async () => (await browser.$('.gta-check').isEnabled()) && (await browser.$('.gta-output').getText()).trim().length > 0, { timeout: 15000, timeoutMsg: 'Pair report did not finish' });
    return browser.$('.gta-output').getText();
}
async function setPro(on: boolean): Promise<void> {
    await browser.executeObsidian(async ({ app }, id, on) => {
        const p = (app as unknown as {
            plugins: {
                plugins: Record<string, AuditPlugin>;
            };
        }).plugins.plugins[id]!;
        if (!on) {
            p.pro.signOut();
            return;
        }
        p.pro.opts.http = async () => ({ status: 200, json: { data: { viewer: { login: 'demo-reader' }, user: { sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
        app.secretStorage.setSecret(`${id}-github-token`, 'gho_' + '0'.repeat(36));
        await p.pro.refreshNow();
    }, pluginId, on);
}
describe('Glossary term workflow', function () {
    before(async () => { await obsidianPage.write('Job/Source.md', 'pump\n\npump'); await obsidianPage.write('Job/Target.md', 'pompe\n\nmoteur pompa'); await setPro(false); });
    after(async () => { await setPro(false); await browser.executeObsidian(({ app }, id) => { const p = (app as unknown as {
        plugins: {
            plugins: Record<string, AuditPlugin>;
        };
    }).plugins.plugins[id]!; for (const m of [...p.modals])
        m.close(); }, pluginId); });
    it('renders missing and forbidden findings in paragraph two', async () => { await start(); const text = await run(); expect(text).toContain('2 paired prose blocks checked. 2 findings.'); expect(text).toContain('Paragraph 2: Missing approved term'); expect(text).toContain('Paragraph 2: Forbidden target term'); });
    it('opens the target at paragraph two through the result button', async () => { await start(); await run(); await browser.$('.gta-open-target').click(); await browser.waitUntil(async () => browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path === 'Job/Target.md' && app.workspace.activeEditor?.editor?.getCursor().line === 2), { timeout: 15000, timeoutMsg: 'Target cursor did not reach paragraph two' }); expect(await browser.$('.gta-modal').isExisting()).toBe(false); });
    it('switches an already active target from reading mode to source mode', async () => { await browser.executeObsidian(async ({ app }) => { await app.workspace.getLeaf(false).setViewState({ type: 'markdown', state: { file: 'Job/Target.md', mode: 'preview' } }); }); await start(); await run(); await browser.$('.gta-open-target').click(); await browser.waitUntil(async () => browser.executeObsidian(({ app, obsidian }) => { const v = app.workspace.getActiveViewOfType(obsidian.MarkdownView); return v?.getMode() === 'source' && v.editor.getCursor().line === 2; }), { timeout: 15000, timeoutMsg: 'Active reading view did not switch to the result line in source mode' }); });
    it('opens the source at the affected block', async () => { await start(); await run(); await browser.$('.gta-open-source').click(); await browser.waitUntil(async () => browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path === 'Job/Source.md' && app.workspace.activeEditor?.editor?.getCursor().line === 2), { timeout: 15000, timeoutMsg: 'Source cursor did not reach paragraph two' }); });
    it('stops on alignment mismatch without compliance findings', async () => { await obsidianPage.write('Job/Short.md', 'pompe'); await start(CSV, 'Job/Source.md', 'Job/Short.md'); expect(await run()).toContain('Alignment stopped'); expect(await browser.$('.gta-finding').isExisting()).toBe(false); });
    it('reports skipped rows and retains quoted comma terms', async () => { await obsidianPage.write('Job/CommaSource.md', 'fuel, pump'); await obsidianPage.write('Job/CommaTarget.md', 'pompe, carburant'); await start('source,approved,forbidden\n,pompe,pompa\n"fuel, pump","pompe, carburant",pompa', 'Job/CommaSource.md', 'Job/CommaTarget.md'); const text = await run(); expect(text).toContain('Skipped CSV rows: 2'); expect(text).toContain('0 findings.'); });
    it('loads a local browser file through the file input', async () => { await start(); await browser.execute(() => { const input = document.querySelector('.gta-upload input') as HTMLInputElement; const data = new DataTransfer(); data.items.add(new File(['source,approved,forbidden\npump,moteur,'], 'client.csv', { type: 'text/csv' })); input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true })); }); await browser.waitUntil(async () => (await browser.$('.gta-csv').getValue()).includes('pump,moteur,'), { timeout: 10000, timeoutMsg: 'Local CSV did not load' }); expect(await run()).toContain('Paragraph 1: Missing approved term'); });
    it('keeps pair checks free and rejects paid operations while signed out', async () => { await setPro(false); await start(); expect(await run()).toContain('2 findings.'); const errors = await browser.executeObsidian(async ({ app }, id, csv) => { const p = (app as unknown as {
        plugins: {
            plugins: Record<string, AuditPlugin>;
        };
    }).plugins.plugins[id]!; const errors: string[] = []; try {
        await p.saveProfile('Client', csv);
    }
    catch (e) {
        errors.push(String(e));
    } try {
        await p.checkFolder('Job', 'source,target\nSource.md,Target.md', csv);
    }
    catch (e) {
        errors.push(String(e));
    } return errors; }, pluginId, CSV); expect(errors).toHaveLength(2); expect(errors.join(' ')).toContain('Pro'); });
    it('checks a folder and saves separate client profiles with a simulated sponsorship', async () => { await setPro(true); await start(); await browser.$('.gta-folder-check').waitForDisplayed(); const out = await browser.executeObsidian(async ({ app }, id, csv) => { const p = (app as unknown as {
        plugins: {
            plugins: Record<string, AuditPlugin>;
        };
    }).plugins.plugins[id]!; await p.saveProfile('Client A', csv); await p.saveProfile('Client B', csv.replace('pompe', 'moteur')); const reports = await p.checkFolder('Job', 'source,target\nSource.md,Target.md\nCommaSource.md,CommaTarget.md', csv); return { profiles: p.settings.profiles.map(x => x.name), counts: reports.map(x => x.report.findings.length) }; }, pluginId, CSV); expect(out.profiles).toContain('Client A'); expect(out.profiles).toContain('Client B'); expect(out.counts).toEqual([2, 0]); });
    it('retains the last checked pair and glossary after a plugin reload', async () => { await setPro(false); await start(); await run(); expect((await reloadPlugin(pluginId)).errors).toEqual([]); const saved = await browser.executeObsidian(({ app }, id) => { const p = (app as unknown as {
        plugins: {
            plugins: Record<string, AuditPlugin>;
        };
    }).plugins.plugins[id]!; return { source: p.settings.source, target: p.settings.target, csv: p.settings.csv }; }, pluginId); expect(saved).toEqual({ source: 'Job/Source.md', target: 'Job/Target.md', csv: CSV }); });
});

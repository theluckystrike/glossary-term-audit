import { MarkdownView, Notice, Plugin, normalizePath, type TFile } from 'obsidian';
import type { SponsorsManager } from './license/index';
import { createGitHubSponsors } from './license/github-obsidian';
import { SPONSORS, bindPro, isPro, resetPro } from './pro';
import { DEFAULT_SETTINGS, GlossaryTermAuditSettingTab, normalizeSettings, type GlossaryTermAuditSettings } from './settings';
import { audit, declaredPairs, loadGlossary, type AuditReport } from './audit';
import { AuditModal } from './modal';
export interface PairReport {
    source: string;
    target: string;
    report: AuditReport;
}
export default class GlossaryTermAuditPlugin extends Plugin {
    settings: GlossaryTermAuditSettings = normalizeSettings(DEFAULT_SETTINGS);
    pro: SponsorsManager | null = null;
    readonly modals = new Set<AuditModal>();
    async onload(): Promise<void> {
        await this.loadSettings();
        const pro = createGitHubSponsors(this.app, this.manifest.id, SPONSORS, this);
        pro.init();
        this.pro = pro;
        bindPro(pro);
        const tab = new GlossaryTermAuditSettingTab(this.app, this);
        this.addSettingTab(tab);
        this.register(pro.onChange(() => { tab.update(); for (const modal of this.modals)
            modal.updatePro(); }));
        this.addCommand({ id: 'open-audit', name: 'Check a translated note pair', callback: () => this.openAudit() });
        this.app.workspace.onLayoutReady(() => { void pro.refresh(); this.registerInterval(window.setInterval(() => void pro.refresh(), 6 * 60 * 60 * 1000)); });
    }
    onunload(): void { for (const modal of [...this.modals])
        modal.close(); resetPro(); }
    openAudit(): void { new AuditModal(this).open(); }
    async loadSettings(): Promise<void> { this.settings = normalizeSettings(await this.loadData()); }
    async saveSettings(): Promise<void> { await this.saveData(this.settings); }
    async checkPair(source: string, target: string, csv: string): Promise<PairReport> {
        const sourcePath = normalizePath(source), targetPath = normalizePath(target);
        const s = this.app.vault.getFileByPath(sourcePath), t = this.app.vault.getFileByPath(targetPath);
        if (!s || !t || s.extension !== 'md' || t.extension !== 'md')
            throw new Error('Choose two Markdown notes in this vault.');
        const [a, b] = await Promise.all([this.app.vault.cachedRead(s), this.app.vault.cachedRead(t)]);
        return { source: sourcePath, target: targetPath, report: audit(a, b, csv, this.settings) };
    }
    async checkFolder(folder: string, pairs: string, csv: string): Promise<PairReport[]> {
        if (!isPro())
            throw new Error('Folder checks need Pro. The single pair check is free.');
        const base = normalizePath(folder);
        if (!base)
            throw new Error('Enter a folder path.');
        const out: PairReport[] = [];
        for (const pair of declaredPairs(pairs)) {
            if (!isPro())
                throw new Error('Pro is off. Folder check stopped.');
            out.push(await this.checkPair(`${base}/${pair.source}`, `${base}/${pair.target}`, csv));
        }
        if (!out.length)
            throw new Error('Declare at least one note pair.');
        return out;
    }
    async saveProfile(name: string, csv: string): Promise<void> {
        if (!isPro())
            throw new Error('Client glossary profiles need Pro.');
        const label = name.trim();
        if (!label)
            throw new Error('Enter a profile name.');
        if (!loadGlossary(csv).rows.length)
            throw new Error('The profile needs valid glossary rows.');
        this.settings.profiles = [...this.settings.profiles.filter(p => p.name !== label), { name: label, csv }];
        await this.saveSettings();
    }
    loadProfile(name: string): string {
        if (!isPro())
            throw new Error('Client glossary profiles need Pro.');
        const profile = this.settings.profiles.find(p => p.name === name);
        if (!profile)
            throw new Error('Choose a saved profile.');
        return profile.csv;
    }
    async openResult(path: string, line: number): Promise<void> {
        const file: TFile | null = this.app.vault.getFileByPath(normalizePath(path));
        if (!file) {
            new Notice('The note is no longer at this path.');
            return;
        }
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file, { active: true });
        await leaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'source' } });
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const pos = { line, ch: 0 };
            view.editor.setCursor(pos);
            view.editor.scrollIntoView({ from: pos, to: pos }, true);
            view.editor.focus();
        }
    }
}

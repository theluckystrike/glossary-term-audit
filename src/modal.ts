import { FuzzySuggestModal, Modal, type TFile } from 'obsidian';
import type GlossaryTermAuditPlugin from './main';
import type { PairReport } from './main';
import { FOLDER_LEAD, isPro, PROFILES_LEAD, proNotice, proText } from './pro';
class NotePicker extends FuzzySuggestModal<TFile> {
    constructor(readonly plugin: GlossaryTermAuditPlugin, readonly choose: (file: TFile) => void) { super(plugin.app); }
    getItems(): TFile[] { return this.plugin.app.vault.getFiles().filter(f => f.extension === 'md'); }
    getItemText(file: TFile): string { return file.path; }
    onChooseItem(file: TFile): void { this.choose(file); }
}
export class AuditModal extends Modal {
    source!: HTMLInputElement;
    target!: HTMLInputElement;
    csv!: HTMLTextAreaElement;
    output!: HTMLElement;
    proArea!: HTMLElement;
    constructor(readonly plugin: GlossaryTermAuditPlugin) { super(plugin.app); }
    onOpen(): void {
        this.shouldRestoreSelection = false;
        this.plugin.modals.add(this);
        this.setTitle('Glossary term audit');
        this.modalEl.addClass('gta-modal');
        const root = this.contentEl;
        root.createEl('p', { text: 'Compare approved and forbidden terms in paired prose blocks. Confirm paragraph alignment before you check.', cls: 'gta-intro' });
        this.source = this.noteInput('Source note', this.plugin.settings.source || this.app.workspace.getActiveFile()?.path || '');
        this.target = this.noteInput('Target note', this.plugin.settings.target);
        const label = root.createEl('label', { text: 'Glossary CSV', cls: 'gta-field' });
        this.csv = label.createEl('textarea', { cls: 'gta-csv' });
        this.csv.value = this.plugin.settings.csv;
        this.csv.rows = 5;
        const uploadLabel = root.createEl('label', { text: 'Load a local CSV file ', cls: 'gta-upload' });
        const upload = uploadLabel.createEl('input', { type: 'file' });
        upload.accept = '.csv,text/csv';
        upload.addEventListener('change', () => { void this.perform(async () => { const file = upload.files?.[0]; if (file)
            this.csv.value = await file.text(); }); });
        root.createEl('p', { text: 'Headers: source,approved,forbidden. One literal term per cell. Quote cells that contain a comma.', cls: 'gta-hint' });
        this.button(root, 'Check pair', async () => { this.output.empty(); const result = await this.plugin.checkPair(this.source.value, this.target.value, this.csv.value); this.render([result]); this.plugin.settings.source = this.source.value; this.plugin.settings.target = this.target.value; this.plugin.settings.csv = this.csv.value; await this.plugin.saveSettings(); }, 'gta-check');
        this.output = root.createDiv({ cls: 'gta-output' });
        this.output.setAttribute('aria-live', 'polite');
        this.proArea = root.createDiv({ cls: 'gta-pro' });
        this.updatePro();
    }
    private noteInput(text: string, value: string): HTMLInputElement {
        const row = this.contentEl.createDiv({ cls: 'gta-note-row' });
        const label = row.createEl('label', { text, cls: 'gta-field' });
        const input = label.createEl('input', { type: 'text' });
        input.value = value;
        this.button(row, `Choose ${text.toLowerCase()}`, async () => { new NotePicker(this.plugin, file => { input.value = file.path; }).open(); });
        return input;
    }
    private button(parent: HTMLElement, text: string, action: () => Promise<void>, cls = ''): HTMLButtonElement {
        const button = parent.createEl('button', { text, cls });
        button.addEventListener('click', () => { button.disabled = true; void this.perform(action).finally(() => { button.disabled = false; }); });
        return button;
    }
    private async perform(action: () => Promise<void>): Promise<void> { try {
        await action();
    }
    catch (error) {
        this.output.empty();
        this.output.createEl('p', { text: error instanceof Error ? error.message : 'The check failed.', cls: 'gta-error' });
    } }
    render(reports: PairReport[]): void {
        this.output.empty();
        for (const pair of reports) {
            const card = this.output.createDiv({ cls: 'gta-report' });
            card.createEl('p', { text: `${pair.source} → ${pair.target}`, cls: 'gta-pair-title' });
            const r = pair.report;
            if (r.skippedRows.length)
                card.createEl('p', { text: `Skipped CSV rows: ${r.skippedRows.join(', ')}. Supply three cells with a source and an approved term.`, cls: 'gta-warning' });
            if (r.error) {
                card.createEl('p', { text: r.error, cls: 'gta-error' });
                continue;
            }
            card.createEl('p', { text: `${r.sourceBlocks} paired prose blocks checked. ${r.findings.length} findings.`, cls: 'gta-summary' });
            if (!r.findings.length)
                card.createEl('p', { text: 'No missing approved terms or forbidden target terms found. Review the translation for meaning.' });
            for (const finding of r.findings) {
                const item = card.createDiv({ cls: 'gta-finding' });
                item.createEl('strong', { text: `Paragraph ${finding.paragraph}: ${finding.kind === 'missing' ? 'Missing approved term' : 'Forbidden target term'} — ${finding.term}` });
                item.createEl('p', { text: `Source term: ${finding.sourceTerm}. Glossary row ${finding.row}.`, cls: 'gta-hint' });
                this.button(item, 'Open source', async () => { await this.plugin.openResult(pair.source, finding.sourceLine); this.close(); }, 'gta-open-source');
                this.button(item, 'Open target', async () => { await this.plugin.openResult(pair.target, finding.targetLine); this.close(); }, 'gta-open-target');
            }
        }
    }
    updatePro(): void {
        if (!this.proArea)
            return;
        this.proArea.empty();
        const root = this.proArea;
        root.createEl('h3', { text: 'Folder checks' }).createSpan({ text: ' (Pro)' });
        // A free user sees the Pro controls. The fields hold only local text. Each Pro button shows the Pro notice and runs nothing.
        if (!isPro())
            root.createEl('p', { text: proText('Pro adds folder checks of declared note pairs and separate client glossary profiles.') });
        const folderLabel = root.createEl('label', { text: 'Folder path', cls: 'gta-field' });
        const folder = folderLabel.createEl('input', { type: 'text' });
        folder.placeholder = 'Translations';
        const pairsLabel = root.createEl('label', { text: 'Declared pairs CSV with paths relative to the folder', cls: 'gta-field' });
        const pairs = pairsLabel.createEl('textarea');
        pairs.rows = 3;
        pairs.value = 'source,target\nSource.md,Target.md';
        this.button(root, 'Check folder (Pro)', async () => { if (!isPro()) { proNotice(FOLDER_LEAD); return; } this.output.empty(); this.render(await this.plugin.checkFolder(folder.value, pairs.value, this.csv.value)); }, 'gta-folder-check');
        root.createEl('h3', { text: 'Client glossary profiles' }).createSpan({ text: ' (Pro)' });
        const nameLabel = root.createEl('label', { text: 'Profile name', cls: 'gta-field' });
        const name = nameLabel.createEl('input', { type: 'text' });
        this.button(root, 'Save profile (Pro)', async () => { if (!isPro()) { proNotice(PROFILES_LEAD); return; } await this.plugin.saveProfile(name.value, this.csv.value); this.updatePro(); });
        const select = root.createEl('select', { cls: 'gta-profiles' });
        select.setAttribute('aria-label', 'Client glossary profile');
        for (const p of this.plugin.settings.profiles)
            select.createEl('option', { text: p.name, value: p.name });
        this.button(root, 'Load profile (Pro)', async () => { if (!isPro()) { proNotice(PROFILES_LEAD); return; } this.csv.value = this.plugin.loadProfile(select.value); });
    }
    onClose(): void { this.plugin.modals.delete(this); this.contentEl.empty(); }
}

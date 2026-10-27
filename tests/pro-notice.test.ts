import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, Notice } from 'obsidian-test-mocks/obsidian';
import type { SponsorsManager } from '../src/license/index';
import GlossaryTermAuditPlugin from '../src/main';
import { AuditModal } from '../src/modal';
import { bindPro, resetPro } from '../src/pro';
import manifest from '../manifest.json';

// A free user sees the Pro controls of the audit window. Check folder, Save profile and Load profile show the shared
// Pro notice with the "Sponsor on GitHub" button. No folder check runs, no profile is saved or loaded.
const PITCH = 'Sponsor on GitHub, then sign in from the plugin settings.';
const FOLDER = 'Folder checks need Pro. The single pair check is free.';
const PROFILES = 'Client glossary profiles need Pro.';
const csv = 'source,approved,forbidden\npump,pompe,pompa';

function fakePro(pro: boolean): SponsorsManager {
	return {
		isPro: () => pro,
		onChange: () => () => undefined,
		hasToken: () => false,
		isChecking: () => false,
		getState: () => ({ status: 'unchecked', lastAttemptAt: 0 }),
		config: { sponsorLogin: 'theluckystrike', source: 'glossary-term-audit' },
	} as unknown as SponsorsManager;
}

async function setup(pro: boolean, profiles: { name: string; csv: string }[] = []) {
	const app = App.createConfigured__({ files: { 'Job/Source.md': 'pump\n\npump', 'Job/Target.md': 'pompe\n\nmoteur pompa' } });
	const plugin = new GlossaryTermAuditPlugin(app as never, manifest as never);
	await plugin.loadSettings();
	plugin.settings.profiles = profiles;
	plugin.settings.csv = csv;
	plugin.saveSettings = vi.fn(async () => undefined);
	bindPro(fakePro(pro));
	const shown: { text: string; buttons: number }[] = [];
	vi.spyOn(Notice.prototype as unknown as { constructor__(): void }, 'constructor__').mockImplementation(function (this: Notice) {
		shown.push({ text: this.messageEl.textContent ?? '', buttons: this.messageEl.querySelectorAll('.pf-pro-notice-sponsor').length });
	});
	const modal = new AuditModal(plugin);
	modal.onOpen();
	return { plugin, modal, shown };
}
const button = (modal: AuditModal, text: string) => [...modal.contentEl.querySelectorAll('button')].find((b) => b.textContent === text);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Pro controls of the audit window', () => {
	afterEach(() => { resetPro(); vi.restoreAllMocks(); });

	it('a free user who selects Check folder, Save profile or Load profile gets the Pro notice with a Sponsor button, and nothing runs or saves', async () => {
		const { plugin, modal, shown } = await setup(false, [{ name: 'Client', csv: 'source,approved,forbidden\nvalve,vanne,' }]);
		const check = vi.spyOn(plugin, 'checkFolder');
		const save = vi.spyOn(plugin, 'saveProfile');
		const load = vi.spyOn(plugin, 'loadProfile');
		for (const name of ['Check folder (Pro)', 'Save profile (Pro)', 'Load profile (Pro)']) {
			const b = button(modal, name);
			expect(b, name).toBeDefined();
			expect(b!.disabled).toBe(false);
			b!.click();
			await flush();
		}
		expect(shown).toEqual([
			{ text: `${FOLDER} ${PITCH}Sponsor on GitHub`, buttons: 1 },
			{ text: `${PROFILES} ${PITCH}Sponsor on GitHub`, buttons: 1 },
			{ text: `${PROFILES} ${PITCH}Sponsor on GitHub`, buttons: 1 },
		]);
		expect(check).not.toHaveBeenCalled();
		expect(save).not.toHaveBeenCalled();
		expect(load).not.toHaveBeenCalled();
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(modal.csv.value).toBe(csv);
		expect(modal.output.textContent).toBe('');
		expect(plugin.settings.profiles.map((p) => p.name)).toEqual(['Client']);
		modal.close();
	});

	it('a Pro user who selects Save profile and Check folder saves the profile and runs the check, with no Pro notice', async () => {
		const { plugin, modal, shown } = await setup(true);
		const name = modal.contentEl.querySelector<HTMLInputElement>('.gta-pro input[type="text"]:not([placeholder])')!;
		name.value = 'Client';
		button(modal, 'Save profile (Pro)')!.click();
		await vi.waitFor(() => { expect(plugin.saveSettings).toHaveBeenCalled(); });
		expect(plugin.settings.profiles.map((p) => p.name)).toEqual(['Client']);
		const folder = modal.contentEl.querySelector<HTMLInputElement>('.gta-pro input[placeholder="Translations"]')!;
		folder.value = 'Job';
		button(modal, 'Check folder (Pro)')!.click();
		await vi.waitFor(() => { expect(modal.output.textContent).toContain('findings'); });
		expect(shown.filter((n) => n.buttons > 0)).toEqual([]);
		modal.close();
	});
});

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import type GlossaryTermAuditPlugin from '../../src/main';
import type { SponsorsManager } from '../../src/license/index';

// A free user sees the Pro controls of the audit window. Check folder and Save profile show the shared Pro notice
// with the "Sponsor on GitHub" button. No folder check runs and no profile is saved. A Pro user saves a profile.
type Host = { plugins: { plugins: Record<string, GlossaryTermAuditPlugin> } };
const FOLDER = 'Folder checks need Pro.';
const PROFILES = 'Client glossary profiles need Pro.';
const CSV = 'source,approved,forbidden\npump,pompe,pompa';

async function setPro(on: boolean): Promise<boolean> {
	return browser.executeObsidian(async ({ app }, enabled) => {
		const p = (app as unknown as Host).plugins.plugins['glossary-term-audit']!;
		const pro = p.pro as SponsorsManager;
		if (!enabled) { pro.signOut(); return pro.isPro(); }
		// Synthetic token store and HTTP answer. No network request or Keychain key.
		let token: string | null = 'gho_' + '0'.repeat(36);
		pro.opts.tokens.get = () => token; pro.opts.tokens.set = (v) => { token = v; }; pro.opts.tokens.clear = () => { token = null; };
		pro.opts.http = async () => ({ status: 200, json: { data: { viewer: { login: 'demo-reader', totalSponsorshipAmountAsSponsorInCents: 1500 }, user: { viewerIsSponsoring: true, sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
		await pro.refreshNow();
		return pro.isPro();
	}, on);
}

async function openWindow(): Promise<void> {
	await obsidianPage.write('Pro check/Source.md', 'pump\n\npump');
	await obsidianPage.write('Pro check/Target.md', 'pompe\n\nmoteur pompa');
	await browser.executeObsidian(({ app }, csv) => {
		const p = (app as unknown as Host).plugins.plugins['glossary-term-audit']!;
		for (const m of [...p.modals]) m.close();
		p.settings.source = 'Pro check/Source.md'; p.settings.target = 'Pro check/Target.md'; p.settings.csv = csv;
		p.openAudit();
		activeDocument.querySelectorAll('.notice').forEach((n) => n.remove());
		const root = activeDocument.querySelector('.gta-modal .gta-pro')!;
		root.querySelector<HTMLInputElement>('input[placeholder="Translations"]')!.value = 'Pro check';
		root.querySelector<HTMLTextAreaElement>('textarea')!.value = 'source,target\nSource.md,Target.md';
		[...root.querySelectorAll('input[type="text"]')].filter((e) => !(e as HTMLInputElement).placeholder).forEach((e) => { (e as HTMLInputElement).value = 'Client'; });
	}, CSV);
	await browser.$('.gta-modal .gta-pro').waitForDisplayed({ timeout: 5000 });
}

async function press(label: string) {
	const button = await browser.$(`//div[contains(@class,"gta-pro")]//button[normalize-space(text())="${label}"]`);
	expect(await button.isEnabled()).toBe(true);
	await button.click();
	await browser.pause(400);
	return browser.executeObsidian(async ({ app }) => {
		const p = (app as unknown as Host).plugins.plugins['glossary-term-audit']!;
		return {
			notices: [...activeDocument.querySelectorAll('.notice')].map((n) => ({ text: n.textContent ?? '', sponsor: n.querySelectorAll('.pf-pro-notice-sponsor').length })),
			profiles: p.settings.profiles.map((x) => x.name),
			saved: JSON.stringify((await p.loadData()) ?? {}),
			output: activeDocument.querySelector('.gta-modal .gta-output')?.textContent ?? '',
		};
	});
}

describe('Pro controls of the audit window', function () {
	afterEach(async () => {
		await browser.executeObsidian(async ({ app }) => {
			const p = (app as unknown as Host).plugins.plugins['glossary-term-audit']!;
			for (const m of [...p.modals]) m.close();
			p.settings.profiles = []; await p.saveSettings();
		});
		await setPro(false);
	});

	it('a free user who selects Check folder or Save profile gets the Pro notice with a Sponsor button, and nothing runs or saves', async () => {
		expect(await setPro(false)).toBe(false);
		await openWindow();
		const before = await browser.executeObsidian(async ({ app }) => JSON.stringify((await (app as unknown as Host).plugins.plugins['glossary-term-audit']!.loadData()) ?? {}));
		const folder = await press('Check folder (Pro)');
		if (!folder.notices.some((n) => n.text.includes(FOLDER) && n.sponsor === 1)) throw new Error(`No Pro notice after Check folder: ${JSON.stringify(folder.notices)}`);
		expect(folder.output).toBe('');
		const save = await press('Save profile (Pro)');
		if (!save.notices.some((n) => n.text.includes(PROFILES) && n.sponsor === 1)) throw new Error(`No Pro notice after Save profile: ${JSON.stringify(save.notices)}`);
		expect(save.profiles).toEqual([]);
		expect(save.saved).toBe(before);
	});

	it('a Pro user who selects Save profile saves it, with no Pro notice', async () => {
		expect(await setPro(true)).toBe(true);
		await openWindow();
		const save = await press('Save profile (Pro)');
		expect(save.profiles).toEqual(['Client']);
		expect(save.notices.filter((n) => n.sponsor > 0)).toEqual([]);
	});
});

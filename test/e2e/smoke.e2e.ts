import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { pluginId, reloadPlugin } from './load';
describe(`${pluginId} smoke test`, function () {
    it('is enabled and reloads with no console errors', async function () {
        const state = await reloadPlugin(pluginId);
        expect(state).toEqual({ enabled: true, reloaded: true, errors: [] });
    });
    it('runs the core command', async function () {
        await obsidianPage.write('Smoke.md', 'one two three four five');
        await obsidianPage.openFile('Smoke.md');
        await browser.executeObsidianCommand(`${pluginId}:open-audit`);
        await browser.$('.gta-check').waitForDisplayed();
        expect(await browser.$('.gta-csv').isDisplayed()).toBe(true);
    });
});

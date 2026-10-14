import { describe, expect, it } from 'vitest';
import { audit, containsTerm, loadGlossary, proseBlocks } from '../src/audit';
const on = { wholeTerm: true, ignoreCase: true };
describe('Review regressions', () => {
    it('finds a multiword term across a hard line wrap', () => {
        expect(containsTerm('the heat\npump runs', 'heat pump', on)).toBe(true);
        const r = audit('heat pump', 'la pompe\nà chaleur', 'source,approved,forbidden\nheat pump,pompe à chaleur,', on);
        expect(r.findings).toEqual([]);
    });
    it('finds a term with a no-break space in the note', () => {
        expect(containsTerm('pompe à chaleur', 'pompe à chaleur', on)).toBe(true);
    });
    it('matches decomposed and composed accents', () => {
        expect(containsTerm('café noir', 'café', on)).toBe(true);
        expect(containsTerm('café noir', 'café', on)).toBe(true);
    });
    it('keeps a combining mark inside the word in whole term mode', () => {
        expect(containsTerm('café', 'cafe', on)).toBe(false);
    });
    it('checks a large block in linear time', () => {
        const text = 'other '.repeat(200000);
        const t0 = Date.now();
        expect(containsTerm(text, 'the', on)).toBe(false);
        expect(Date.now() - t0).toBeLessThan(1000);
    });
    it('keeps block lines for navigation', () => {
        expect(proseBlocks('a\nb\n\nc')).toEqual([{ text: 'a\nb', line: 0 }, { text: 'c', line: 3 }]);
    });
    it('splits prose at headings, lists, quotes, tables and rules', () => {
        const md = 'a\n# H\nb\n- item\nc\n> quote\nd\n| x |\ne\n1. one\nf\n***\ng';
        expect(proseBlocks(md).map(b => b.text)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    });
    it('removes spaces from cell ends and skips wrong cell counts', () => {
        expect(loadGlossary('source,approved,forbidden\n  pump , pompe ,pompa\npump,pompe')).toEqual({ rows: [{ source: 'pump', approved: 'pompe', forbidden: 'pompa', row: 2 }], skippedRows: [3] });
    });
});

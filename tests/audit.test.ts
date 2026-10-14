import { describe, expect, it } from 'vitest';
import vectors from './vectors/glossary-term-audit.json';
import { audit, declaredPairs, loadGlossary, readCsv, type Options } from '../src/audit';
describe('Acceptance vectors', () => {
    for (const c of vectors.cases)
        it(c.name, () => { const [s, t, csv, options] = c.args; expect(audit(s as string, t as string, csv as string, options as Options | undefined)).toMatchObject(c.expected); });
});
describe('CSV and pair declarations', () => {
    it('reads a newline inside a quoted field and tracks the next row', () => { expect(readCsv('a,b\n"two\nlines",x\ny,z')).toEqual([{ cells: ['a', 'b'], row: 1 }, { cells: ['two\nlines', 'x'], row: 2 }, { cells: ['y', 'z'], row: 4 }]); });
    it('rejects trailing text after a quoted field', () => { expect(() => readCsv('"a"b,c')).toThrow('text after'); });
    it('rejects a quote in unquoted text', () => { expect(() => readCsv('a"b,c')).toThrow('unexpected quote'); });
    it('does not silently reinterpret headers', () => { expect(() => loadGlossary('approved,source,forbidden')).toThrow('headers'); });
    it('reads declared pair paths with commas', () => { expect(declaredPairs('source,target\n"a,b.md",c.md')).toEqual([{ source: 'a,b.md', target: 'c.md', row: 2 }]); });
    it('rejects parent paths', () => { expect(() => declaredPairs('source,target\n../a.md,b.md')).toThrow('parent paths'); });
    it('rejects missing target paths', () => { expect(() => declaredPairs('source,target\na.md,')).toThrow('two note paths'); });
});

export interface CsvRecord {
    cells: string[];
    row: number;
}
export interface GlossaryRow {
    source: string;
    approved: string;
    forbidden: string;
    row: number;
}
export interface Options {
    wholeTerm: boolean;
    ignoreCase: boolean;
}
export interface Block {
    text: string;
    line: number;
}
export interface Finding {
    paragraph: number;
    kind: 'missing' | 'forbidden';
    term: string;
    sourceTerm: string;
    row: number;
    sourceLine: number;
    targetLine: number;
}
export interface AuditReport {
    sourceBlocks: number;
    targetBlocks: number;
    findings: Finding[];
    skippedRows: number[];
    error: string | null;
}
/** Read quoted CSV cells and keep the physical start line of each record. */
export function readCsv(text: string): CsvRecord[] {
    const input = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const records: CsvRecord[] = [];
    let cells: string[] = [], cell = '', quoted = false, closed = false, line = 1, row = 1;
    const emit = () => { cells.push(cell.trim()); if (cells.some(x => x !== ''))
        records.push({ cells, row }); cells = []; cell = ''; closed = false; };
    for (let i = 0; i < input.length; i++) {
        const c = input[i]!;
        if (quoted) {
            if (c === '"') {
                if (input[i + 1] === '"') {
                    cell += '"';
                    i++;
                }
                else {
                    quoted = false;
                    closed = true;
                }
            }
            else {
                cell += c;
                if (c === '\n')
                    line++;
            }
        }
        else if (c === '"') {
            if (cell.trim() !== '' || closed)
                throw new Error(`CSV row ${row}: unexpected quote.`);
            cell = '';
            quoted = true;
        }
        else if (c === ',') {
            cells.push(cell.trim());
            cell = '';
            closed = false;
        }
        else if (c === '\n') {
            emit();
            line++;
            row = line;
        }
        else {
            if (closed && c.trim() !== '')
                throw new Error(`CSV row ${row}: text after closing quote.`);
            cell += c;
        }
    }
    if (quoted)
        throw new Error(`CSV row ${row}: unclosed quote.`);
    if (cell !== '' || cells.length || closed)
        emit();
    return records;
}
export function loadGlossary(csv: string): {
    rows: GlossaryRow[];
    skippedRows: number[];
} {
    const records = readCsv(csv);
    if (records[0]?.cells.join(',') !== 'source,approved,forbidden')
        throw new Error('Use CSV headers source,approved,forbidden in this order.');
    const rows: GlossaryRow[] = [], skippedRows: number[] = [];
    for (const r of records.slice(1)) {
        if (r.cells.length !== 3 || !r.cells[0] || !r.cells[1]) {
            skippedRows.push(r.row);
            continue;
        }
        rows.push({ source: r.cells[0], approved: r.cells[1], forbidden: r.cells[2]!, row: r.row });
    }
    return { rows, skippedRows };
}
/** A prose block has consecutive nonblank lines. Structural blocks split prose. */
export function proseBlocks(markdown: string): Block[] {
    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    const blocks: Block[] = [];
    let current: Block | null = null, fence = '', fenceLength = 0, front = lines[0]?.trim() === '---';
    const flush = () => { if (current)
        blocks.push(current); current = null; };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (front) {
            if (i > 0 && /^(---|\.\.\.)\s*$/.test(line))
                front = false;
            continue;
        }
        const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
        if (fence) {
            if (marker && marker[1]![0] === fence && marker[1]!.length >= fenceLength && !marker[2]!.trim())
                fence = '';
            continue;
        }
        if (marker) {
            flush();
            fence = marker[1]![0]!;
            fenceLength = marker[1]!.length;
            continue;
        }
        if (!line.trim() || /^( {4}|\t| {0,3}#{1,6}\s|\s*>|\s*[-+*]\s|\s*\d+[.)]\s|\s*\|)/.test(line) || /^\s*(?:[-*_]\s*){3,}$/.test(line)) {
            flush();
            continue;
        }
        const text = line.replace(/(`+)[\s\S]*?\1/g, ' ');
        if (!current)
            current = { text, line: i };
        else
            current.text += '\n' + text;
    }
    flush();
    return blocks;
}
/** Compare NFC text with each whitespace run read as one space. */
function matchText(text: string, ignoreCase: boolean): string {
    const flat = text.normalize('NFC').replace(/\s+/g, ' ');
    return ignoreCase ? flat.toLowerCase() : flat;
}
export function containsTerm(text: string, term: string, options: Options): boolean {
    const needle = matchText(term.trim(), options.ignoreCase);
    if (!needle)
        return false;
    const hay = matchText(text, options.ignoreCase);
    const word = (c: string | undefined) => c !== undefined && /[\p{L}\p{M}\p{N}_]/u.test(c);
    const before = (at: number) => { const low = hay.charCodeAt(at - 1); return hay.slice(low >= 0xdc00 && low <= 0xdfff ? at - 2 : at - 1, at) || undefined; };
    const after = (at: number) => { const c = hay.codePointAt(at); return c === undefined ? undefined : String.fromCodePoint(c); };
    for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) {
        if (!options.wholeTerm || (!word(before(at)) && !word(after(at + needle.length))))
            return true;
    }
    return false;
}
export function audit(source: string, target: string, csv: string, options: Options = { wholeTerm: true, ignoreCase: true }): AuditReport {
    const s = proseBlocks(source), t = proseBlocks(target);
    const report: AuditReport = { sourceBlocks: s.length, targetBlocks: t.length, findings: [], skippedRows: [], error: null };
    try {
        const glossary = loadGlossary(csv);
        report.skippedRows = glossary.skippedRows;
        if (!glossary.rows.length) {
            report.error = 'No valid glossary rows. Load a source term and an approved term.';
            return report;
        }
        if (s.length !== t.length) {
            report.error = `Alignment stopped: source has ${s.length} prose blocks; target has ${t.length}. Check paragraph pairs before you run again.`;
            return report;
        }
        if (!s.length) {
            report.error = 'No prose blocks to check.';
            return report;
        }
        for (let i = 0; i < s.length; i++) {
            for (const row of glossary.rows) {
                const add = (kind: Finding['kind'], term: string) => report.findings.push({ paragraph: i + 1, kind, term, sourceTerm: row.source, row: row.row, sourceLine: s[i]!.line, targetLine: t[i]!.line });
                if (containsTerm(s[i]!.text, row.source, options) && !containsTerm(t[i]!.text, row.approved, options))
                    add('missing', row.approved);
                if (row.forbidden && containsTerm(t[i]!.text, row.forbidden, options))
                    add('forbidden', row.forbidden);
            }
        }
    }
    catch (error) {
        report.error = error instanceof Error ? error.message : 'Could not read the glossary.';
    }
    return report;
}
export function declaredPairs(csv: string): {
    source: string;
    target: string;
    row: number;
}[] {
    const records = readCsv(csv);
    if (records[0]?.cells.join(',') !== 'source,target')
        throw new Error('Use pair CSV headers source,target in this order.');
    return records.slice(1).map(r => {
        if (r.cells.length !== 2 || !r.cells[0] || !r.cells[1])
            throw new Error(`Pair row ${r.row}: supply two note paths.`);
        if (r.cells.some(c => c.split(/[\\/]/).includes('..')))
            throw new Error(`Pair row ${r.row}: parent paths are not permitted.`);
        return { source: r.cells[0], target: r.cells[1], row: r.row };
    });
}

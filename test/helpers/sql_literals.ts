/**
 * THE SCANNER'S STATEMENT UNIT — shared by the write-path gates that read SQL
 * out of TypeScript source (`sql_confinement_tripwire` T2, `ws_a_tripwires`).
 *
 * A SQL statement in this engine is ONE string or template literal (the
 * `sql.unsafe(\`…\`)` / `sql\`…\`` / `'INSERT …'` forms). A gate that matches a
 * DML verb against "the rest of the file" has to guess where the statement
 * ends, and the 2026-08-26 audit's P0-3 scan rule needs the opposite guess to
 * be impossible: an UPDATE's SET clause must be read to its end (to see whether
 * a jsonb value is bound into it), and a SELECT must be read to its end (to see
 * whether it carries `FOR UPDATE`). The heuristics the counter gate uses — cut
 * at the first `',` / `');` — stop INSIDE a statement whenever the SQL itself
 * contains a quoted path (`'{tipo}', '[]'::jsonb`), which is exactly the
 * jsonb_set shape the rule is about.
 *
 * So this is a literal WALKER, one copy: it returns every string and template
 * literal of the (comment-stripped) source as a unit, with the line it starts
 * on. Template literals keep their `${…}` holes verbatim (a scanner wants to
 * see `${table}` in target position); nested braces inside a hole are
 * balanced; regex literals are skipped the same way strip_comments.ts skips
 * them, so a `/'/` never opens a string. Comments MUST already be stripped
 * (pass the source through `stripComments` first) — a `'` inside a comment
 * would otherwise open a literal that swallows real code.
 */

export interface SourceLiteral {
	/** The literal's content — quotes removed, `${…}` holes kept verbatim. */
	text: string;
	/** 1-based line of the opening quote. */
	line: number;
}

/** Chars after which a `/` starts a REGEX rather than a division (mirrors strip_comments.ts). */
const REGEX_ALLOWED_AFTER = new Set([
	'',
	'(',
	',',
	'=',
	':',
	'[',
	'!',
	'&',
	'|',
	'?',
	'{',
	'}',
	';',
	'+',
	'-',
	'*',
	'%',
	'~',
	'^',
	'<',
	'>',
	'\n',
]);

/** Every string / template literal of comment-stripped TypeScript source, in order. */
export function extractSourceLiterals(code: string): SourceLiteral[] {
	const literals: SourceLiteral[] = [];
	const length = code.length;
	let index = 0;
	let line = 1;
	while (index < length) {
		const char = code[index] as string;
		if (char === '\n') {
			line++;
			index++;
			continue;
		}
		if (char === "'" || char === '"') {
			const start = index + 1;
			index++;
			while (index < length && code[index] !== char && code[index] !== '\n') {
				if (code[index] === '\\') index++;
				index++;
			}
			literals.push({ text: code.slice(start, index), line });
			index++;
			continue;
		}
		if (char === '`') {
			const start = index + 1;
			const startLine = line;
			index++;
			let holeDepth = 0;
			while (index < length) {
				const current = code[index] as string;
				if (current === '\\') {
					index += 2;
					continue;
				}
				if (current === '\n') line++;
				if (holeDepth === 0 && current === '`') break;
				if (current === '$' && code[index + 1] === '{') {
					holeDepth++;
					index += 2;
					continue;
				}
				if (holeDepth > 0 && current === '{') holeDepth++;
				if (holeDepth > 0 && current === '}') holeDepth--;
				index++;
			}
			literals.push({ text: code.slice(start, index), line: startLine });
			index++;
			continue;
		}
		if (char === '/') {
			const previous = code.slice(0, index).trimEnd().slice(-1);
			if (REGEX_ALLOWED_AFTER.has(previous)) {
				index++;
				let inClass = false;
				while (index < length && code[index] !== '\n') {
					if (code[index] === '\\') {
						index += 2;
						continue;
					}
					if (code[index] === '[') inClass = true;
					else if (code[index] === ']') inClass = false;
					else if (code[index] === '/' && !inClass) break;
					index++;
				}
				index++;
				continue;
			}
		}
		index++;
	}
	return literals;
}

/**
 * Remove SQL COMMENTS from one literal's text — `-- …` to the end of its line
 * and the slash-star … star-slash block form — with quoted strings, quoted
 * identifiers and `${…}` holes opaque (a `--` inside `'{a--b}'` is a path,
 * `${i--}` is TypeScript). Postgres reads `UPDATE <block comment> matrix_test`
 * and `UPDATE\n-- x\nmatrix_test` as `UPDATE matrix_test`; a scanner that joins verb and target with `\s+`
 * alone would not. Newlines are kept so line arithmetic on the result holds;
 * `stripComments` (TypeScript comments) is a different layer — run it on the
 * SOURCE, this on the LITERAL. The extractor keeps SOURCE bytes, so a
 * whitespace ESCAPE (`\n`, `\r`, `\t` in a quoted string) is two characters
 * to a regex `\s+`; outside quotes and holes it is normalized to a space
 * (`'UPDATE\nmatrix_test'` IS `UPDATE matrix_test` at runtime), and it ends a
 * `--` comment the way the newline it stands for does.
 */
export function normalizeSqlLiteral(text: string): string {
	let out = '';
	let index = 0;
	while (index < text.length) {
		const char = text[index] as string;
		if (char === "'" || char === '"') {
			const close = text.indexOf(char, index + 1);
			const end = close === -1 ? text.length : close + 1;
			out += text.slice(index, end);
			index = end;
			continue;
		}
		if (char === '$' && text[index + 1] === '{') {
			let braces = 1;
			let end = index + 2;
			while (end < text.length && braces > 0) {
				if (text[end] === '{') braces++;
				else if (text[end] === '}') braces--;
				end++;
			}
			out += text.slice(index, end);
			index = end;
			continue;
		}
		if (char === '\\' && /[nrt]/.test(text[index + 1] ?? '')) {
			out += ' ';
			index += 2;
			continue;
		}
		if (char === '-' && text[index + 1] === '-') {
			const lineEnd = /\n|\\n/g; // a newline, or its escape
			lineEnd.lastIndex = index;
			const newline = lineEnd.exec(text);
			index = newline === null ? text.length : newline.index; // keep the newline
			out += ' ';
			continue;
		}
		if (char === '/' && text[index + 1] === '*') {
			const close = text.indexOf('*/', index + 2);
			const end = close === -1 ? text.length : close + 2;
			out += ` ${text.slice(index, end).replace(/[^\n]/g, '')}`; // keep the newlines
			index = end;
			continue;
		}
		out += char;
		index++;
	}
	return out;
}

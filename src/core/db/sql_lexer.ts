/**
 * The ONE SQL literal lexer (PERF-11 / OPS-6). Two consumers read SQL text for
 * what it DOES, not what its literals say, and they must agree on where a
 * literal ends:
 *  - db/postgres.ts refuses session state (`SET`/`RESET`/`DISCARD`,
 *    `set_config(…, false)`) in ANY statement of a pooled or transaction-lane
 *    text — a `SELECT 1; SET statement_timeout = 0` leaks exactly like a bare
 *    `SET`;
 *  - update/catalog.ts validates each data-update `sqlUpdate` entry.
 * Linked, never copied: a second lexer would drift on the first edge case.
 *
 * What it understands (PostgreSQL's lexical rules): `-- …` line comments,
 * NESTED `/* … *\/` block comments, `'…'` strings with doubled-quote escapes,
 * `E'…'` strings with backslash escapes, `$tag$ … $tag$` dollar quoting (never a
 * `$1` parameter), and `"…"` quoted identifiers. Linear in the text length: it
 * runs on the pooled lane's hot path whenever a text holds a `;` or names
 * `set_config`.
 *
 * NOT understood (ledgered next to each consumer): dynamic SQL — a function
 * that `EXECUTE`s a built string — is a literal here, so the lexer cannot see a
 * SET assembled at run time. A `DO` body is the one literal both consumers
 * read RAW (the shared GUC rules at the end of this file): it is PL/pgSQL the
 * statement executes NOW.
 */

/** How a `"…"` quoted identifier is rendered in the stripped text. */
export type QuotedIdentifierMode =
	/** `""` — nothing of the name survives (keyword rules must not see it). */
	| 'blank'
	/** The name itself, unquoted — for rules about WHAT is named (a GUC). */
	| 'unquote';

const IDENTIFIER_CHAR = /[A-Za-z0-9_$\u0080-￿]/;
const DOLLAR_TAG = /\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/y;

/** One lexed literal/comment: what it becomes, and where the text resumes. `null` = unterminated. */
type Lexeme = { replacement: string; next: number } | null;

/** The index of the quote closing a literal opened before `from` (doubled quotes escape); -1 = none. */
function closingQuote(
	text: string,
	from: number,
	quote: string,
	backslashEscapes: boolean,
): number {
	for (let cursor = from; cursor < text.length; cursor++) {
		const char = text[cursor];
		if (backslashEscapes && char === '\\') {
			cursor++;
		} else if (char === quote) {
			if (text[cursor + 1] !== quote) return cursor;
			cursor++;
		}
	}
	return -1;
}

/** How a block-comment delimiter moves the nesting depth. */
const COMMENT_DEPTH_DELTA: Readonly<Record<string, number>> = { '/*': 1, '*/': -1 };

/** `-- …` to the end of the line, from `index`; undefined when this `-` opens none. */
function lineComment(text: string, index: number): Lexeme | undefined {
	if (text[index + 1] !== '-') return undefined;
	const end = text.indexOf('\n', index);
	return { replacement: ' ', next: end === -1 ? text.length : end + 1 };
}

/** `/* … *\/` from `index` (nestable); undefined when this `/` opens none. */
function blockComment(text: string, index: number): Lexeme | undefined {
	if (text[index + 1] !== '*') return undefined;
	let depth = 0;
	for (let cursor = index; cursor < text.length - 1; cursor++) {
		const delta = COMMENT_DEPTH_DELTA[text.slice(cursor, cursor + 2)];
		if (delta === undefined) continue;
		depth += delta;
		cursor++;
		if (depth === 0) return { replacement: ' ', next: cursor + 1 };
	}
	return null;
}

/** `'…'` from `index`; `E'…'` (an `E` that starts a token) takes backslash escapes. */
function stringLiteral(text: string, index: number): Lexeme {
	const prefix = text[index - 1] ?? '';
	const beforePrefix = text[index - 2] ?? '';
	const backslashEscapes = /[eE]/.test(prefix) && !IDENTIFIER_CHAR.test(beforePrefix);
	const end = closingQuote(text, index + 1, "'", backslashEscapes);
	return end === -1 ? null : { replacement: "''", next: end + 1 };
}

/** `"…"` from `index`, rendered per `mode`. */
function quotedIdentifier(text: string, index: number, mode: QuotedIdentifierMode): Lexeme {
	const end = closingQuote(text, index + 1, '"', false);
	if (end === -1) return null;
	const replacement = mode === 'blank' ? '""' : text.slice(index + 1, end).replaceAll('""', '"');
	return { replacement, next: end + 1 };
}

/** `$tag$ … $tag$` from `index`, or undefined when this `$` opens no dollar quote. */
function dollarQuoted(text: string, index: number): Lexeme | undefined {
	if (IDENTIFIER_CHAR.test(text[index - 1] ?? '')) return undefined;
	DOLLAR_TAG.lastIndex = index;
	const opener = DOLLAR_TAG.exec(text);
	if (opener === null) return undefined;
	const end = text.indexOf(opener[0], index + opener[0].length);
	return end === -1 ? null : { replacement: '$$', next: end + opener[0].length };
}

/** The lexer for each character that can open a literal or comment. */
const OPENERS: Readonly<
	Record<string, (text: string, index: number, mode: QuotedIdentifierMode) => Lexeme | undefined>
> = {
	'-': lineComment,
	'/': blockComment,
	"'": stringLiteral,
	'"': quotedIdentifier,
	$: dollarQuoted,
};

/** The literal/comment starting at `index`; undefined = plain SQL there. */
function lexAt(text: string, index: number, mode: QuotedIdentifierMode): Lexeme | undefined {
	return OPENERS[text[index] ?? '']?.(text, index, mode);
}

/**
 * The text with comments, string literals and dollar-quoted bodies blanked out,
 * and quoted identifiers rendered per `mode` — what remains is only the SQL a
 * keyword rule may inspect. `null` = an unterminated literal or comment.
 */
export function stripSqlLiterals(
	text: string,
	mode: QuotedIdentifierMode = 'blank',
): string | null {
	const parts: string[] = [];
	let copiedFrom = 0;
	let index = 0;
	while (index < text.length) {
		const lexeme = lexAt(text, index, mode);
		if (lexeme === undefined) {
			index++;
			continue;
		}
		if (lexeme === null) return null;
		parts.push(text.slice(copiedFrom, index), lexeme.replacement);
		index = lexeme.next;
		copiedFrom = index;
	}
	parts.push(text.slice(copiedFrom));
	return parts.join('');
}

/**
 * The statements of `text`, split on every `;` OUTSIDE a literal, trimmed, empty
 * ones dropped — each as its STRIPPED body (see stripSqlLiterals). `null` = an
 * unterminated literal or comment.
 */
export function strippedStatements(
	text: string,
	mode: QuotedIdentifierMode = 'blank',
): string[] | null {
	return sqlStatements(text, mode)?.map((statement) => statement.stripped) ?? null;
}

/** One statement of a text: as written, and stripped (see stripSqlLiterals); both trimmed. */
export interface SqlStatement {
	raw: string;
	stripped: string;
}

/** The splitter's cursor: the statements so far, and where the current one began. */
interface SplitState {
	text: string;
	mode: QuotedIdentifierMode;
	statements: SqlStatement[];
	parts: string[];
	copiedFrom: number;
	rawFrom: number;
}

/** Close the statement ending at `end` (a `;` outside a literal, or the end of the text). */
function closeStatement(state: SplitState, end: number): void {
	state.parts.push(state.text.slice(state.copiedFrom, end));
	const stripped = state.parts.join('').trim();
	if (stripped !== '') {
		state.statements.push({ raw: state.text.slice(state.rawFrom, end).trim(), stripped });
	}
	state.parts = [];
	state.copiedFrom = end + 1;
	state.rawFrom = end + 1;
}

/** Consume what starts at `index`; the next index, or null for an unterminated literal. */
function splitStep(state: SplitState, index: number): number | null {
	if (state.text[index] === ';') {
		closeStatement(state, index);
		return index + 1;
	}
	const lexeme = lexAt(state.text, index, state.mode);
	if (lexeme === undefined) return index + 1;
	if (lexeme === null) return null;
	state.parts.push(state.text.slice(state.copiedFrom, index), lexeme.replacement);
	state.copiedFrom = lexeme.next;
	return lexeme.next;
}

/**
 * The statements of `text`, split on every `;` OUTSIDE a literal, each as
 * written (`raw` — a rule that must read a `DO` body needs it) and stripped
 * (`stripped` — see stripSqlLiterals); empty ones dropped. `null` = an
 * unterminated literal or comment.
 */
export function sqlStatements(
	text: string,
	mode: QuotedIdentifierMode = 'blank',
): SqlStatement[] | null {
	const state: SplitState = { text, mode, statements: [], parts: [], copiedFrom: 0, rawFrom: 0 };
	for (let index = 0; index < text.length; ) {
		const next = splitStep(state, index);
		if (next === null) return null;
		index = next;
	}
	closeStatement(state, text.length);
	return state.statements;
}

/**
 * The text without its LEADING whitespace and comments (`-- …` lines and
 * NESTED `/* … *\/` blocks — PostgreSQL's rules, the same lexemes as
 * stripSqlLiterals), which never change what a statement is. An unterminated
 * leading comment is returned from its opener (Postgres refuses the text, and no
 * statement-leading rule matches it).
 */
export function stripLeadingSqlComments(text: string): string {
	let index = skipWhitespace(text, 0);
	for (let comment = leadingComment(text, index); comment; comment = leadingComment(text, index)) {
		index = skipWhitespace(text, comment.next);
	}
	return text.slice(index);
}

/** The comment lexers a statement may START with. */
const LEADING_COMMENT_OPENERS: Readonly<
	Record<string, (text: string, index: number) => Lexeme | undefined>
> = { '-': lineComment, '/': blockComment };

/** The (terminated) comment at `index`, or undefined — an unterminated one reads as none. */
function leadingComment(text: string, index: number): Lexeme | undefined {
	return LEADING_COMMENT_OPENERS[text[index] ?? '']?.(text, index) ?? undefined;
}

/** The first non-whitespace index at or after `from` (the text length when none). */
function skipWhitespace(text: string, from: number): number {
	return from + text.slice(from).search(/\S|$/);
}

// ---------------------------------------------------------------------------
// THE SHARED GUC RULES — read by db/postgres.ts (the pooled and transaction
// lanes' session-state refusal) and update/catalog.ts (the data-update
// descriptor validator). Linked, never copied: the two doors once disagreed on
// DO bodies (the validator read them raw; the pool saw only `DO $$`).
// ---------------------------------------------------------------------------

/** A `DO` statement (stripped): its body is PL/pgSQL executed NOW — a literal to the lexer. */
export const DO_BLOCK = /^DO\b/i;

/**
 * A session SET/RESET/DISCARD inside a DO body, read on the RAW statement:
 * statement-leading (after `;`, the body's opening `$…$`, BEGIN/THEN/ELSE/LOOP)
 * or the first word of a string handed to EXECUTE (`EXECUTE 'SET …'`,
 * `EXECUTE format('RESET …')`). `UPDATE t SET …` / `ALTER … SET DEFAULT` never
 * match: an identifier or keyword other than these precedes their SET.
 */
export const BODY_SESSION_STATE =
	/(?:^|[;'$(]|\b(?:BEGIN|THEN|ELSE|LOOP|EXECUTE)\b)\s*(?:SET(?!\s+(?:LOCAL|TRANSACTION|CONSTRAINTS)\b)|RESET|DISCARD)\b/i;

/** A `set_config(` call as written (a quoted `"set_config"(` included). */
const RAW_SET_CONFIG_CALL = /\bset_config"?\s*\(/gi;
/** A `set_config(` call in STRIPPED text (quoted identifiers unquoted). */
const SET_CONFIG_CALL = /\bset_config\s*\(/gi;
/** How a parenthesis moves the argument depth. */
const PAREN_DEPTH: Readonly<Record<string, number>> = { '(': 1, ')': -1 };

/** How a character moves the argument depth; a top-level `,` separates arguments. */
function argumentDepthDelta(char: string, depth: number): number | 'separator' {
	return char === ',' && depth === 0 ? 'separator' : (PAREN_DEPTH[char] ?? 0);
}

/** The top-level arguments of the call whose `(` ends before `from`; [] when unbalanced. */
function callArguments(text: string, from: number): string[] {
	const argumentsList: string[] = [];
	let depth = 0;
	let start = from;
	for (let index = from; index < text.length; index++) {
		const delta = argumentDepthDelta(text[index] ?? '', depth);
		if (delta === 'separator') {
			argumentsList.push(text.slice(start, index));
			start = index + 1;
			continue;
		}
		depth += delta;
		if (depth < 0) return [...argumentsList, text.slice(start, index)];
	}
	return [];
}

/**
 * The `set_config(…)` calls of a STRIPPED text (literals blanked, quoted names
 * unquoted — stripSqlLiterals 'unquote'): how many, and how many are NOT
 * provably transaction-local. Only a literal `true` third argument is local; a
 * `false`, an expression (`lower('0')`, `1=0`), a bound `$3`, a quoted `'true'`
 * or an unbalanced call is session-scoped until proven otherwise.
 */
export function setConfigCalls(stripped: string): { total: number; sessionScoped: number } {
	let total = 0;
	let sessionScoped = 0;
	for (const match of stripped.matchAll(SET_CONFIG_CALL)) {
		total++;
		const isLocal = callArguments(stripped, match.index + match[0].length)[2]?.trim();
		if (!/^true$/i.test(isLocal ?? '')) sessionScoped++;
	}
	return { total, sessionScoped };
}

/** The contents of every string / dollar-quoted literal of a statement (a DO's body among them). */
export function statementLiterals(raw: string): string[] {
	const literals: string[] = [];
	for (let index = 0; index < raw.length; index++) {
		const lexeme = lexAt(raw, index, 'blank');
		if (lexeme === undefined) continue;
		if (lexeme === null) return [raw];
		const content = literalContent(raw, index, lexeme.next);
		if (content !== null) literals.push(content);
		index = lexeme.next - 1;
	}
	return literals;
}

/** A string or dollar-quoted literal's content (`from` = its opener); null for a comment/identifier. */
function literalContent(raw: string, from: number, next: number): string | null {
	if (raw[from] === "'") return raw.slice(from + 1, next - 1).replaceAll("''", "'");
	if (raw[from] !== '$') return null;
	DOLLAR_TAG.lastIndex = from;
	const tagLength = DOLLAR_TAG.exec(raw)?.[0].length ?? 0;
	return raw.slice(from + tagLength, next - tagLength);
}

/**
 * Whether a DO statement's body (read RAW, `raw` = the statement as written)
 * holds session state: a session SET/RESET/DISCARD (BODY_SESSION_STATE), or a
 * `set_config` that is not provably transaction-local — one whose third argument
 * is not a literal `true`, or one the body hides in a string of its own
 * (`EXECUTE 'SELECT set_config(…)'`: counted raw, invisible stripped).
 */
export function doBodyHoldsSessionState(raw: string): boolean {
	if (BODY_SESSION_STATE.test(raw)) return true;
	return statementLiterals(raw).some(bodyHoldsSessionSetConfig);
}

/** One DO body: a set_config not provably local, visible or hidden in a nested literal. */
function bodyHoldsSessionSetConfig(body: string): boolean {
	const written = body.match(RAW_SET_CONFIG_CALL)?.length ?? 0;
	if (written === 0) return false;
	const calls = setConfigCalls(stripSqlLiterals(body, 'unquote') ?? '');
	return calls.sessionScoped > 0 || written > calls.total;
}

// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
 * MARKDOWN_UTILS
 * Bidirectional HTML ↔ Markdown conversion for the tool_lang browser translation pipeline.
 *
 * The LLM (browser-local Gemma model or remote API) operates on plain Markdown rather than
 * raw HTML because HTML tags confuse seq2seq models and inflate token counts. This module
 * bridges the gap:
 *
 *   HTML → html_to_markdown → [LLM translates] → markdown_to_html → HTML
 *
 * Dédalo inline tags (index, tc, svg, geo, …) are replaced with [[[n]]] triple-bracket
 * placeholders BEFORE calling html_to_markdown, so the LLM never sees or corrupts them.
 * The caller (browser_translation.js) is responsible for that substitution and for
 * restoring the originals after markdown_to_html.
 *
 * NOTE this does not mean the model sees no HTML at all. Tags with no Markdown equivalent
 * (<span>, <sub>, <sup>, <mark>, <del>, <s>, <ins>, and anything unrecognised) are emitted
 * as raw outerHTML by html_to_markdown rather than being dropped, so they do reach the
 * model and it can corrupt them. Protecting them with placeholders too would spend the
 * placeholder budget on presentation instead of on the marks that carry data, which is a
 * worse trade — <strong>/<em>/<i>/<u>, which DO have Markdown equivalents, are handled
 * natively for exactly that reason.
 *
 * Exports:
 *   html_to_markdown            — DOM-parser walk: HTML string → Markdown string
 *   markdown_to_html            — regex pass: Markdown string → HTML string
 *   split_markdown_by_paragraph — split Markdown on \n\n+ boundaries → string[]
 *   segment_markdown            — split into {text, sep} segments the model can translate
 *                                 one at a time, WITHOUT losing what separated them
 */



/**
 * HTML_TO_MARKDOWN
 * Convert an HTML string to Markdown suitable for LLM translation.
 *
 * Parses the HTML with DOMParser and walks the resulting DOM tree, converting
 * each element to its closest Markdown equivalent. The conversion is lossy by
 * design: only semantics the LLM needs to preserve (structure, emphasis, links)
 * are encoded; presentation-only attributes (class, style, id) are discarded.
 *
 * Supported conversions:
 *   Block:  <p> → \n\n  |  <br> → \n  |  <h1>–<h6> → #…######
 *           <ul>/<ol>/<li> → -/1.  |  <blockquote> → >  |  <hr> → ---
 *           <div> → recurse + \n\n  |  <table> → GFM pipe table | … |
 *           <pre> → fenced ``` code block
 *   Inline: <strong>/<b> → **  |  <em>/<i> → *  |  <u> → __
 *           <a href> → [text](url)  |  <code> → `code`  |  <img alt src> → ![alt](src)
 *   Pass-through (raw outerHTML): <span>, <sub>, <sup>, <small>, <mark>, <del>, <s>, <ins>
 *   Unknown tags: raw outerHTML verbatim.
 *
 * Text-node escaping: markdown metacharacters (*, _, `, \) are
 * backslash-escaped so literal text characters survive the HTML→MD→HTML round-trip.
 * [[[n]]] placeholder tokens are protected from escaping so their brackets survive.
 *
 * Empty paragraph special case: whitespace-only <p> emits &nbsp; so that the
 * paragraph is not collapsed by markdown_to_html's block splitter (which trims
 * and skips empty blocks). This is necessary for CKEditor content that uses
 * <p>&nbsp;</p> as explicit blank-line separators.
 *
 * Table with colspan/rowspan: falls back to raw outerHTML — Markdown pipe tables
 * cannot represent merged cells without losing structure.
 *
 * @param {string} html - HTML string with Dédalo tags already replaced by [[[n]]] placeholders.
 * @returns {string} Markdown string with trailing whitespace trimmed and runs of 3+ newlines
 *   collapsed to 2 (a single paragraph boundary).
 */
export function html_to_markdown(html) {

	const parser	= new DOMParser();
	const doc		= parser.parseFromString(html, 'text/html');
	const result	= [];

	// Regex to detect [[[n]]] placeholder strings
	const placeholder_re = /^\[\[\[\d+\]\]\]$/;

	/**
	 * ESCAPE_MD (inner)
	 * Backslash-escape Markdown metacharacters in a plain text string so they
	 * are treated as literal characters by markdown_to_html.
	 *
	 * [[[n]]] placeholders pass through unchanged because [ and ] are not escaped.
	 *
	 * @param {string} text - Raw text-node content.
	 * @returns {string} Escaped text with [[[n]]] tokens preserved verbatim.
	 */
	function escape_md(text) {
		if (!text) return '';
		// Do NOT escape [ and ] — they are used in [[[n]]] placeholders and
		// escaping them causes the model to reproduce the backslashes.
		// The model doesn't need perfect Markdown; it needs to preserve placeholders.
		return text
			.replace(/\\/g, '\\\\')
			.replace(/\*/g, '\\*')
			.replace(/_/g, '\\_')
			.replace(/`/g, '\\`');
	}

	/**
	 * WALK (inner)
	 * Recursively convert a single DOM node to its Markdown representation.
	 *
	 * Handles two node types:
	 *   nodeType === 3 (Text) — escaped via escape_md().
	 *   nodeType === 1 (Element) — dispatched through the tag switch; all other
	 *     nodeType values (Comment, CDATA, …) are silently ignored (return '').
	 *
	 * The switch covers every tag documented in html_to_markdown. Inline elements
	 * that have no standard Markdown equivalent (span, sub, sup, mark, del, s,
	 * ins, small) fall through to raw outerHTML so their content is not lost.
	 * Unknown tags also emit outerHTML to avoid silent data loss.
	 *
	 * @param {Node} node - Any DOM node from the parsed document body.
	 * @returns {string} Markdown fragment for this node and all its descendants.
	 */
	function walk(node) {

		if (node.nodeType === 3) {
			// Text node
			const text = node.textContent;
			if (!text) return '';
			return escape_md(text);
		}

		if (node.nodeType !== 1) return '';

		const tag = node.tagName.toLowerCase();

		// --- Block-level elements ---
		switch (tag) {

			case 'p': {
				const inner = walk_children(node);
				// Whitespace-only <p> (e.g. <p>&nbsp;</p>) must emit
				// &nbsp; so the paragraph survives the round-trip
				// (markdown_to_html trims blocks and skips empty ones;
				// \u00A0 is also trimmed by ES2015+ String.trim())
				const content = inner.trim() ? inner : '&nbsp;';
				return content + '\n\n';
			}

			case 'br':
				// A single \n, NOT \n\n.
				//
				// \n\n is a *paragraph* boundary, and segment_markdown treats it as the
				// strongest cut point. Emitting it here cut any inline element containing a <br>
				// clean in half and sent the halves to the model as separate chunks:
				//
				//   <p><strong>Line one<br>Line two</strong></p>
				//     → "**Line one\n\nLine two**"  → ["**Line one", "Line two**"]
				//
				// The model was not losing the closing tag — it was never given one.
				// A <br> is a line break inside a paragraph, and markdown_to_html already
				// turns a single \n within a block back into <br>.
				return '\n';

			case 'h1': case 'h2': case 'h3':
			case 'h4': case 'h5': case 'h6': {
				const level = parseInt(tag[1]);
				const inner = walk_children(node);
				return '#'.repeat(level) + ' ' + inner + '\n\n';
			}

			case 'ul': {
				const items = [];
				for (const child of node.children) {
					if (child.tagName.toLowerCase() === 'li') {
						items.push('- ' + walk_children(child));
					}
				}
				return items.join('\n') + '\n\n';
			}

			case 'ol': {
				const items = [];
				let n = 1;
				for (const child of node.children) {
					if (child.tagName.toLowerCase() === 'li') {
						items.push(n + '. ' + walk_children(child));
						n++;
					}
				}
				return items.join('\n') + '\n\n';
			}

			case 'blockquote': {
				const inner = walk_children(node);
				return inner.split('\n').map(l => '> ' + l).join('\n') + '\n\n';
			}

			case 'hr':
				return '---\n\n';

			case 'div': {
				const inner = walk_children(node);
				return inner + '\n\n';
			}

			case 'table': {
				return convert_table(node) + '\n\n';
			}

			// --- Inline elements ---
			case 'strong': case 'b': {
				const inner = walk_children(node);
				if (!inner.trim()) return inner;
				return '**' + inner + '**';
			}

			case 'em': case 'i': {
				const inner = walk_children(node);
				if (!inner.trim()) return inner;
				return '*' + inner + '*';
			}

			case 'u': {
				const inner = walk_children(node);
				if (!inner.trim()) return inner;
				return '__' + inner + '__';
			}

			case 'a': {
				const href	= node.getAttribute('href') || '';
				const inner	= walk_children(node);
				return '[' + inner + '](' + href + ')';
			}

			case 'code': {
				const inner = walk_children(node);
				return '`' + inner + '`';
			}

			case 'pre': {
				const inner = walk_children(node);
				return '```\n' + inner + '\n```\n\n';
			}

			case 'img': {
				const alt	= node.getAttribute('alt') || '';
				const src	= node.getAttribute('src') || '';
				if (alt || src) {
					return '![' + alt + '](' + src + ')';
				}
				return node.outerHTML;
			}

			case 'span': case 'sub': case 'sup': case 'small':
			case 'mark': case 'del': case 's': case 'ins': {
				// No standard markdown equivalent → keep raw HTML
				return node.outerHTML;
			}

			default: {
				// Unknown tag → raw outerHTML
				return node.outerHTML;
			}
		}
	}

	/**
	 * WALK_CHILDREN (inner)
	 * Walk all child nodes of a given DOM element and concatenate their Markdown output.
	 * Delegates each child to walk(); the results are joined without any separator
	 * so block-level children emit their own trailing \n\n as needed.
	 *
	 * @param {Node} node - Parent DOM element whose children are to be walked.
	 * @returns {string} Concatenated Markdown of all child nodes.
	 */
	function walk_children(node) {
		return Array.from(node.childNodes).map(walk).join('');
	}

	/**
	 * CONVERT_TABLE (inner)
	 * Convert a <table> DOM element to a GitHub-Flavored Markdown (GFM) pipe table.
	 *
	 * Strategy:
	 *   1. Bail to raw outerHTML if any cell carries colspan/rowspan — GFM tables
	 *      cannot represent merged cells without losing data.
	 *   2. Query all <tr> rows and collect their <th>/<td> cell texts; cell content
	 *      is processed via walk_children() (inline HTML inside cells is converted).
	 *   3. Collapse newlines and runs of whitespace inside each cell to a single space
	 *      (Markdown table syntax requires all content on one line).
	 *   4. Pad short rows to the widest row so the output is a valid rectangular table.
	 *   5. Emit: header row → separator row (all `---`) → data rows.
	 *      The first <tr> is always treated as the header regardless of whether its
	 *      cells use <th> or <td>.
	 *
	 * The output does NOT include a trailing \n\n — the caller (the 'table' case in
	 * walk()) appends that.
	 *
	 * @param {Element} table - A <table> DOM element from the parsed document.
	 * @returns {string} GFM pipe-table string, or the element's outerHTML for complex tables.
	 */
	function convert_table(table) {

		// Check for colspan/rowspan — fall back to raw HTML
		const complex_cells = table.querySelectorAll('td[colspan], td[rowspan], th[colspan], th[rowspan]');
		if (complex_cells.length > 0) {
			return table.outerHTML;
		}

		const rows = table.querySelectorAll('tr');
		if (rows.length === 0) return table.outerHTML;

		const md_rows = [];

		for (const row of rows) {
			const cells = row.querySelectorAll('th, td');
			const cell_texts = [];
			for (const cell of cells) {
				// Process cell contents recursively (inline HTML inside cells)
				let cell_md = walk_children(cell).trim();
				// Collapse whitespace inside cells
				cell_md = cell_md.replace(/\n/g, ' ').replace(/\s+/g, ' ');
				cell_texts.push(cell_md);
			}
			md_rows.push(cell_texts);
		}

		if (md_rows.length === 0) return table.outerHTML;

		// Determine column count
		const col_count = Math.max(...md_rows.map(r => r.length));

		// Pad rows to uniform width
		for (const row of md_rows) {
			while (row.length < col_count) row.push('');
		}

		// Build markdown table
		const lines = [];

		// Header row (first row)
		lines.push('| ' + md_rows[0].join(' | ') + ' |');

		// Separator
		lines.push('| ' + md_rows[0].map(() => '---').join(' | ') + ' |');

		// Data rows
		for (let i = 1; i < md_rows.length; i++) {
			lines.push('| ' + md_rows[i].join(' | ') + ' |');
		}

		return lines.join('\n');
	}

	// Walk all body children
	for (const node of doc.body.childNodes) {
		result.push(walk(node));
	}

	let md = result.join('').trim();

	// Collapse 3+ consecutive newlines down to 2 (paragraph boundary)
	md = md.replace(/\n{3,}/g, '\n\n');

	return md;
}


/**
 * Inline formatting tags that must never be left unclosed, and must never cross a
 * block boundary. These are the ones the model emits from its training distribution
 * even when it was handed Markdown.
 */
const INLINE_FORMAT_TAGS = new Set([
	'strong', 'b', 'em', 'i', 'u', 'span', 'sub', 'sup',
	'small', 'mark', 'del', 's', 'ins', 'code', 'a'
]);

/**
 * Block-level tags. An inline span may not cross one of these, so they act as
 * flush points for the balancer.
 *
 * <br> is deliberately absent: it is a line break *inside* a paragraph, and emphasis
 * spanning one ('<strong>Line one<br>Line two</strong>') is valid HTML and exactly what
 * CKEditor produces. Treating it as a boundary would close the span at the break.
 */
const BLOCK_LEVEL_TAGS = new Set([
	'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
	'blockquote', 'pre', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr'
]);


/**
 * BALANCE_INLINE_HTML
 * Guarantee that the inline markup in an HTML fragment is well-formed: every opener
 * closed, no orphan closers, and no span crossing a block boundary.
 *
 * This is what stops a single lost </strong> from corrupting the rest of the record.
 * Left alone, '<p><strong>Title</p><p>Next</p>' is not merely ugly — when a browser
 * parses it, the HTML5 adoption-agency algorithm keeps <strong> in the list of active
 * formatting elements past the </p> and *reconstructs* it inside every following <p>.
 * The bold cascades to the end of the document.
 *
 * Which is also why a whole-document DOM round-trip is the wrong tool here: the parser
 * would bake that cascade in rather than fix it. The damage has to be contained
 * textually, at the block boundary, before any parser sees it.
 *
 * Three rules:
 *   - an opener still open at a block boundary (or at the end) is closed there
 *   - a closer with no matching opener is dropped
 *   - block-level and void tags are left exactly as they are
 *
 * Misnesting (<strong><em>x</strong></em>) is deliberately NOT corrected — it is
 * well-formed enough for every browser, and rewriting it risks changing the text.
 *
 * @param {string} html - HTML fragment, possibly with unbalanced inline tags.
 * @returns {string} The same fragment with its inline markup balanced.
 */
function balance_inline_html(html) {

	if (!html || html.indexOf('<')===-1) return html;

	const open_stack = [];
	const re         = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;

	// close everything still open, innermost first
	const flush = function() {
		let closers = '';
		while (open_stack.length > 0) {
			closers += '</' + open_stack.pop() + '>';
		}
		return closers;
	};

	let out  = '';
	let last = 0;
	let match;

	while ((match = re.exec(html))!==null) {

		const is_close     = match[1]==='/';
		const tag          = match[2].toLowerCase();
		const self_closing = match[3]==='/';

		// a block boundary ends any inline span still open
		if (BLOCK_LEVEL_TAGS.has(tag)) {
			if (open_stack.length > 0) {
				out += html.slice(last, match.index) + flush();
				last = match.index;
			}
			continue;
		}

		if (!INLINE_FORMAT_TAGS.has(tag) || self_closing) {
			continue;
		}

		if (!is_close) {
			open_stack.push(tag);
			continue;
		}

		const position = open_stack.lastIndexOf(tag);
		if (position===-1) {
			// closer with nothing to close — cut it out
			out += html.slice(last, match.index);
			last = match.index + match[0].length;
		} else {
			open_stack.splice(position, 1);
		}
	}

	out += html.slice(last) + flush();

	return out;
}


/**
 * MARKDOWN_TO_HTML
 * Convert a Markdown string back to HTML after LLM translation.
 *
 * This is the inverse of html_to_markdown and is applied to the LLM's output
 * before restoring the [[[n]]] Dédalo-tag placeholders. It implements a subset of
 * CommonMark + GFM sufficient for CKEditor-compatible output.
 *
 * Algorithm (two-pass):
 *   1. Split the input on \n\n+ boundaries into "blocks". Each block is classified
 *      by its leading characters:
 *        ``` ... ```  → <pre><code> (escape_html applied to the code body)
 *        ---/--- or ***or ___ → <hr>
 *        # … ######   → <h1>…<h6>
 *        - / * / + lines (all) → <ul><li>…</li></ul>
 *        1. 2. … lines (all) → <ol><li>…</li></ol>
 *        > lines (all) → <blockquote>…</blockquote>
 *        | … | … with | --- | separator → <table> via convert_md_table
 *        Starts with < and ends with > → raw HTML passthrough (un-converted spans, etc.)
 *        Everything else → <p> (single \n within a block becomes <br>)
 *   2. Each block's text content is processed by process_inline() to convert
 *      bold, italic, underline, code, and link syntax.
 *
 * Classification is done in priority order so that (for example) a block
 * starting with `---` is treated as <hr> before falling through to paragraph.
 * The regex /^\|[\s\-:|]+\|$/ detects the GFM separator row for tables.
 *
 * Produces bare HTML matching CKEditor output format — no class/style attributes
 * beyond the optional `class="lang-X"` on fenced-code blocks.
 *
 * @param {string} md - Markdown string produced by the LLM.
 * @returns {string} HTML string suitable for saving as a CKEditor component value.
 *   Returns '' for falsy input.
 */
export function markdown_to_html(md) {

	if (!md) return '';

	// Normalize trailing whitespace
	md = md.trim();

	// --- Step 1: Split into blocks by \n\n+ ---
	const raw_blocks = md.split(/\n{2,}/);

	// --- Step 2: Classify and convert each block ---
	const html_blocks = [];

	for (let block of raw_blocks) {

		block = block.trim();
		if (!block) continue;

		// Strip <p></p> wrapper if the model added one (we handle paragraph wrapping).
		// The Markdown pipeline sends Markdown to the model, but the model may still
		// emit HTML <p> tags from its training distribution. Without stripping, these
		// would nest inside our own <p> tags (e.g. <p><p>text</p></p>).
		block = block.replace(/^<p>\s*/, '').replace(/\s*<\/p>$/, '');

		// Fenced code block
		const code_match = block.match(/^```([a-zA-Z0-9_-]*)\n([\s\S]*?)```$/);
		if (code_match) {
			const lang	= code_match[1];
			const code	= code_match[2];
			html_blocks.push('<pre><code' + (lang ? ' class="lang-' + lang + '"' : '') + '>' + escape_html(code) + '</code></pre>');
			continue;
		}

		// Horizontal rule
		if (/^(-{3,}|\*{3,}|_{3,})$/.test(block)) {
			html_blocks.push('<hr>');
			continue;
		}

		// Heading
		const heading_match = block.match(/^(#{1,6})\s+(.+)$/);
		if (heading_match) {
			const level	= heading_match[1].length;
			const inner	= process_inline(heading_match[2]);
			html_blocks.push('<h' + level + '>' + inner + '</h' + level + '>');
			continue;
		}

		// Unordered list
		const ul_lines = block.split('\n');
		if (ul_lines.length > 0 && ul_lines.every(l => /^\s*[-*+]\s+/.test(l))) {
			const items = ul_lines.map(l => '<li>' + process_inline(l.replace(/^\s*[-*+]\s+/, '')) + '</li>');
			html_blocks.push('<ul>' + items.join('') + '</ul>');
			continue;
		}

		// Ordered list
		const ol_lines = block.split('\n');
		if (ol_lines.length > 0 && ol_lines.every(l => /^\s*\d+\.\s+/.test(l))) {
			const items = ol_lines.map(l => '<li>' + process_inline(l.replace(/^\s*\d+\.\s+/, '')) + '</li>');
			html_blocks.push('<ol>' + items.join('') + '</ol>');
			continue;
		}

		// Blockquote
		const bq_lines = block.split('\n');
		if (bq_lines.length > 0 && bq_lines.every(l => /^>\s?/.test(l))) {
			const inner = bq_lines.map(l => l.replace(/^>\s?/, '')).join('<br>');
			html_blocks.push('<blockquote>' + process_inline(inner) + '</blockquote>');
			continue;
		}

		// Markdown table
		const table_lines = block.split('\n');
		if (table_lines.length >= 2 && table_lines[0].startsWith('|') && /^\|[\s\-:|]+\|$/.test(table_lines[1])) {
			html_blocks.push(convert_md_table(table_lines));
			continue;
		}

		// Raw HTML passthrough (starts with < and ends with >).
		// This is model-authored HTML, so it is balanced before being emitted — see
		// balance_inline_html. Left unbalanced, one unclosed <strong> here bleeds bold
		// into every following paragraph.
		if (/^<[^>]+>/.test(block) && />$/.test(block)) {
			html_blocks.push(balance_inline_html(block));
			continue;
		}

		// Default: paragraph — single \n inside becomes <br>.
		//
		// The join happens BEFORE process_inline, not after. Run per line, the inline
		// regexes (which exclude newlines) can never match emphasis that spans a line
		// break, so '**Line one\nLine two**' came out as literal '<p>**Line one<br>Line two**</p>'.
		// Joining first means the bold rule sees 'Line one<br>Line two' and matches.
		// The blockquote branch above already does it in this order.
		const para_html = process_inline(block.split('\n').join('<br>'));
		html_blocks.push('<p>' + balance_inline_html(para_html) + '</p>');
	}

	const result = html_blocks.join('');
	return result;
}


/**
 * PROCESS_INLINE
 * Apply inline Markdown syntax transformations to a text string, converting
 * Markdown tokens to HTML inline elements.
 *
 * Processing order is significant — earlier rules protect content from later rules:
 *   1. Unescape backslash-escaped Markdown metacharacters (inserted by escape_md).
 *   2. Inline code `…` — processed first so ** or * inside backticks is not treated
 *      as bold/italic markup.
 *   3. Bold+italic ***…*** — must precede bold and italic individually so the three-star
 *      sequence is consumed in full rather than as nested ** + *.
 *   4. Bold **…**
 *   5. Italic *…* — negative lookbehind/lookahead avoids matching inside <strong>.
 *   6. Underline __…__ (Dédalo extension; not standard CommonMark).
 *   7. Links [text](url)
 *
 * Does NOT handle block-level elements; call from within each block's text content
 * after block classification in markdown_to_html.
 *
 * @param {string} text - Single-line or inline Markdown text segment.
 * @returns {string} HTML string with inline elements applied. Returns '' for falsy input.
 */
function process_inline(text) {

	if (!text) return '';

	// 1. Unescape markdown metacharacters FIRST
	text = text
		.replace(/\\([\\\*\_\[\]\`])/g, '$1');

	// 2. Inline code (before bold/italic so ** inside ` is not processed)
	text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');

	// 3. Bold+italic ***text*** (must come before bold and italic individually)
	text = text.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');

	// 3b. Emphasis sitting at the EDGE of a bold run collapses into an ambiguous *** run
	//     that neither the bold nor the italic rule can read:
	//       <strong>bold <em>both</em></strong>  →  '**bold *both***'
	//     Resolve those two shapes explicitly, before the general bold rule below can
	//     mis-split the delimiter run and drop the emphasis.
	text = text.replace(/\*\*([^*\n]*)\*([^*\n]+)\*\*\*/g, '<strong>$1<em>$2</em></strong>');
	text = text.replace(/\*\*\*([^*\n]+)\*([^*\n]*)\*\*/g, '<strong><em>$1</em>$2</strong>');

	// 4. Bold **text**
	//    The inner run may contain a lone '*' — an italic nested in the MIDDLE of the bold
	//    run ('**a *b* c**') — which rule 5 then converts. A '*' followed by another '*'
	//    is the closing delimiter and ends the run.
	text = text.replace(/\*\*((?:[^*\n]|\*(?!\*))+)\*\*/g, '<strong>$1</strong>');

	// 5. Italic *text* (avoid matching inside <strong>)
	text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

	// 6. Underline __text__
	text = text.replace(/__([^_\n]+)__/g, '<u>$1</u>');

	// 7. Links [text](url)
	// The inner class excludes brackets so that a [[[n]]] placeholder followed by an
	// opening parenthesis — '…[[[5]]] (see below)' — is not mistaken for link syntax
	// and swallowed into an <a>.
	text = text.replace(/\[([^[\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

	// 8. Drop orphan emphasis delimiters.
	// Every *paired* ** and __ was consumed above, so anything still here is a delimiter
	// whose partner the model dropped. Left in, it reaches the record as literal
	// asterisks in the middle of a sentence.
	text = text.replace(/\*\*/g, '').replace(/__/g, '');

	return text;
}


/**
 * CONVERT_MD_TABLE
 * Convert an array of GFM pipe-table lines to an HTML <table> string.
 *
 * Line layout expected:
 *   lines[0]  — header row:  | H1 | H2 | H3 |
 *   lines[1]  — separator:   | -- | -- | -- |  (ignored; just signals "this is a table")
 *   lines[2+] — data rows:   | D1 | D2 | D3 |
 *
 * Each cell's text is processed through process_inline() so bold/italic/link
 * syntax inside table cells is converted correctly.
 *
 * Output format: <table><thead><tr><th>…</th></tr></thead><tbody><tr><td>…</td></tr></tbody></table>
 * <tbody> is omitted when there are no data rows (header-only table).
 *
 * @param {string[]} lines - Array of raw Markdown pipe-table lines (including the separator).
 * @returns {string} HTML table string, or the raw lines joined by '\n' if fewer than 2 lines.
 */
function convert_md_table(lines) {

	if (lines.length < 2) return lines.join('\n');

	// Parse header
	const header_cells = parse_md_row(lines[0]);

	// Skip separator line (lines[1])
	const data_lines = lines.slice(2);

	let html = '<table><thead><tr>';
	for (const cell of header_cells) {
		html += '<th>' + process_inline(cell) + '</th>';
	}
	html += '</tr></thead>';

	if (data_lines.length > 0) {
		html += '<tbody>';
		for (const line of data_lines) {
			const cells = parse_md_row(line);
			html += '<tr>';
			for (const cell of cells) {
				html += '<td>' + process_inline(cell) + '</td>';
			}
			html += '</tr>';
		}
		html += '</tbody>';
	}

	html += '</table>';
	return html;
}


/**
 * PARSE_MD_ROW
 * Split a single GFM pipe-table row into trimmed cell strings.
 *
 * Strips the leading and trailing `|` characters, then splits on the remaining
 * `|` separators and trims whitespace from each cell. Empty leading/trailing
 * cells (from `| … |` delimiters) are removed.
 *
 * Example:
 *   "| cell1 | cell2 | cell3 |" → ["cell1", "cell2", "cell3"]
 *
 * @param {string} line - A single Markdown table row line.
 * @returns {string[]} Array of cell content strings (not yet HTML-processed).
 */
function parse_md_row(line) {
	return line
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map(cell => cell.trim());
}


/**
 * ESCAPE_HTML
 * Escape HTML special characters so that a string is safe to embed as text
 * content inside an HTML element.
 *
 * Used exclusively within markdown_to_html for fenced code block bodies
 * (<pre><code>…</code></pre>) where the raw code must not be interpreted as HTML.
 * The order of replacements matters: & must be escaped first to avoid double-escaping.
 *
 * Replaces: & → &amp;  |  < → &lt;  |  > → &gt;  |  " → &quot;
 *
 * @param {string} text - Raw text that may contain HTML special characters.
 * @returns {string} HTML-safe string.
 */
function escape_html(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}


/**
 * Paired Markdown emphasis delimiters, longest first so '**' is recognised before '*'.
 */
const MD_DELIMITERS = ['**', '__', '*'];


/**
 * DELIMITER_POSITIONS
 * Every emphasis delimiter in a string, in order, longest-first so '**' is never read as
 * two '*'. Backslash-escaped characters are skipped: html_to_markdown writes a literal
 * asterisk as '\*', and counting those would corrupt the tally.
 *
 * @param {string} text
 * @returns {Array<{delim:string, index:number}>}
 */
function delimiter_positions(text) {

	const found = [];
	if (!text) return found;

	for (let i = 0; i < text.length; i++) {

		if (text[i]==='\\') {
			i++;
			continue;
		}

		const delim = MD_DELIMITERS.find(item => text.startsWith(item, i));
		if (!delim) continue;

		found.push({ delim : delim, index : i });
		i += delim.length - 1;
	}

	return found;
}


/**
 * CONFORM_EMPHASIS
 * Forbid the model from inventing emphasis the source never had.
 *
 * Translating text does not create formatting. But a small model, told to "keep the
 * Markdown formatting (**bold**, *italic*, __underline__)", cheerfully copies the examples
 * from the instruction into its answer — a source containing nothing but <i> came back
 * littered with <strong> and <u>, whole sentences bolded at random.
 *
 * The prompt no longer shows those examples, but a prompt is a request, not a guarantee.
 * This is the guarantee: the translation may not use more of a delimiter than the source
 * chunk did. Excess delimiters are deleted (text is never touched — only the markers), and
 * the surviving count is floored to an even number, since delimiters come in pairs.
 *
 * @param {string} source_text - The chunk as it was sent to the model.
 * @param {string} output_text - The model's translation of it.
 * @returns {string} The translation with any invented emphasis markers removed.
 */
export function conform_emphasis(source_text, output_text) {

	if (!output_text) return output_text;

	const allowed = {};
	for (const item of delimiter_positions(source_text)) {
		allowed[item.delim] = (allowed[item.delim] || 0) + 1;
	}

	const positions = delimiter_positions(output_text);

	const totals = {};
	for (const item of positions) {
		totals[item.delim] = (totals[item.delim] || 0) + 1;
	}

	// how many of each we are willing to keep — capped at the source, and even
	const keep = {};
	for (const delim of MD_DELIMITERS) {
		let count = Math.min(totals[delim] || 0, allowed[delim] || 0);
		count -= count % 2;
		keep[delim] = count;
	}

	const seen    = {};
	const discard = new Map();
	for (const item of positions) {
		seen[item.delim] = (seen[item.delim] || 0) + 1;
		if (seen[item.delim] > keep[item.delim]) {
			discard.set(item.index, item.delim.length);
		}
	}

	if (discard.size===0) {
		return output_text;
	}

	let out = '';
	let i   = 0;
	while (i < output_text.length) {
		if (discard.has(i)) {
			i += discard.get(i);
			continue;
		}
		out += output_text[i];
		i++;
	}

	return out;
}


/**
 * WHOLLY_WRAPPED_DELIMITER
 * If a string is one emphasis span and nothing else — `**…**`, `*…*`, `__…__`, with no other
 * unescaped delimiter of that kind inside — return that delimiter. Otherwise null.
 *
 * Placeholders and inner text are ignored; only the delimiter structure matters. Checked
 * longest-first so `**bold**` is read as one `**` pair, never as two `*`.
 *
 * @param {string} text
 * @returns {string|null}
 */
function wholly_wrapped_delimiter(text) {

	const trimmed = (text || '').trim();
	if (!trimmed) return null;

	const positions = delimiter_positions(trimmed);

	for (const delim of MD_DELIMITERS) {
		const of_kind = positions.filter(item => item.delim===delim);
		if (of_kind.length!==2) continue;

		const opens_at_start = of_kind[0].index===0;
		const closes_at_end  = of_kind[1].index===trimmed.length - delim.length;
		if (opens_at_start && closes_at_end) {
			return delim;
		}
	}

	return null;
}


/**
 * RESTORE_WRAPPING_EMPHASIS
 * Put back emphasis that wrapped a WHOLE segment when the model dropped it.
 *
 * conform_emphasis only removes emphasis the model invented; it never adds any back. So when
 * the model drops the `**` around a fully-bold segment — an interviewer's question, an
 * emphasised passage — the bold is simply lost. For a segment that is entirely one emphasis
 * span, the fix is deterministic: re-wrap the whole translated output in the same delimiter.
 *
 * This deliberately handles ONLY the whole-segment case. Partial emphasis (a few bold words
 * inside a longer sentence) cannot be restored without guessing which translated words were
 * emphasised, and a wrong guess is worse than the honest loss — those stay lost and are
 * reported by count_emphasis_lost. Sentence-level segmentation makes the whole-segment case
 * the common one, which is why this is worth doing.
 *
 * Runs AFTER conform_emphasis: if the output already carries the emphasis (model kept it, or
 * it has partial emphasis of that kind), this leaves it untouched.
 *
 * @param {string} source_text - The segment as sent to the model.
 * @param {string} output_text - The model's translation, already conformed.
 * @returns {string}
 */
export function restore_wrapping_emphasis(source_text, output_text) {

	if (!output_text) return output_text;

	const delim = wholly_wrapped_delimiter(source_text);
	if (!delim) return output_text;

	// only restore when the output has NONE of this delimiter — otherwise the model kept some
	// emphasis and re-wrapping would double it or fight a partial span
	const has_delim = delimiter_positions(output_text).some(item => item.delim===delim);
	if (has_delim) return output_text;

	// wrap the translated text, preserving any leading/trailing whitespace on the outside
	const leading  = output_text.match(/^\s*/)[0];
	const trailing = output_text.match(/\s*$/)[0];
	const core     = output_text.slice(leading.length, output_text.length - trailing.length);
	if (!core) return output_text;

	return `${leading}${delim}${core}${delim}${trailing}`;
}


/**
 * SPLIT_MARKDOWN_BY_PARAGRAPH
 * Split a Markdown string into its constituent paragraph-level blocks.
 *
 * Blocks are separated by one or more blank lines (\n\n+). After splitting,
 * each block is trimmed of leading/trailing whitespace and empty blocks are
 * discarded.
 *
 * NOTE this is lossy — it discards the separators — so it is NOT what segment_markdown
 * uses. Trimming the seams away is exactly the bug that turned one <p> into twenty-five.
 *
 * @param {string} md - Markdown string to split.
 * @returns {string[]} Array of non-empty trimmed block strings.
 *   Returns an empty array for falsy input.
 */
export function split_markdown_by_paragraph(md) {

	if (!md) return [];

	const blocks = md.split(/\n{2,}/)
		.map(b => b.trim())
		.filter(b => b.length > 0);

	return blocks;
}


/**
 * Absolute ceiling for one segment. A single sentence is never split below this — a
 * sentence is the unit the model was trained on, and 400 characters of intact sentence is
 * a far better prompt than two 200-character fragments. Past this, the sentence is
 * pathological and gets cut at a word boundary.
 */
const HARD_MAX_CHARS = 800;


/**
 * PROTECTED_RANGES
 * Spans that a cut may never fall inside.
 *
 * Markdown links are the reason this exists: '[MIB 9](../../../../type/2068)' is full of
 * dots, and a naive sentence splitter reads them as sentence terminators. That is how a
 * link ended up sliced across two paragraphs — '(= MIB 9/…' in one and '(/tipo/2068))' in
 * the next. Inline code and fenced code blocks have the same problem, and a GFM table cut
 * in half stops being a table.
 *
 * @param {string} md
 * @returns {Array<[number, number]>} [start, end) ranges, unsorted.
 */
function protected_ranges(md) {

	const ranges   = [];
	const patterns = [
		/\[[^[\]]*\]\([^)\s]*\)/g,	// [text](url)
		/`[^`\n]*`/g,				// `inline code`
		/```[\s\S]*?```/g			// fenced code block
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(md))!==null) {
			ranges.push([match.index, match.index + match[0].length]);
		}
	}

	// GFM tables: a run of consecutive lines that all start with '|'
	const lines = md.split('\n');
	let offset  = 0;
	let run     = null;
	for (const line of lines) {
		if (/^\s*\|/.test(line)) {
			if (run===null) run = offset;
		} else if (run!==null) {
			ranges.push([run, offset]);
			run = null;
		}
		offset += line.length + 1;	// +1 for the \n
	}
	if (run!==null) {
		ranges.push([run, md.length]);
	}

	return ranges;
}


/**
 * IN_PROTECTED
 * Is `offset` strictly inside a protected range?
 * @param {Array<[number,number]>} ranges
 * @param {number} offset
 * @returns {boolean}
 */
function in_protected(ranges, offset) {

	for (const [start, end] of ranges) {
		if (offset > start && offset < end) return true;
	}

	return false;
}


/**
 * SENTENCE_CUTS
 * Offsets at which a new sentence begins.
 *
 * Written as a boundary *rejecter* rather than a sentence matcher, because the failure
 * mode that matters is a false boundary: it hands the model a subject-less fragment
 * (', por su similitud estilística…'), and a 4B model given a fragment produces garbage.
 * Under-splitting merely makes a segment longer, which is harmless.
 *
 * A '.' is NOT a sentence end when:
 *   - it sits inside a link or code span (the '../..' of a URL)
 *   - the token before it is a single letter — an initial or abbreviation ('a.C.', 'p. 400')
 *   - it separates two digits (a decimal)
 *   - it is not followed by whitespace
 *   - the next word starts with a lower-case letter ('a.C. y II' continues the sentence)
 *
 * @param {string} md
 * @param {Array<[number,number]>} ranges - protected spans
 * @returns {number[]} Offsets of the whitespace that precedes each new sentence.
 */
function sentence_cuts(md, ranges) {

	const cuts = [];
	const re   = /[.!?…]+/g;

	let match;
	while ((match = re.exec(md))!==null) {

		const terminator_start	= match.index;
		const terminator_end	= match.index + match[0].length;

		if (in_protected(ranges, terminator_start)) continue;

		// must be followed by whitespace; end-of-text needs no cut
		if (terminator_end >= md.length) continue;
		if (!/\s/.test(md[terminator_end])) continue;

		const before = md.slice(0, terminator_start);

		// a single-letter token before the dot is an initial or an abbreviation
		const last_token = before.match(/(\S+)$/);
		if (last_token && last_token[1].length===1 && !/\d/.test(last_token[1])) continue;

		// a dot between digits is a decimal separator
		if (match[0]==='.' && /\d$/.test(before) && /^\d/.test(md.slice(terminator_end))) continue;

		// walk over the separating whitespace to find where the next sentence starts
		let next = terminator_end;
		while (next < md.length && /\s/.test(md[next])) next++;
		if (next >= md.length) continue;
		if (in_protected(ranges, next)) continue;

		// a lower-case follower means the sentence did not actually end.
		// Scripts without case (Devanagari, Arabic, Greek lower-case is still Ll) fall
		// through to `false` here, which is the permissive answer we want.
		if (/\p{Ll}/u.test(md[next])) continue;

		cuts.push(terminator_end);
	}

	return cuts;
}


/**
 * STRUCTURAL_BOUNDARIES
 * Offsets where the document's own structure changes: a paragraph break or a line break.
 *
 * These are MANDATORY cuts, not candidates. A `\n` left sitting inside a segment is a
 * line break the *model* then has to reproduce — and it does not reliably do so, which is
 * how a `<br>` came back as a `<p>`. Cutting there instead turns the break into the next
 * segment's `sep`, where it is carried verbatim and cannot be lost.
 *
 * Newlines inside a protected range (a table, a fenced code block) are skipped: those
 * newlines are part of the construct and cutting there would destroy it.
 *
 * @param {string} md
 * @param {Array<[number,number]>} ranges
 * @returns {number[]} Ascending. Each points at the START of the separator run.
 */
function structural_boundaries(md, ranges) {

	const boundaries = new Set();

	// paragraph breaks
	const paragraph_re = /\n{2,}/g;
	let match;
	while ((match = paragraph_re.exec(md))!==null) {
		if (in_protected(ranges, match.index)) continue;
		boundaries.add(match.index);
	}

	// single line breaks — a <br> in the source
	const line_re = /\n/g;
	while ((match = line_re.exec(md))!==null) {
		if (md[match.index + 1]==='\n' || md[match.index - 1]==='\n') continue;	// part of a paragraph break
		if (in_protected(ranges, match.index)) continue;						// inside a table or code block
		boundaries.add(match.index);
	}

	return Array.from(boundaries).sort((a, b) => a - b);
}


/**
 * SUBDIVIDE
 * Cut one structural unit down to size at sentence boundaries.
 *
 * Only called when the unit exceeds maxChars. Grows greedily, cutting at the last sentence
 * boundary that fits. When no boundary fits, the unit is a single over-long sentence and is
 * emitted whole — a sentence is what the model was trained on, and an intact long sentence
 * beats two fragments. Only past HARD_MAX_CHARS is it cut at a word.
 *
 * @param {string} md
 * @param {number} from
 * @param {number} to
 * @param {number} maxChars
 * @param {number[]} sentences - all sentence cuts in the document
 * @param {Array<[number,number]>} ranges
 * @returns {number[]} Cuts strictly inside (from, to).
 */
function subdivide(md, from, to, maxChars, sentences, ranges) {

	const cuts       = [];
	const candidates = sentences.filter(cut => cut > from && cut < to);
	candidates.push(to);	// sentinel, so the tail is measured like any other span

	let start    = from;
	let last_fit = -1;
	let i        = 0;

	while (i < candidates.length) {

		const boundary = candidates[i];

		if (boundary <= start) {
			i++;
			continue;
		}

		if (boundary - start <= maxChars) {
			last_fit = boundary;
			i++;
			continue;
		}

		const cut = (last_fit > start) ? last_fit : boundary;
		if (cut < to) {
			cuts.push(cut);
		}
		start    = cut;
		last_fit = -1;

		if (cut===boundary) {
			i++;
		}
	}

	// last resort: a single sentence past the hard ceiling
	const spans = [from, ...cuts, to];
	const extra = [];
	for (let k = 0; k < spans.length - 1; k++) {
		if (spans[k + 1] - spans[k] > HARD_MAX_CHARS) {
			extra.push(...word_cuts(md, spans[k], spans[k + 1], maxChars, ranges));
		}
	}

	return [...cuts, ...extra].sort((a, b) => a - b);
}


/**
 * WORD_CUTS
 * Last-resort cut points inside a single unit that is longer than HARD_MAX_CHARS.
 * Word boundaries only, and never inside a protected range — a link cannot be split by
 * this path either.
 *
 * @param {string} md
 * @param {number} from
 * @param {number} to
 * @param {number} maxChars
 * @param {Array<[number,number]>} ranges
 * @returns {number[]}
 */
function word_cuts(md, from, to, maxChars, ranges) {

	const cuts = [];
	let start  = from;

	for (let i = from; i < to; i++) {

		if (!/\s/.test(md[i])) continue;
		if (in_protected(ranges, i)) continue;

		if (i - start >= maxChars) {
			cuts.push(i);
			start = i;
		}
	}

	return cuts;
}


/**
 * SEGMENT_MARKDOWN
 * Split Markdown into segments the model can translate one at a time — WITHOUT losing the
 * text that separated them.
 *
 * This returns { text, sep } rather than bare strings, and that is the whole point. The
 * previous version returned strings, so the caller had no way to know whether two segments
 * had been separated by a paragraph break, a line break, or a space — and the worker
 * rejoined everything with '\n\n'. Every seam became a paragraph break, and a record that
 * was one <p> with four <br> came back as twenty-five <p>.
 *
 * `sep` is the LITERAL text that stood between the previous segment and this one, taken
 * straight out of the source. It is not reconstructed or guessed. So the round-trip is
 * exact by construction:
 *
 *   segments.map(s => s.sep + s.text).join('') === md
 *
 * That invariant is asserted in the tests. Nothing asserted it before, which is precisely
 * how the paragraph bug shipped.
 *
 * Segments are grown greedily up to maxChars, cutting at the last legal boundary that
 * fits: paragraph break, then line break, then sentence end (see sentence_cuts, which
 * refuses to cut inside a link or on an abbreviation). A single sentence is never split;
 * one longer than maxChars is emitted whole. Only a pathological sentence past
 * HARD_MAX_CHARS is cut, at a word boundary, and never inside a link.
 *
 * @param {string} md        - Markdown string to segment.
 * @param {number} maxChars  - Soft upper bound per segment.
 * @returns {Array<{text:string, sep:string}>} `sep` is '' for the first segment.
 */
export function segment_markdown(md, maxChars = 250) {

	if (!md) return [];

	const ranges     = protected_ranges(md);
	const structural = structural_boundaries(md, ranges);
	const sentences  = sentence_cuts(md, ranges);

	// ── every structural boundary is a cut, unconditionally ─────────────
	// A paragraph break or a <br> that is left INSIDE a segment becomes the model's problem
	// to reproduce, and it will not: that is how a <br> came back as a <p>. Cutting here
	// moves the break into the next segment's `sep`, where it is carried verbatim.
	const units = [];
	let unit_start = 0;
	for (const boundary of structural) {
		units.push([unit_start, boundary]);
		unit_start = boundary;
	}
	units.push([unit_start, md.length]);

	// ── subdivide any unit that is still too big ────────────────────────
	const bounded = [];
	for (const [from, to] of units) {

		bounded.push(from);

		if (to - from > maxChars) {
			for (const cut of subdivide(md, from, to, maxChars, sentences, ranges)) {
				bounded.push(cut);
			}
		}
	}

	// ── slice, putting each separator run into the FOLLOWING segment ────
	const segments = [];
	for (let k = 0; k < bounded.length; k++) {

		const from = bounded[k];
		const to   = (k + 1 < bounded.length) ? bounded[k + 1] : md.length;

		// an empty slice (a structural boundary at position 0, say) carries nothing
		if (from >= to) {
			continue;
		}

		// the leading whitespace of this slice is what separated it from the previous one
		let content = from;
		while (content < to && /\s/.test(md[content])) content++;

		segments.push({
			sep		: md.slice(from, content),
			text	: md.slice(content, to)
		});
	}

	return segments;
}



// @license-end

// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
 * Markdown utilities for browser-side translation pipeline.
 *
 * Provides bidirectional HTML↔Markdown conversion so the LLM receives
 * clean markdown (Dédalo tags stay as [[n]] placeholders) and the
 * restored output matches the original HTML structure.
 *
 * Flow:  HTML → html_to_markdown → [LLM] → markdown_to_html → HTML
 */



/**
 * HTML_TO_MARKDOWN
 * Convert HTML to markdown for LLM translation.
 *
 * Supported conversions:
 *   Block: <p> → \n\n, <br> → \n\n, <h1>–<h6> → #…######, <ul>/<ol> → -/1.,
 *          <blockquote> → >, <hr> → ---, <div> → recurse + \n\n,
 *          <table> → markdown table | … | with | --- | separator
 *   Inline: <strong>/<b> → **, <em>/<i> → *, <u> → __,
 *           <a href> → [text](url), <code> → `code`
 *   Unsupported tags → outerHTML verbatim
 *
 * Text-node escaping: markdown metacharacters (*, _, [, ], `, \) are
 * backslash-escaped so literal characters survive the round-trip.
 * [[n]] placeholder strings are NOT escaped.
 *
 * @param {string} html - HTML string (already placeholderd)
 * @returns {string} - Markdown string
 */
export function html_to_markdown(html) {

	const parser	= new DOMParser();
	const doc		= parser.parseFromString(html, 'text/html');
	const result	= [];

	// Regex to detect [[n]] placeholder strings — do NOT escape these
	const placeholder_re = /^\[\[\d+\]\]$/;

	/**
	 * Escape markdown metacharacters in a text node.
	 * Skips [[n]] placeholders entirely.
	 * @param {string} text
	 * @returns {string}
	 */
	function escape_md(text) {
		if (!text) return '';
		// Split around [[n]] placeholders, escape non-placeholder parts
		const parts = text.split(/(\[\[\d+\]\])/);
		return parts.map(part => {
			if (placeholder_re.test(part)) return part;
			return part
				.replace(/\\/g, '\\\\')
				.replace(/\*/g, '\\*')
				.replace(/_/g, '\\_')
				.replace(/\[/g, '\\[')
				.replace(/\]/g, '\\]')
				.replace(/`/g, '\\`');
		}).join('');
	}

	/**
	 * Process a single DOM node into markdown.
	 * @param {Node} node
	 * @returns {string}
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
				return '\n\n';

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
				// Unknown tag → emit raw HTML
				return node.outerHTML;
			}
		}
	}

	/**
	 * Walk all children of a node and concatenate their markdown.
	 * @param {Node} node
	 * @returns {string}
	 */
	function walk_children(node) {
		return Array.from(node.childNodes).map(walk).join('');
	}

	/**
	 * Convert a <table> element to markdown table syntax.
	 * Tables with colspan/rowspan fall back to raw HTML.
	 * @param {Element} table
	 * @returns {string}
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
 * MARKDOWN_TO_HTML
 * Convert markdown back to HTML after LLM translation.
 *
 * Produces bare HTML matching CKEditor output format:
 *   <p>, <strong>, <em>, <u>, <a>, <code>, <h1>–<h6>,
 *   <ul>/<ol>/<li>, <blockquote>, <hr>, <table>
 *
 * @param {string} md - Markdown string
 * @returns {string} - HTML string
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

		// Raw HTML passthrough (starts with < and ends with >)
		if (/^<[^>]+>/.test(block) && />$/.test(block)) {
			html_blocks.push(block);
			continue;
		}

		// Default: paragraph — single \n inside becomes <br>
		const para_html = block.split('\n').map(line => process_inline(line)).join('<br>');
		html_blocks.push('<p>' + para_html + '</p>');
	}

	return html_blocks.join('');
}


/**
 * Process inline markdown elements within a text string.
 * Order matters: code → bold+italic → bold → italic → underline → links.
 * @param {string} text
 * @returns {string}
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

	// 4. Bold **text**
	text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

	// 5. Italic *text* (avoid matching inside <strong>)
	text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

	// 6. Underline __text__
	text = text.replace(/__([^_\n]+)__/g, '<u>$1</u>');

	// 7. Links [text](url)
	text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

	return text;
}


/**
 * Convert markdown table lines to HTML table.
 * @param {string[]} lines - Array of markdown table rows
 * @returns {string} - HTML table string
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
 * Parse a markdown table row into cell values.
 * @param {string} line - e.g. "| cell1 | cell2 | cell3 |"
 * @returns {string[]}
 */
function parse_md_row(line) {
	return line
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map(cell => cell.trim());
}


/**
 * Escape HTML special characters.
 * @param {string} text
 * @returns {string}
 */
function escape_html(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}


/**
 * Split markdown into paragraph-level blocks.
 * Splits on \n\n+ boundaries, filtering empty blocks.
 * @param {string} md - Markdown string
 * @returns {string[]}
 */
export function split_markdown_by_paragraph(md) {

	if (!md) return [];

	const blocks = md.split(/\n{2,}/)
		.map(b => b.trim())
		.filter(b => b.length > 0);

	return blocks;
}


/**
 * Group markdown blocks into chunks that fit within a character limit.
 *
 * Merges adjacent blocks (separated by \n\n) as long as the combined
 * length stays under maxChars. This reduces the number of calls to the
 * translation model while keeping each chunk short enough for the
 * model's token window.
 *
 * @param {string} md       - Markdown string
 * @param {number} maxChars - Soft limit per chunk (default 1000)
 * @returns {string[]}       - Array of chunk strings, each ≤ maxChars
 */
export function group_markdown_into_chunks(md, maxChars = 1000) {

	const blocks	= split_markdown_by_paragraph(md);
	const chunks	= [];
	let current		= '';

	for (const block of blocks) {
		// Block too large to share a chunk → flush and push solo
		if (block.length > maxChars) {
			if (current) {
				chunks.push(current);
				current = '';
			}
			chunks.push(block);
			continue;
		}

		// Attempt to merge this block with the current accumulator using \n\n as separator
		const candidate = current
			? current + '\n\n' + block
			: block;

		if (candidate.length <= maxChars) {
			current = candidate;
		} else {
			chunks.push(current);
			current = block;
		}
	}

	// Flush any remaining accumulated text
	if (current) {
		chunks.push(current);
	}

	return chunks;
}



// @license-end

// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
 * MARKDOWN
 * Tiny self-contained markdown renderer used by tool_assistant's chat UI
 * to convert AI-generated markdown responses into safe HTML.
 *
 * Handles the subset of markdown that appears in LLM chat output:
 * - Fenced code blocks (``` ... ```) with optional language label
 * - Inline code (`...`)
 * - **bold** and *italic* / _italic_ spans
 * - [text](url) hyperlinks — http/https only, rendered with rel="noopener noreferrer"
 * - Ordered and unordered lists (-, *, + / 1. 2. …)
 * - Blockquotes (> …)
 * - ATX headings (# … ######)
 * - Paragraphs separated by blank lines; single newlines become <br>
 *
 * Security model: all raw source text is HTML-escaped via _escape() before any
 * inline substitution runs, so user-supplied content cannot inject tags. Only
 * the renderer's own whitelisted tags are ever emitted. Fenced code block
 * contents are also escaped before being stored, preventing injection through
 * code spans.
 *
 * Usage:
 *   import { markdown } from './markdown.js'
 *   el.innerHTML = markdown.render(llm_response_text)
 *
 * @module markdown
 */
export const markdown = {



	/**
	 * RENDER
	 * Convert a markdown string to safe, escaped HTML.
	 *
	 * Processing is done in a two-pass approach to avoid double-encoding:
	 *   1. Fenced code blocks are extracted and replaced with NUL-delimited
	 *      sentinels (\u0000CODEBLOCK<n>\u0000) so their raw content is never
	 *      subject to the general HTML-escape pass or inline-pattern matching.
	 *      Each block's content is HTML-escaped independently at extraction time.
	 *   2. The remaining text is HTML-escaped globally, neutralising any raw
	 *      HTML or special characters the LLM may have emitted.
	 *   3. Inline code spans are extracted (same sentinel technique) after
	 *      the escape pass, so their already-escaped content is preserved.
	 *   4. Links, bold, and italic inline substitutions run on the escaped text.
	 *   5. The text is split on blank lines and each chunk is classified and
	 *      wrapped by _render_chunk() (list, blockquote, heading, or paragraph).
	 *   6. Sentinels are restored in reverse extraction order to splice the
	 *      pre-built HTML back in without further escaping.
	 *
	 * @param {string} src - Raw markdown text, typically an LLM chat response.
	 * @returns {string} Safe HTML string ready for innerHTML assignment.
	 *   Returns empty string when src is absent or not a non-empty string.
	 */
	render: function(src) {

		if (typeof src !== 'string' || src.length === 0) return ''

		// 1. extract fenced code blocks first (so their contents are not parsed)
			// The \u0000 (NUL) character is chosen as a sentinel delimiter because it
			// cannot appear in valid markdown text or in any _escape() output, making
			// false-positive sentinel matches impossible during restore (step 7).
			const code_blocks = []
			let text = src.replace(
				/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
				function(_m, lang, code) {
					const idx = code_blocks.length
					code_blocks.push(
						'<pre class="md_code_block"><code'
						+ (lang ? ' class="lang-' + markdown._escape_attr(lang) + '"' : '')
						+ '>' + markdown._escape(code) + '</code></pre>'
					)
					return '\u0000CODEBLOCK' + idx + '\u0000'
				}
			)

		// 2. escape remaining HTML
			// (!) Must run AFTER fenced-block extraction so that extracted block
			// sentinels (which contain \u0000 escape sequences, not HTML) are not
			// double-escaped. The already-built HTML in code_blocks[] is safe.
			text = markdown._escape(text)

		// 3. inline code
			// After the global escape pass, backtick delimiters are still plain
			// backtick characters (not affected by _escape()), so this pattern
			// still matches. Captured content 'c' is already HTML-escaped.
			const inline_codes = []
			text = text.replace(/`([^`\n]+)`/g, function(_m, c) {
				const idx = inline_codes.length
				inline_codes.push('<code class="md_code_inline">' + c + '</code>')
				return '\u0000INLINECODE' + idx + '\u0000'
			})

		// 4. links [text](url)
			// Only http/https URLs are matched, preventing javascript: or data: injection.
			// The label text is already HTML-escaped from step 2.
			text = text.replace(
				/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
				function(_m, label, url) {
					return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>'
				}
			)

		// 5. bold + italic
			// Bold (**…**) must be substituted before single-asterisk italic (*…*)
			// so that double-asterisk delimiters are consumed first; otherwise the
			// first * of ** would match the italic pattern and leave a dangling *.
			text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
			text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
			text = text.replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1<em>$2</em>')
			// Underscore italic is limited to whitespace-bounded spans to avoid
			// italicising underscores inside snake_case identifiers.

		// 6. block-level: split by blank lines into chunks
			// Two or more consecutive newlines delimit paragraph/block boundaries.
			const chunks = text.split(/\n{2,}/)
			const html_chunks = chunks.map(function(chunk) {
				return markdown._render_chunk(chunk)
			})
			let html = html_chunks.join('\n')

		// 7. restore inline codes & code blocks
			// Inline codes are restored first; block restore follows. parseInt radix
			// 10 guards against octal misparse of the sentinel index on older runtimes.
			html = html.replace(/\u0000INLINECODE(\d+)\u0000/g, function(_m, idx) {
				return inline_codes[parseInt(idx, 10)] || ''
			})
			html = html.replace(/\u0000CODEBLOCK(\d+)\u0000/g, function(_m, idx) {
				return code_blocks[parseInt(idx, 10)] || ''
			})

		return html
	},



	/**
	 * _RENDER_CHUNK
	 * Classify and wrap a single block-level text chunk as HTML.
	 *
	 * A chunk is one paragraph-sized unit produced by splitting the full text on
	 * two or more consecutive newlines. By the time this method is called:
	 * - The chunk text is already HTML-escaped.
	 * - Inline code and fenced-block spans have been replaced with NUL sentinels.
	 * - Bold, italic, and link HTML has already been injected.
	 *
	 * Classification order (first match wins):
	 *   1. NUL-sentinel code-block placeholder — pass through unchanged.
	 *   2. Blockquote — every non-empty line starts with HTML-escaped '>' (&gt;).
	 *   3. Unordered list — every non-empty line starts with -, *, or +.
	 *   4. Ordered list — every non-empty line starts with a digit sequence and '.'.
	 *   5. ATX heading — single line starting with one to six '#' characters.
	 *   6. Paragraph — catch-all; single newlines within the chunk become <br>.
	 *
	 * Note: nested list items are not supported; mixed-type chunks fall through
	 * to the paragraph case and render as-is.
	 *
	 * @param {string} chunk - A single block-level text unit (HTML-escaped,
	 *   sentinels already substituted for code spans).
	 * @returns {string} An HTML string wrapping the chunk content.
	 */
	_render_chunk: function(chunk) {

		const lines = chunk.split('\n')

		// preserved code block placeholder (passes through untouched)
			if (/^\u0000CODEBLOCK\d+\u0000$/.test(chunk.trim())) {
				return chunk.trim()
			}

		// blockquote
			if (lines.every(function(l) { return l.startsWith('&gt;') || l.length === 0 })) {
				const inner = lines.map(function(l) {
					return l.replace(/^&gt;\s?/, '')
				}).join('<br>')
				return '<blockquote class="md_blockquote">' + inner + '</blockquote>'
			}

		// unordered list
			if (lines.every(function(l) { return /^\s*[-*+]\s+/.test(l) || l.length === 0 })) {
				const items = lines
					.filter(function(l) { return l.length > 0 })
					.map(function(l) {
						return '<li>' + l.replace(/^\s*[-*+]\s+/, '') + '</li>'
					})
					.join('')
				return '<ul class="md_list">' + items + '</ul>'
			}

		// ordered list
			if (lines.every(function(l) { return /^\s*\d+\.\s+/.test(l) || l.length === 0 })) {
				const items = lines
					.filter(function(l) { return l.length > 0 })
					.map(function(l) {
						return '<li>' + l.replace(/^\s*\d+\.\s+/, '') + '</li>'
					})
					.join('')
				return '<ol class="md_list">' + items + '</ol>'
			}

		// heading
			const heading_match = chunk.match(/^(#{1,6})\s+(.+)$/)
			if (heading_match && lines.length === 1) {
				const level = heading_match[1].length
				return '<h' + level + ' class="md_heading">' + heading_match[2] + '</h' + level + '>'
			}

		// paragraph (preserve line breaks as <br>)
			return '<p class="md_paragraph">' + lines.join('<br>') + '</p>'
	},



	/**
	 * _ESCAPE
	 * HTML-escape a string so that it is safe to embed as text content or as an
	 * attribute value (with quotes) inside an HTML document.
	 *
	 * The five characters replaced are the minimal set required to prevent HTML
	 * injection: ampersand first (to avoid double-encoding subsequent entities),
	 * then angle brackets, double quote, and single quote.
	 *
	 * (!) The ampersand replacement MUST remain first in the chain. Placing it
	 * after '<' or '>' would double-encode the '&' in '&lt;' / '&gt;'.
	 *
	 * @param {string} s - Raw text that may contain HTML-special characters.
	 * @returns {string} HTML-escaped string; all five special characters replaced
	 *   with their named or numeric HTML entities.
	 */
	_escape: function(s) {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
	},



	/**
	 * _ESCAPE_ATTR
	 * Sanitise a string for use as an HTML attribute value in a context where
	 * only alphanumeric characters and the safe punctuation [-_] are acceptable.
	 *
	 * Used exclusively to sanitise fenced code-block language labels before they
	 * are written into a class="lang-<label>" attribute. The allowlist approach
	 * (strip everything outside [a-zA-Z0-9_-]) is stricter than HTML-escaping
	 * and ensures no quote, angle-bracket, or whitespace can escape the attribute
	 * even if the surrounding HTML is constructed by string concatenation.
	 *
	 * @param {string} s - Raw language identifier string, e.g. 'javascript', 'py'.
	 * @returns {string} String with all characters outside [a-zA-Z0-9_-] removed.
	 *   Returns an empty string when no allowed characters are present.
	 */
	_escape_attr: function(s) {
		return s.replace(/[^a-zA-Z0-9_-]/g, '')
	}



}//end markdown

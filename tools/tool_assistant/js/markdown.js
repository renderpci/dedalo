// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
 * MARKDOWN
 * Tiny self-contained markdown renderer.
 * Handles: fenced code blocks, inline code, **bold**, *italic*,
 * [text](url) links, ordered/unordered lists, blockquotes, paragraphs.
 * All input is HTML-escaped first; only the renderer's own tags are emitted.
 */
export const markdown = {



	/**
	 * Render markdown source to safe HTML.
	 * @param {string} src
	 * @return {string}
	 */
	render: function(src) {

		if (typeof src !== 'string' || src.length === 0) return ''

		// 1. extract fenced code blocks first (so their contents are not parsed)
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
			text = markdown._escape(text)

		// 3. inline code
			const inline_codes = []
			text = text.replace(/`([^`\n]+)`/g, function(_m, c) {
				const idx = inline_codes.length
				inline_codes.push('<code class="md_code_inline">' + c + '</code>')
				return '\u0000INLINECODE' + idx + '\u0000'
			})

		// 4. links [text](url)
			text = text.replace(
				/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
				function(_m, label, url) {
					return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>'
				}
			)

		// 5. bold + italic
			text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
			text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
			text = text.replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1<em>$2</em>')

		// 6. block-level: split by blank lines into chunks
			const chunks = text.split(/\n{2,}/)
			const html_chunks = chunks.map(function(chunk) {
				return markdown._render_chunk(chunk)
			})
			let html = html_chunks.join('\n')

		// 7. restore inline codes & code blocks
			html = html.replace(/\u0000INLINECODE(\d+)\u0000/g, function(_m, idx) {
				return inline_codes[parseInt(idx, 10)] || ''
			})
			html = html.replace(/\u0000CODEBLOCK(\d+)\u0000/g, function(_m, idx) {
				return code_blocks[parseInt(idx, 10)] || ''
			})

		return html
	},



	/**
	 * Render a single block-level chunk (already escaped + inlined).
	 * @param {string} chunk
	 * @return {string}
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



	_escape: function(s) {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
	},



	_escape_attr: function(s) {
		return s.replace(/[^a-zA-Z0-9_-]/g, '')
	}



}//end markdown

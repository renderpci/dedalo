// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/
// (!) resolve_media_url is used inside _build_cell and cell_to_text but is
// defined later in this file as a module-level export; it works because
// flat_table prototype methods are only called after the full module has been
// evaluated — forward reference by closure over the module scope.



/**
* FLAT_TABLE
* Client accumulator and renderer of the export flat-table NDJSON protocol
* (see tools/tool_export/class.export_tabulator.php).
*
* Wire protocol — one JSON object per NDJSON line, discriminated by `t`:
* - {"t":"meta", v, data_format, breakdown, fill_the_gaps, section_tipo, total}
*   First line of the stream; carries run-time configuration from the server.
* - {"t":"col", i, key, group, path, label, ar_labels, cell_type, model, after}
*   Column descriptor. Columns can arrive mid-stream when breakdown discovers
*   new axes. `i` is a stable integer ordinal; `after` is a live-insert hint
*   (ordinal of the column this one should follow; null = prepend).
*   The server-authoritative display order arrives in the 'end' line.
* - {"t":"row", rec, sub, c:{ordinal: scalar}} sparse ordinal-keyed cells.
*   `rec` is the section_id; `sub` > 0 marks continuation sub-rows produced
*   by breakdown explosion. Cells are keyed by column ordinal (integer), not
*   by column key string; missing ordinals mean the cell is empty.
* - {"t":"end", columns:[ordinals in display order], rows, records}
*   Final line. `columns` is the authoritative ordinal array; the preview is
*   re-rendered if the live-insert order diverged from this.
* Unknown `t` values are silently ignored (reserved / forward compatible).
*
* Design: the same accumulated flat data feeds three outputs without any
* client-side re-flattening — HTML preview (streaming DOM updates via RAF),
* CSV/TSV string (to_delimited), and the sheetjs XLSX/ODS table (render_table
* with plain:true). This mirrors the server's single-pass export_tabulator
* and eliminates the legacy per-format re-processing.
*
* Usage:
*   const ft = new flat_table()
*   ft.on_end = (end_line) => { ... }
*   // mount preview early so streaming rows appear live:
*   container.appendChild(ft.render_table({ mount: true }))
*   // feed each parsed NDJSON line:
*   ft.process_line(line)
*/
export const flat_table = function() {

	// stream metadata from the 'meta' line; null until received
	this.meta	= null
	this.cols	= new Map()	// ordinal (integer) -> col line object
	this.order	= []		// ordinals in display order (updated by insert_col and finalize)
	this.rows	= []		// row line objects in arrival order
	// authoritative 'end' line; null until the stream closes
	this.end	= null

	this.config	= {
		show_tipo_in_label : false
	}

	// preview table node (when mounted)
	this.node	= null

	// stream row rendering queue
	// Rows are pushed here by process_line and drained via requestAnimationFrame
	// so DOM updates are batched (one reflow per frame) and the main thread stays
	// responsive during large exports.
	this._row_queue			= []
	// guard that prevents concurrent drain loops from overlapping
	this._is_processing		= false

	// optional callbacks
	// on_end(end_line) is called once the 'end' line has been applied,
	// giving the caller a hook to enable download buttons or update totals.
	this.on_end = null
}//end flat_table



/**
* PROCESS_LINE
* Dispatch one parsed NDJSON protocol line to the appropriate handler.
* This is the single entry point for the stream consumer — call it once for
* every line returned by the server. Order matters: 'meta' arrives first,
* 'col' lines may interleave with 'row' lines, 'end' arrives last.
* @param {Object} line - parsed JSON object with at minimum a `t` discriminator
* @returns {void}
*/
flat_table.prototype.process_line = function(line) {

	switch (line.t) {
		case 'meta':
			this.meta = line
			break

		case 'col':
			this.insert_col(line)
			break

		case 'row':
			// push to this.rows first so render_table() sees every row even
			// if the table is mounted after the stream ends
			this.rows.push(line)
			this._enqueue_row(line)
			break

		case 'end':
			this.finalize(line)
			break

		default:
			// reserved line types are ignored (forward compatibility)
			break
	}
}//end process_line



/**
* INSERT_COL
* Register a column descriptor and splice it into the live display order,
* honoring the server's `after` live-insert hint so the preview column order
* matches the server's intent before the authoritative 'end' line arrives.
*
* When the preview table is already mounted in the DOM this method also
* patches the header (<th>) and every existing body row with a blank <td>
* at the correct position, keeping the live table structurally consistent
* without a full re-render.
*
* Duplicate column ordinals (col.i already in this.cols) are silently ignored;
* the server must not emit duplicate ordinals but the client is defensive.
*
* `after` semantics:
* - null / undefined → insert at position 0 (before all existing columns)
* - ordinal of a known column → insert immediately after it
* - ordinal of an unknown column → append at end (degraded, no crash)
*
* @param {Object} col - 'col' protocol line: {i, key, group, path, label,
*                        ar_labels, cell_type, model, after}
* @returns {void}
*/
flat_table.prototype.insert_col = function(col) {

	if (this.cols.has(col.i)) {
		return
	}
	this.cols.set(col.i, col)

	// position from the 'after' hint (null = first)
		let pos = 0
		if (col.after!==null && col.after!==undefined) {
			const after_index = this.order.indexOf(col.after)
			// (!) if after_index is -1 the referenced predecessor is not yet
			// known (out-of-order delivery); fall back to appending at end
			pos = (after_index===-1)
				? this.order.length
				: after_index + 1
		}
		this.order.splice(pos, 0, col.i)

	// live DOM patch: new header cell + empty body cells at the position
		if (this.node) {
			const header_tr = this.node.querySelector('tr.row_header')
			if (header_tr) {
				const th = this._build_header_cell(col)
				const ths = header_tr.querySelectorAll('th')
				if (pos < ths.length) {
					header_tr.insertBefore(th, ths[pos])
				}else{
					header_tr.appendChild(th)
				}
			}
			// patch every existing body row with a blank td so column
			// count stays aligned with the header
			const body_trs = this.node.querySelectorAll('tr:not(.row_header)')
			for (const body_tr of body_trs) {
				const td	= document.createElement('td')
				const tds	= body_tr.querySelectorAll('td')
				if (pos < tds.length) {
					body_tr.insertBefore(td, tds[pos])
				}else{
					body_tr.appendChild(td)
				}
			}
		}
}//end insert_col



/**
* FINALIZE
* Apply the authoritative column order from the 'end' line and fire the
* optional on_end callback.
*
* The 'end' line's `columns` array is the server's canonical display order.
* In the common case the live-insert hints already produced the same order
* (breakdown columns arrive in the right slot) so this is a cheap equality
* check and no DOM work is done. When the order diverges — which can happen
* if breakdown columns arrived out of order — this.order is replaced and the
* preview table is re-rendered in place using all accumulated rows.
*
* (!) After a re-render the pending _row_queue is cleared to prevent those
* rows from being appended a second time: _render_content() drains this.rows
* (the authoritative store), but _process_queue would still try to append the
* queued references to this.node afterward, producing duplicate rows.
*
* @param {Object} end - 'end' protocol line: {t, columns, rows, records}
*   columns: {Array} ordinals in server-authoritative display order
*   rows: {number} total row count emitted
*   records: {number} total record count (unique rec values)
* @returns {void}
*/
flat_table.prototype.finalize = function(end) {

	this.end = end

	const same_order = end.columns.length===this.order.length
		&& end.columns.every((ordinal, index) => ordinal===this.order[index])

	if (!same_order) {
		this.order = [...end.columns]
		if (this.node) {
			// the full re-render below includes every accumulated row:
			// drop pending queue entries to avoid double-appending them
			this._row_queue = []
			this._render_content(this.node, false)
		}
	}

	if (typeof this.on_end==='function') {
		this.on_end(end)
	}
}//end finalize



/**
* GET_COLUMN_LABEL
* Return the display text for a column header cell.
*
* The server resolves labels to the user's language and sends them as
* col.label; col.key is the dot-separated path string used as a fallback.
* When config.show_tipo_in_label is true the leaf component's tipo is
* appended in square brackets — useful for debugging ambiguous multi-path
* breakdowns where two columns share a human label but differ in tipo.
*
* col.path is an array of export_path_segment objects; the last element
* carries component_tipo for the actual data component.
*
* @param {Object} col - col line object from this.cols
* @returns {string} display label, possibly appended with ' [tipo]'
*/
flat_table.prototype.get_column_label = function(col) {

	const label = col.label || col.key || ''

	if (this.config.show_tipo_in_label) {
		// walk to the last path segment to get the leaf component tipo
		const leaf = Array.isArray(col.path) && col.path.length
			? col.path[col.path.length-1]
			: null
		const tipo = leaf ? leaf.component_tipo : null
		return tipo ? label + ' [' + tipo + ']' : label
	}

	return label
}//end get_column_label



/**
* CELL_TO_TEXT
* Return the plain-text representation of a cell value for file outputs
* (CSV, TSV, sheetjs XLSX/ODS). This is the single text-serialisation
* chokepoint for exported files — do not bypass it when building file content.
*
* For media columns (cell_type 'img' or 'av') the raw value is a ' | '-joined
* list of server-relative URL paths. Each path is resolved to a full absolute
* URL via resolve_media_url so the exported file contains clickable links.
* Empty strings produced by resolve_media_url (invalid / blank URLs) are
* filtered out before re-joining.
*
* (!) The server cannot know the public origin of the Dédalo installation, so
* local URL prefixing is necessarily done client-side here.
*
* @param {Object|null} col - col line object; may be null if the column
*   descriptor arrived late (defensive; empty string returned)
* @param {string|number|null|undefined} value - raw cell value from row.c
* @returns {string} plain text ready for file serialisation; never null
*/
flat_table.prototype.cell_to_text = function(col, value) {

	if (value===null || value===undefined) {
		return ''
	}

	const text = String(value)

	if (col && (col.cell_type==='img' || col.cell_type==='av')) {
		// multi-value media cells are records_separator (' | ') joined on the server;
		// resolve each segment to an absolute URL for the exported file
		return text
			.split(' | ')
			.map(url => resolve_media_url(url))
			.filter(url => url!=='')
			.join(' | ')
	}

	return text
}//end cell_to_text



/**
* TO_DELIMITED
* Serialise the accumulated flat data as a delimited text string (CSV or TSV).
*
* Formatting rules:
* - CSV (quote=true): every field is RFC-4180 double-quoted; internal double
*   quotes are escaped by doubling (""). Commas and newlines inside values
*   are safe because the wrapping quotes delimit the field.
* - TSV (quote=false): no quoting; embedded tabs/CR/LF are collapsed to a
*   single space so the cell boundary is unambiguous. This is the format
*   expected by spreadsheets when pasting tab-separated data.
*
* The column set and row order follow this.order / this.rows exactly as they
* stand at call time; call this only after the 'end' line has been processed
* to guarantee the authoritative order.
*
* @param {string} [column_separator=';'] - field delimiter: ';' for CSV or '\t' for TSV
* @param {boolean} [quote=true] - true for RFC-4180 double-quoting (CSV);
*   false for tab-safe collapse (TSV)
* @returns {string} complete delimited string including header row, newline-separated
*/
flat_table.prototype.to_delimited = function(column_separator=';', quote=true) {

	const row_separator = '\n'

	// format function varies by output type: RFC-4180 double-quoting for CSV,
	// whitespace collapsing for TSV
	const format = quote
		? v => '"' + String(v).replace(/"/g, '""') + '"'
		: v => String(v).replace(/[\t\n\r]+/g, ' ')

	const lines = []

	// header
		const header_cells = this.order.map(ordinal =>
			format(this.get_column_label(this.cols.get(ordinal)))
		)
		lines.push(header_cells.join(column_separator))

	// rows
		const rows_length = this.rows.length
		for (let i = 0; i < rows_length; i++) {
			const row	= this.rows[i]
			// sparse cells: row.c may not have an entry for every ordinal;
			// cell_to_text returns '' for undefined values
			const cells	= this.order.map(ordinal =>
				format(this.cell_to_text(this.cols.get(ordinal), row.c[ordinal]))
			)
			lines.push(cells.join(column_separator))
		}

	return lines.join(row_separator)
}//end to_delimited



/**
* RENDER_TABLE
* Build a complete <table> HTMLElement from the currently accumulated data.
* This is used for two different purposes controlled by `options`:
*
* 1. Live preview (default, mount:true): the returned table is inserted into
*    the DOM by the caller and registered as this.node so that subsequent
*    streaming rows are appended incrementally via _process_queue.
*    Call this once, early, even before all rows have arrived.
*
* 2. File export (plain:true, mount:false): the returned table uses text-only
*    cells (no <img> or <a>) so that sheetjs can read the cell values for
*    XLSX/ODS generation. The table is NOT registered as the live preview.
*
* (!) After mounting, _row_queue is cleared. _render_content drains this.rows
* (the authoritative accumulator), which already contains rows that were also
* pushed to _row_queue by process_line. Without clearing the queue those rows
* would be appended a second time by _process_queue, producing duplicates.
*
* @param {Object} [options={}] - rendering options
* @param {boolean} [options.plain=false] - true for text-only cells (sheetjs
*   XLSX/ODS input); false for rich HTML cells (img, a elements)
* @param {boolean} [options.mount] - true to register the table as the live
*   streaming target (this.node); defaults to !plain
* @returns {HTMLElement} fully populated <table> element
*/
flat_table.prototype.render_table = function(options={}) {

	const plain = options.plain || false
	const mount = options.mount ?? !plain

	const table = document.createElement('table')
	table.classList.add('export_flat_table')

	this._render_content(table, plain)

	if (mount) {
		this.node = table
		// _render_content already rendered EVERY accumulated row (this.rows),
		// including any still sitting in the stream queue (process_line pushes
		// to this.rows before enqueueing): drop the queue or those rows would
		// be appended a second time once the node mounts (duplicated preview)
		this._row_queue = []
	}

	return table
}//end render_table



/**
* _RENDER_CONTENT
* Clear and fully rebuild the header and all currently accumulated rows
* inside the given table element. Used both by render_table() for initial
* construction and by finalize() when the authoritative column order differs
* from the live-insert order.
*
* All existing child nodes are removed first so the method is safe to call
* on a table that already has content (in-place re-render). Rows are
* collected into a DocumentFragment before appending to minimise reflows.
*
* @param {HTMLElement} table - target table element (emptied and rebuilt)
* @param {boolean} plain - true for text-only cells; false for rich HTML cells
* @returns {void}
*/
flat_table.prototype._render_content = function(table, plain) {

	// remove all existing children (header + rows) before rebuilding
	while (table.hasChildNodes()) {
		table.removeChild(table.lastChild)
	}

	// header
		const header_tr = document.createElement('tr')
		header_tr.classList.add('row_header')
		for (const ordinal of this.order) {
			header_tr.appendChild( this._build_header_cell(this.cols.get(ordinal)) )
		}
		table.appendChild(header_tr)

	// rows — batch into a fragment to trigger a single reflow
		const fragment = document.createDocumentFragment()
		const rows_length = this.rows.length
		for (let i = 0; i < rows_length; i++) {
			fragment.appendChild( this.render_row(this.rows[i], plain) )
		}
		table.appendChild(fragment)
}//end _render_content



/**
* _BUILD_HEADER_CELL
* Create a single <th> element for the given column descriptor.
* The visible text is the resolved label from get_column_label(); the tooltip
* (title attribute) exposes the dot-separated key path so developers can
* cross-reference the column against the server-side tabulator output.
*
* @param {Object} col - col line object from this.cols
* @returns {HTMLElement} populated <th> element
*/
flat_table.prototype._build_header_cell = function(col) {

	const th = document.createElement('th')
	th.textContent = this.get_column_label(col)
	// title shows the raw key path for inspection/debugging
	th.title = col.key || ''

	return th
}//end _build_header_cell



/**
* RENDER_ROW
* Build a <tr> element for one protocol row line.
*
* Breakdown explosion produces sub-rows (row.sub > 0) that visually continue
* the record started by the primary row (row.sub === 0). Sub-rows receive
* the CSS class 'sub_row' so they can be styled differently (e.g. no top
* border, indented appearance) to signal they belong to the same record.
*
* Cells are created in this.order sequence; missing ordinals in row.c produce
* empty <td> elements (sparse row handling).
*
* @param {Object} row - 'row' protocol line: {t, rec, sub, c:{ordinal: scalar}}
* @param {boolean} [plain=false] - true for text-only cells (file export);
*   false for rich HTML cells (preview)
* @returns {HTMLElement} populated <tr> element
*/
flat_table.prototype.render_row = function(row, plain=false) {

	const tr = document.createElement('tr')
	// sub > 0 means this row is a breakdown continuation of the same record
	if (row.sub > 0) {
		tr.classList.add('sub_row')
	}

	for (const ordinal of this.order) {
		const col	= this.cols.get(ordinal)
		const value	= row.c[ordinal]
		tr.appendChild( this._build_cell(col, value, plain) )
	}

	return tr
}//end render_row



/**
* _BUILD_CELL
* Create a single <td> element for a cell value, rendering it appropriately
* for the column's cell_type.
*
* cell_type dispatch (plain=false):
* - 'img' / 'av': the value is a ' | '-joined list of media URL paths.
*   Each path is resolved to an absolute URL and rendered as a lazy-loading
*   <img> thumbnail with class 'export_media_thumb'. Empty/invalid paths are
*   skipped. This mirrors the server records_separator convention.
* - 'iri': the value is an IRI (or comma-separated list of IRIs).
*   The first IRI is used as the href; full value text is the link label.
*   The link opens in a new tab.
* - 'section_id', 'json', 'text', or any unknown type: rendered as plain text.
*
* When plain=true all cell types are rendered as text via cell_to_text() —
* this path is used for sheetjs file export where <img>/<a> elements are
* not useful.
*
* @param {Object|null} col - col line object; null when column descriptor
*   has not yet arrived (defensive; plain text fallback)
* @param {string|number|null|undefined} value - raw cell value from row.c
* @param {boolean} plain - true for text-only (file export); false for rich HTML
* @returns {HTMLElement} populated <td> element (may be empty)
*/
flat_table.prototype._build_cell = function(col, value, plain) {

	const td = document.createElement('td')

	// empty cell: return immediately regardless of plain mode
	if (value===null || value===undefined || value==='') {
		return td
	}

	// plain (file) cells are always text
	if (plain) {
		td.textContent = this.cell_to_text(col, value)
		return td
	}

	switch (col ? col.cell_type : 'text') {

		case 'img':
		case 'av': {
			// preview thumbnails (multi-value cells joined with ' | ')
			const ar_url = String(value).split(' | ')
			for (const url of ar_url) {
				const resolved = resolve_media_url(url)
				if (!resolved) continue
				const img = document.createElement('img')
				img.src			= resolved
				img.loading		= 'lazy'
				img.className	= 'export_media_thumb'
				td.appendChild(img)
			}
			break
		}

		case 'iri': {
			// use only the first IRI as the link href; the full value (which
			// may contain multiple IRIs) becomes the visible link text
			const a = document.createElement('a')
			a.href			= String(value).split(', ')[0]
			a.target		= '_blank'
			a.textContent	= String(value)
			td.appendChild(a)
			break
		}

		case 'section_id':
		case 'json':
		case 'text':
		default:
			td.textContent = String(value)
			break
	}

	return td
}//end _build_cell



/**
* _ENQUEUE_ROW
* Add one row to the streaming render queue and kick off the drain loop.
* Rows are not rendered immediately; instead they accumulate and are flushed
* in batches by _process_queue via requestAnimationFrame so the browser
* can paint between batches and the UI stays responsive during large exports.
*
* If the preview table is not yet mounted when _process_queue runs, the drain
* loop retries with setTimeout until the node is available.
*
* @param {Object} row - 'row' protocol line (same object already in this.rows)
* @returns {void}
*/
flat_table.prototype._enqueue_row = function(row) {

	this._row_queue.push(row)
	this._process_queue()
}//end _enqueue_row



/**
* _PROCESS_QUEUE
* Drain the streaming row queue in BATCH_SIZE chunks, one chunk per
* requestAnimationFrame callback.
*
* Design goals:
* - Single reflow per animation frame (fragment batching).
* - The drain loop is guarded by _is_processing so only one loop is active
*   at any time; concurrent calls from process_line return immediately.
* - If this.node is not yet mounted (or has been detached from document.body)
*   the drain is deferred with a 50 ms setTimeout and retried. Rows remain
*   in _row_queue until the node is available.
* - When the queue empties naturally the loop exits and _is_processing is
*   cleared so the next _enqueue_row call can start a fresh loop.
*
* Batch size of 20 is an empirical balance: large enough to fill a viewport
* in one or two frames on typical exports, small enough not to block paint
* for noticeably long on very wide tables.
*
* (!) This method uses `const self = this` rather than an arrow function
* because it predates widespread arrow-function use in this codebase; the
* inner `try_process` closure captures `self` for safe re-entrant calls.
*
* @returns {void}
*/
flat_table.prototype._process_queue = function() {

	const self = this

	// guard: only one drain loop active at a time
	if (self._is_processing) {
		return
	}
	self._is_processing = true

	// rows per animation frame; adjust if very wide tables feel sluggish
	const BATCH_SIZE = 20

	const try_process = () => {

		if (!self.node || !document.body.contains(self.node)) {
			// table not mounted yet: retry shortly (rows stay queued)
			setTimeout(() => {
				if (self._row_queue.length) {
					try_process()
				}else{
					self._is_processing = false
				}
			}, 50)
			return
		}

		if (!self._row_queue.length) {
			self._is_processing = false
			return
		}

		requestAnimationFrame(() => {
			// splice to dequeue exactly BATCH_SIZE rows (or fewer at stream end)
			const batch		= self._row_queue.splice(0, BATCH_SIZE)
			const fragment	= document.createDocumentFragment()
			for (const row of batch) {
				fragment.appendChild( self.render_row(row, false) )
			}
			self.node.appendChild(fragment)
			// recurse to drain the rest; exits when queue is empty
			try_process()
		})
	}

	try_process()
}//end _process_queue



/**
* RESOLVE_MEDIA_URL
* Resolve a media URL to a full absolute URL usable in <img src> or export files.
*
* The export_tabulator emits server-relative paths (e.g. '/dedalo/media/…')
* because the server cannot know the public origin of the installation.
* This function prepends window.location.origin to make the URL absolute.
* External URLs that already start with 'http' (http:// or https://) are
* returned unchanged.
*
* Exported as a module-level function so other export JS modules can reuse
* the same resolution logic without importing flat_table.
*
* @param {string} url - server-relative path or absolute URL
* @returns {string} absolute URL, or empty string if `url` is falsy
*/
export const resolve_media_url = function(url) {

	if (!url || !url.length) {
		return ''
	}

	// external URLs already have an origin; local paths need one prepended
	return url.indexOf('http')===0
		? url
		: window.location.origin + url
}//end resolve_media_url



// @license-end

// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* FLAT_TABLE
* Client accumulator and renderer of the export flat-table NDJSON protocol
* (see tools/tool_export/class.export_tabulator.php):
* - {"t":"meta", ...} stream metadata
* - {"t":"col", i, key, group, path, label, ar_labels, cell_type, model, after}
*   columns can arrive mid-stream (breakdown); 'after' is the live-insert hint
* - {"t":"row", rec, sub, c:{ordinal: scalar}} sparse ordinal-keyed cells
* - {"t":"end", columns:[...], rows, records} authoritative display order
* Unknown 't' values are ignored (reserved / forward compatible).
*
* The same flat data feeds the HTML preview, the CSV/TSV strings and the
* sheetjs table (WYSIWYG): there is no client-side re-flattening anymore.
*/
export const flat_table = function() {

	this.meta	= null
	this.cols	= new Map()	// ordinal -> col line object
	this.order	= []		// ordinals in display order
	this.rows	= []		// row line objects
	this.end	= null

	this.config	= {
		show_tipo_in_label : false
	}

	// preview table node (when mounted)
	this.node	= null

	// stream row rendering queue
	this._row_queue			= []
	this._is_processing		= false

	// optional callbacks
	this.on_end = null
}//end flat_table



/**
* PROCESS_LINE
* Dispatch one protocol line
* @param object line
* @return void
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
* Register a column honoring the 'after' live-insert hint and patch the
* preview header/body when already mounted
* @param object col
* @return void
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
* Apply the authoritative column order from the 'end' line. When the
* live-insert hints already produced the same order (common case) this
* is a no-op; otherwise the preview is re-rendered in place.
* @param object end
* @return void
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
* Header text of a column (server resolved label + optional leaf tipo)
* @param object col
* @return string
*/
flat_table.prototype.get_column_label = function(col) {

	const label = col.label || col.key || ''

	if (this.config.show_tipo_in_label) {
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
* Final text of a cell for files (CSV/TSV/XLSX). Local media URLs get the
* current origin prefixed (the server cannot know the public origin)
* @param object col
* @param string|number|null|undefined value
* @return string
*/
flat_table.prototype.cell_to_text = function(col, value) {

	if (value===null || value===undefined) {
		return ''
	}

	const text = String(value)

	if (col && (col.cell_type==='img' || col.cell_type==='av')) {
		// multi-value media cells are records_separator joined
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
* Build the delimited file string from the flat data
* @param string column_separator  ';' (CSV) or '\t' (TSV)
* @param bool quote  RFC quoting (CSV true, TSV false)
* @return string
*/
flat_table.prototype.to_delimited = function(column_separator=';', quote=true) {

	const row_separator = '\n'

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
			const cells	= this.order.map(ordinal =>
				format(this.cell_to_text(this.cols.get(ordinal), row.c[ordinal]))
			)
			lines.push(cells.join(column_separator))
		}

	return lines.join(row_separator)
}//end to_delimited



/**
* RENDER_TABLE
* Build the <table> node from the current data.
* @param object options
* 	- plain: bool  text-only cells (sheetjs XLSX/ODS input); default false
* 	- mount: bool  keep the node as the live preview target; default !plain
* @return HTMLElement table
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
* (re)build header + all current rows inside the given table node
* @param HTMLElement table
* @param bool plain
* @return void
*/
flat_table.prototype._render_content = function(table, plain) {

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

	// rows
		const fragment = document.createDocumentFragment()
		const rows_length = this.rows.length
		for (let i = 0; i < rows_length; i++) {
			fragment.appendChild( this.render_row(this.rows[i], plain) )
		}
		table.appendChild(fragment)
}//end _render_content



/**
* _BUILD_HEADER_CELL
* @param object col
* @return HTMLElement th
*/
flat_table.prototype._build_header_cell = function(col) {

	const th = document.createElement('th')
	th.textContent = this.get_column_label(col)
	th.title = col.key || ''

	return th
}//end _build_header_cell



/**
* RENDER_ROW
* @param object row protocol row line
* @param bool plain = false
* @return HTMLElement tr
*/
flat_table.prototype.render_row = function(row, plain=false) {

	const tr = document.createElement('tr')
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
* @param object col
* @param string|number|null|undefined value
* @param bool plain
* @return HTMLElement td
*/
flat_table.prototype._build_cell = function(col, value, plain) {

	const td = document.createElement('td')

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
* Stream row rendering: batched DOM appends via requestAnimationFrame
* (single reflow per batch), retrying until the table is mounted
* @param object row
* @return void
*/
flat_table.prototype._enqueue_row = function(row) {

	this._row_queue.push(row)
	this._process_queue()
}//end _enqueue_row



/**
* _PROCESS_QUEUE
* @return void
*/
flat_table.prototype._process_queue = function() {

	const self = this

	if (self._is_processing) {
		return
	}
	self._is_processing = true

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
			const batch		= self._row_queue.splice(0, BATCH_SIZE)
			const fragment	= document.createDocumentFragment()
			for (const row of batch) {
				fragment.appendChild( self.render_row(row, false) )
			}
			self.node.appendChild(fragment)
			try_process()
		})
	}

	try_process()
}//end _process_queue



/**
* RESOLVE_MEDIA_URL
* Prefix the current origin on local media URLs, keep external ones
* (same rule the legacy view applied client-side)
* @param string url
* @return string
*/
export const resolve_media_url = function(url) {

	if (!url || !url.length) {
		return ''
	}

	return url.indexOf('http')===0
		? url
		: window.location.origin + url
}//end resolve_media_url



// @license-end

// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals*/
/*eslint no-undef: "error"*/



/**
 * CONVERSATION_STORE
 * Multi-thread persistence for tool_assistant chat in localStorage.
 * Namespaced per Dédalo entity. Caps thread count and per-thread length
 * to keep storage bounded.
 */

const STORAGE_PREFIX	= 'dedalo_assistant_threads_v1::'
const MAX_THREADS		= 25
const MAX_MESSAGES		= 200



export const conversation_store = class conversation_store {



	constructor() {
		this._entity = (typeof page_globals !== 'undefined' && page_globals && page_globals.dedalo_entity)
			? String(page_globals.dedalo_entity)
			: 'default'
		this._key = STORAGE_PREFIX + this._entity
	}//end constructor



	/**
	 * Read full state blob (always returns a valid object).
	 * @return {{active_id:string|null, threads:object}}
	 */
	_read() {
		try {
			const raw = window.localStorage.getItem(this._key)
			if (!raw) return { active_id: null, threads: {} }
			const data = JSON.parse(raw)
			if (!data || typeof data !== 'object' || !data.threads) {
				return { active_id: null, threads: {} }
			}
			return data
		} catch(e) {
			return { active_id: null, threads: {} }
		}
	}//end _read



	_write(data) {
		try {
			window.localStorage.setItem(this._key, JSON.stringify(data))
		} catch(e) {
			console.warn('[conversation_store] write failed:', e.message)
		}
	}//end _write



	/**
	 * Returns thread metadata sorted by updated_at desc (no messages payload).
	 * @return {Array<{id:string, title:string, created_at:number, updated_at:number, msg_count:number}>}
	 */
	list() {
		const data = this._read()
		return Object.values(data.threads)
			.map(function(t) {
				return {
					id			: t.id,
					title		: t.title || '(untitled)',
					created_at	: t.created_at,
					updated_at	: t.updated_at,
					msg_count	: Array.isArray(t.messages) ? t.messages.length : 0
				}
			})
			.sort(function(a, b) { return b.updated_at - a.updated_at })
	}//end list



	get_active_id() {
		return this._read().active_id
	}//end get_active_id



	get(id) {
		const data = this._read()
		return data.threads[id] || null
	}//end get



	/**
	 * Persist full message list for a thread; updates title from first user msg.
	 * Creates the thread if missing. Trims to MAX_MESSAGES.
	 */
	save(id, messages) {

		if (!id || !Array.isArray(messages)) return

		const data = this._read()
		const now = Date.now()
		let trimmed = messages

		if (trimmed.length > MAX_MESSAGES) {
			trimmed = trimmed.slice(-MAX_MESSAGES)
		}

		const existing = data.threads[id]
		const title = conversation_store._title_from_messages(trimmed)
			|| (existing && existing.title)
			|| '(untitled)'

		data.threads[id] = {
			id			: id,
			title		: title,
			created_at	: existing ? existing.created_at : now,
			updated_at	: now,
			messages	: trimmed
		}

		this._enforce_thread_cap(data)
		this._write(data)
	}//end save



	/**
	 * Create a new empty thread, set it active, return its id.
	 */
	create() {
		const data = this._read()
		const now = Date.now()
		const id = 'thr_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8)
		data.threads[id] = {
			id			: id,
			title		: '(new conversation)',
			created_at	: now,
			updated_at	: now,
			messages	: []
		}
		data.active_id = id
		this._enforce_thread_cap(data)
		this._write(data)
		return id
	}//end create



	delete(id) {
		const data = this._read()
		if (!data.threads[id]) return
		delete data.threads[id]
		if (data.active_id === id) {
			const remaining = Object.values(data.threads)
				.sort(function(a, b) { return b.updated_at - a.updated_at })
			data.active_id = remaining.length > 0 ? remaining[0].id : null
		}
		this._write(data)
	}//end delete



	set_active(id) {
		const data = this._read()
		if (!data.threads[id]) return
		data.active_id = id
		this._write(data)
	}//end set_active



	_enforce_thread_cap(data) {
		const ids_by_age = Object.values(data.threads)
			.sort(function(a, b) { return a.updated_at - b.updated_at })
			.map(function(t) { return t.id })
		while (ids_by_age.length > MAX_THREADS) {
			const drop = ids_by_age.shift()
			if (drop && drop !== data.active_id) {
				delete data.threads[drop]
			}
		}
	}//end _enforce_thread_cap



	static _title_from_messages(messages) {
		const first_user = messages.find(function(m) { return m.role === 'user' })
		if (!first_user || typeof first_user.content !== 'string') return ''
		const t = first_user.content.replace(/\s+/g, ' ').trim()
		return t.length > 60 ? t.substring(0, 60) + '…' : t
	}//end _title_from_messages



}//end conversation_store

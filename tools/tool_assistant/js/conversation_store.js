// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals*/
/*eslint no-undef: "error"*/



/**
 * CONVERSATION_STORE
 * Multi-thread persistence for tool_assistant chat conversations in localStorage.
 *
 * Each instance is scoped to the Dédalo entity read from `page_globals.dedalo_entity`
 * so that installations sharing a browser (different subpaths) do not mix threads.
 * The full state is a single JSON blob stored under a versioned key
 * (`dedalo_assistant_threads_v1::<entity>`), making migrations straightforward:
 * bump the suffix and old data is simply ignored without a migration step.
 *
 * Bounds enforced:
 *   - MAX_THREADS  (25): oldest-by-updated_at threads are dropped when exceeded.
 *     The active thread is never silently deleted by the cap.
 *   - MAX_MESSAGES (200): oldest messages are trimmed from the tail when a save
 *     would exceed the limit (recent 200 kept).
 *
 * Primary consumer: `ai_assistant` in `ai_assistant.js`, which creates one
 * instance at construction time (`this._store = new conversation_store()`) and
 * calls save() after every assistant turn, plus list/get/create/delete/set_active
 * in response to UI actions.
 *
 * Blob shape stored in localStorage:
 * {
 *   active_id : string | null,
 *   threads   : {
 *     [id: string]: {
 *       id         : string,
 *       title      : string,
 *       created_at : number,   // Unix ms
 *       updated_at : number,   // Unix ms
 *       messages   : Array     // OpenAI-style {role, content} objects
 *     }
 *   }
 * }
 */

const STORAGE_PREFIX	= 'dedalo_assistant_threads_v1::'
const MAX_THREADS		= 25
const MAX_MESSAGES		= 200



export const conversation_store = class conversation_store {



	/**
	 * CONSTRUCTOR
	 * Resolves the storage key for this browser session from the Dédalo entity.
	 * Falls back to 'default' when `page_globals` is not yet available or has no
	 * `dedalo_entity` value, so the store is always safe to instantiate at module
	 * load time regardless of page_globals readiness.
	 */
	constructor() {
		// Resolve the entity name that scopes this store's localStorage key.
		// page_globals is an AMD/browser global injected by Dédalo's PHP renderer.
		this._entity = (typeof page_globals !== 'undefined' && page_globals && page_globals.dedalo_entity)
			? String(page_globals.dedalo_entity)
			: 'default'
		// Full localStorage key, e.g. "dedalo_assistant_threads_v1::my_entity".
		// The v1 suffix allows a future migration to a new schema without touching old data.
		this._key = STORAGE_PREFIX + this._entity
	}//end constructor



	/**
	 * _READ
	 * Read and parse the full state blob from localStorage.
	 * Always returns a structurally valid object — never throws and never returns null.
	 * Callers can safely destructure `{ active_id, threads }` unconditionally.
	 *
	 * Failure modes handled silently:
	 *   - Key absent  → returns empty state.
	 *   - Malformed JSON → JSON.parse throws; caught, returns empty state.
	 *   - Parsed value is not an object with a `threads` map → returns empty state.
	 *
	 * @returns {{active_id: string|null, threads: Object}} parsed state blob
	 */
	_read() {
		try {
			const raw = window.localStorage.getItem(this._key)
			if (!raw) return { active_id: null, threads: {} }
			const data = JSON.parse(raw)
			// Guard against storage corruption: ensure we have the expected shape.
			if (!data || typeof data !== 'object' || !data.threads) {
				return { active_id: null, threads: {} }
			}
			return data
		} catch(e) {
			return { active_id: null, threads: {} }
		}
	}//end _read



	/**
	 * _WRITE
	 * Serialize and persist the full state blob to localStorage.
	 * Logs a warning on quota-exceeded or other write errors rather than throwing,
	 * so callers do not need try/catch. A failed write degrades gracefully — the
	 * in-memory conversation keeps working; persistence is simply lost for that turn.
	 *
	 * @param {Object} data - the full state blob `{ active_id, threads }` to persist
	 * @returns {void}
	 */
	_write(data) {
		try {
			window.localStorage.setItem(this._key, JSON.stringify(data))
		} catch(e) {
			// Most likely cause: localStorage quota exceeded.
			// A warning is sufficient — the caller's in-memory state remains usable.
			console.warn('[conversation_store] write failed:', e.message)
		}
	}//end _write



	/**
	 * LIST
	 * Returns metadata for all stored threads, sorted newest-first by `updated_at`.
	 * The `messages` array is intentionally excluded from the result to keep the
	 * list lightweight for sidebar rendering (no need to deserialize full histories).
	 *
	 * @returns {Array<{id: string, title: string, created_at: number, updated_at: number, msg_count: number}>}
	 *   array of thread summaries, sorted descending by updated_at
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
					// Expose message count without handing the caller the full array.
					msg_count	: Array.isArray(t.messages) ? t.messages.length : 0
				}
			})
			.sort(function(a, b) { return b.updated_at - a.updated_at })
	}//end list



	/**
	 * GET_ACTIVE_ID
	 * Returns the id of the thread that was last made active, or null if none.
	 * Does not validate that the id still exists in threads (callers should guard).
	 *
	 * @returns {string|null} the active thread id, or null
	 */
	get_active_id() {
		return this._read().active_id
	}//end get_active_id



	/**
	 * GET
	 * Returns the full thread object for the given id, including its `messages` array,
	 * or null when the id is not found.
	 * Used by `ai_assistant` to restore a thread's conversation history when switching
	 * to an existing thread or resuming the active thread on startup.
	 *
	 * @param {string} id - thread id to retrieve
	 * @returns {Object|null} the stored thread object, or null if not found
	 */
	get(id) {
		const data = this._read()
		return data.threads[id] || null
	}//end get



	/**
	 * SAVE
	 * Persist the full message list for a thread; creates the thread record if it
	 * does not yet exist (upsert). Updates `updated_at` on every call.
	 *
	 * Title derivation: the first user message (up to 60 chars) becomes the thread
	 * title. If no user message is present yet the existing title is preserved; for
	 * brand-new threads with no prior title the fallback '(untitled)' is used.
	 *
	 * Enforces MAX_MESSAGES by slicing the OLDEST messages off the front, keeping
	 * only the most recent 200. This means early context may be lost for very long
	 * conversations — the trade-off is bounded storage.
	 *
	 * After updating the thread, `_enforce_thread_cap` is called to evict the
	 * oldest thread(s) if the total count exceeds MAX_THREADS.
	 *
	 * @param {string} id       - thread id to save into
	 * @param {Array}  messages - full conversation message array (OpenAI {role, content} objects)
	 * @returns {void}
	 */
	save(id, messages) {

		if (!id || !Array.isArray(messages)) return

		const data = this._read()
		const now = Date.now()
		let trimmed = messages

		// Trim the oldest messages when the conversation exceeds MAX_MESSAGES.
		// We keep the TAIL (most recent) rather than the head, so the active context
		// window is preserved even if very early messages are lost.
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
			// Preserve the original creation timestamp for threads being updated.
			created_at	: existing ? existing.created_at : now,
			updated_at	: now,
			messages	: trimmed
		}

		this._enforce_thread_cap(data)
		this._write(data)
	}//end save



	/**
	 * CREATE
	 * Create a new empty thread, mark it as the active thread, and return its id.
	 * The id is a compact random string prefixed with 'thr_' and the current
	 * timestamp in base-36, giving uniqueness within a session without a UUID library.
	 *
	 * After insertion, the thread cap is enforced so that creating many threads in
	 * quick succession cannot grow storage unboundedly.
	 *
	 * @returns {string} the id of the newly created thread
	 */
	create() {
		const data = this._read()
		const now = Date.now()
		// Build a compact collision-resistant id: base-36 timestamp + 6 random chars.
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



	/**
	 * DELETE
	 * Remove a thread by id. If the deleted thread was the active thread,
	 * automatically promotes the next most-recently-updated thread as active,
	 * or sets active_id to null if no threads remain.
	 * Silently ignores deletes for ids that do not exist.
	 *
	 * @param {string} id - thread id to delete
	 * @returns {void}
	 */
	delete(id) {
		const data = this._read()
		if (!data.threads[id]) return
		delete data.threads[id]
		// If we just deleted the active thread, promote the next newest one.
		if (data.active_id === id) {
			const remaining = Object.values(data.threads)
				.sort(function(a, b) { return b.updated_at - a.updated_at })
			data.active_id = remaining.length > 0 ? remaining[0].id : null
		}
		this._write(data)
	}//end delete



	/**
	 * SET_ACTIVE
	 * Mark the given thread as the active thread.
	 * Silently ignores the call when `id` does not correspond to an existing thread,
	 * preventing a stale active_id from being persisted.
	 *
	 * @param {string} id - thread id to activate
	 * @returns {void}
	 */
	set_active(id) {
		const data = this._read()
		if (!data.threads[id]) return
		data.active_id = id
		this._write(data)
	}//end set_active



	/**
	 * _ENFORCE_THREAD_CAP
	 * Evict the oldest thread(s) from `data.threads` (mutating the argument in place)
	 * until the thread count is at or below MAX_THREADS.
	 *
	 * Sort order: ascending by `updated_at` so the least-recently-used thread is at
	 * the front and is shifted off first. The currently active thread is protected
	 * from eviction — if it happens to be the oldest it is skipped and the next
	 * oldest is dropped instead.
	 *
	 * (!) This mutates `data` in place but does NOT call `_write` — callers are
	 * responsible for persisting afterwards. This keeps it a pure data transformation
	 * that callers (save, create) can batch with their own write.
	 *
	 * @param {Object} data - the full state blob `{ active_id, threads }` to trim
	 * @returns {void}
	 */
	_enforce_thread_cap(data) {
		// Sort oldest-first so shift() always removes the least-recently-updated thread.
		const ids_by_age = Object.values(data.threads)
			.sort(function(a, b) { return a.updated_at - b.updated_at })
			.map(function(t) { return t.id })
		while (ids_by_age.length > MAX_THREADS) {
			const drop = ids_by_age.shift()
			// Never silently evict the active thread — it would confuse the UI.
			if (drop && drop !== data.active_id) {
				delete data.threads[drop]
			}
		}
	}//end _enforce_thread_cap



	/**
	 * _TITLE_FROM_MESSAGES
	 * Derive a human-readable thread title from a conversation message array.
	 * Uses the text of the first message whose `role` is 'user', truncated to
	 * 60 characters with an ellipsis (…) appended when truncation occurs.
	 * Collapses internal whitespace so multi-line prompts produce a clean one-liner.
	 *
	 * Returns an empty string when no suitable user message is found (e.g. the
	 * conversation only contains system or assistant messages so far), allowing
	 * callers to fall back to a stored or default title.
	 *
	 * @param {Array} messages - array of {role: string, content: string} objects
	 * @returns {string} derived title, or empty string if no user message is found
	 */
	static _title_from_messages(messages) {
		const first_user = messages.find(function(m) { return m.role === 'user' })
		if (!first_user || typeof first_user.content !== 'string') return ''
		// Normalize whitespace before truncating so newlines don't appear mid-title.
		const t = first_user.content.replace(/\s+/g, ' ').trim()
		return t.length > 60 ? t.substring(0, 60) + '…' : t
	}//end _title_from_messages



}//end conversation_store

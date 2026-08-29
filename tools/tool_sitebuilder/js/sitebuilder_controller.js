// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global window*/
/*eslint no-undef: "error"*/



// imports
	import { builder_stream } from './builder_stream.js'
	// markdown.render: the module's ONE export is the `markdown` namespace object
	// (markdown.js has never exported a bare `render_markdown`, so the old named
	// import was a hard ES-module load error that took the whole controller down).
	import { markdown } from './markdown.js'
	import { request_failed, response_data } from '../../../core/common/js/api_error.js'
	import { handle_api_error } from '../../../core/common/js/error_dispatch.js'
	import { error_text } from '../../../core/common/js/render_api_error.js'
	import { register_error_policy } from '../../../core/common/js/error_policy.js'



// ERROR POLICY. Every site_builder.* failure is about THIS tool's own workspace,
// and the tool owns a full-width pane the user is already looking at — so the
// message belongs inside that pane, not in a page-corner bubble that disappears
// while the operator is reading the chat log. The core codes are untouched: a
// mid-run auth.not_logged still raises the relogin overlay.
//
// The six `site_builder_*` UNDERSCORE aliases are GONE: the engine proxy refuses
// by throwing the registered dotted codes (tools/tool_sitebuilder/server/index.ts
// siteBuilderFailure / siteBuilderRejected), and its own terminal stream frame
// now names `site_builder.stream_lost` (same file, sessionStream's pull catch) —
// so every one of them matches `site_builder.*` on the dot.
//
// ONE non-registry token still reaches this client, and it is NOT a site_builder
// one: the DAEMON's own SSE writer emits `event: error` with
// `{code:'replay_failed'}` (publication/site_builder/src/sessions/sse.ts) when it
// cannot replay a session's backlog, and the engine relays that stream
// byte-for-byte. The daemon is outside the engine's registry by design (an
// isolated subsystem), so the token has no dot to match on and needs its own row
// — without it a lost backlog would toast in a corner instead of appearing in the
// pane the operator is reading. REMOVAL: when the daemon frame carries a
// registered code.
register_error_policy({
	'site_builder.*'	: {action:'inline'},
	'replay_failed'		: {action:'inline'}
})



/**
 * SITEBUILDER_CONTROLLER
 * The client state machine for the site-builder workspace: it owns the selected site, the
 * active session, and the DOM of the three panes (sites list, chat, preview), and it is
 * the single place that calls the server (through the tool instance's `tool_request`).
 *
 * All server calls go through one tool_request envelope (dd_tools_api → tool_sitebuilder),
 * so the engine attaches the bearer token and the acting user before proxying to the
 * daemon. The chat stream is the exception — it is an SSE fetch (builder_stream.js).
 *
 * The controller holds NO durable state of its own: sites and sessions live on the daemon.
 * On boot it asks get_status, then list_sites, and renders whatever the server reports.
 *
 * @param {Object} tool  the tool_sitebuilder instance (provides tool_request + get_label)
 * @param {Object} nodes {root, sites, chat, preview}
 */
export const sitebuilder_controller = function(tool, nodes) {

	this.tool			= tool
	this.nodes			= nodes
	this.sites			= []
	this.selected		= null   // slug
	this.session_id		= null
	this.can_publish	= false
	this.stream_abort	= null
	this.building		= false
}



/**
 * REQUEST
 * One tool_request round-trip. Returns the API envelope: `request_failed(res)` is THE
 * failure test and `res.error` is the ApiError (api_error.js) carrying the registry code.
 */
sitebuilder_controller.prototype.request = async function(action, options) {

	const self = this
	return self.tool.tool_request({ action: action, options: options || {} })
}//end request



/**
 * REPORT
 * Route a failed envelope through the ONE dispatcher. No local code→prose map: the
 * message comes from the registry label (render_api_error), and the SURFACE from the
 * policy registered above (inline, in this tool's chat pane).
 *
 * @param {Object} api_response - a failed envelope (request_failed(api_response)===true)
 * @returns {Promise<Object>} {recovered, action}
 */
sitebuilder_controller.prototype.report = function(api_response) {

	const self = this
	return handle_api_error(api_response.error, {
		wrapper	: self.chat_log || self.nodes.root,
		scope	: 'tool_sitebuilder'
	})
}//end report



/**
 * BOOT
 * Ask the daemon (via the engine) whether it is reachable and whether this user may
 * publish, then load the site list. A daemon that is unconfigured or unreachable renders a
 * single empty-state message instead of the workspace.
 */
sitebuilder_controller.prototype.boot = async function() {

	const self = this

	const status = await self.request('get_status', {})
	if (request_failed(status)) {
		return self.render_empty_state(error_text(status.error))
	}
	const value = response_data(status) || {}
	// STATE, not error: the daemon answered, and what it answered is "there is
	// nothing to build against". Prose, not a code.
	if (value.configured === false) return self.render_empty_state(self.label('sitebuilder_unconfigured', 'The site builder is not configured on this server.'))
	if (value.reachable === false) return self.render_empty_state(self.label('sitebuilder_unreachable', 'The site builder service is not reachable right now.'))

	self.can_publish = value.can_publish === true
	await self.refresh_sites()
}//end boot



/**
 * REFRESH_SITES
 * Reload the site list and repaint the left pane, preserving the current selection.
 */
sitebuilder_controller.prototype.refresh_sites = async function() {

	const self = this

	const res = await self.request('list_sites', {})
	if (request_failed(res)) return self.report(res)
	self.sites = response_data(res)?.data || []
	self.render_sites()
}//end refresh_sites



/**
 * RENDER_SITES
 * Left pane: a "New site" control and a selectable list of every site (collaborative —
 * all sites are visible and editable by any granted user).
 */
sitebuilder_controller.prototype.render_sites = function() {

	const self	= this
	const pane	= self.nodes.sites
	pane.replaceChildren()

	// New-site control.
	const create = document.createElement('div')
	create.className = 'sb_create'
	const slug_input = document.createElement('input')
	slug_input.type = 'text'
	slug_input.placeholder = 'my-site'
	slug_input.className = 'sb_slug_input'
	const name_input = document.createElement('input')
	name_input.type = 'text'
	name_input.placeholder = self.label('sitebuilder_new_site', 'New site')
	name_input.className = 'sb_name_input'
	// THE DOMAIN. Required by the server: it is what pairs the site with the web space the
	// administrator provisioned for that hostname, and no rule turns a slug into a domain
	// (it needs DNS, a web-server entry and a certificate). A hint, not a picker: the
	// hostnames a server is provisioned for are not something this tool can enumerate.
	const domain_input = document.createElement('input')
	domain_input.type = 'text'
	domain_input.placeholder = 'www.example.org'
	domain_input.className = 'sb_domain_input'
	const create_btn = document.createElement('button')
	create_btn.textContent = '+'
	create_btn.title = self.label('sitebuilder_new_site', 'New site')
	create_btn.addEventListener('click', () =>
		self.create_site(slug_input.value, name_input.value, domain_input.value)
	)
	create.append(slug_input, name_input, domain_input, create_btn)
	pane.appendChild(create)

	// Site list.
	const list = document.createElement('ul')
	list.className = 'sb_site_list'
	for (const site of self.sites) {
		const manifest = site.manifest || {}
		const li = document.createElement('li')
		li.className = 'sb_site' + (manifest.slug === self.selected ? ' is_selected' : '')
		const label = document.createElement('span')
		label.className = 'sb_site_name'
		label.textContent = manifest.name || manifest.slug
		const state = document.createElement('span')
		state.className = 'sb_site_state'
		state.textContent = site.session && site.session.state === 'running' ? '●' : ''
		li.append(label, state)
		li.addEventListener('click', () => self.select_site(manifest.slug))
		list.appendChild(li)
	}
	pane.appendChild(list)
}//end render_sites



/**
 * CREATE_SITE
 * Create a site (create_site action), then reload the list and select the new one so the
 * user lands straight in its workspace. Slug, name and DOMAIN are all required
 * client-side; the server validates all three again, and the domain a third time against
 * the sites its administrator has actually provisioned.
 */
sitebuilder_controller.prototype.create_site = async function(slug, name, domain) {

	const self = this
	if (!slug || !name || !domain) return self.toast('A slug, a name and a domain are required.')
	const res = await self.request('create_site', {
		slug	: slug.trim(),
		name	: name.trim(),
		domain	: domain.trim().toLowerCase()
	})
	if (request_failed(res)) return self.report(res)
	await self.refresh_sites()
	self.select_site(slug.trim())
}//end create_site



/**
 * SELECT_SITE
 * Switch the workspace to a site. Clears the previous session and tears down any live
 * stream first (a leftover stream would keep writing into the new site's chat log), then
 * repaints the three panes and loads the site's preview + session history.
 */
sitebuilder_controller.prototype.select_site = async function(slug) {

	const self = this
	self.selected = slug
	self.session_id = null
	self.abort_stream()
	self.render_sites()
	self.render_chat_shell()
	await self.load_preview()
	await self.load_history()
}//end select_site



/**
 * DELETE_SITE
 * Delete the selected site (delete_site action) after a blocking confirm. On success the
 * selection is cleared and the chat/preview panes are emptied — the site no longer exists.
 */
sitebuilder_controller.prototype.delete_site = async function() {

	const self = this
	if (!self.selected) return
	// eslint-disable-next-line no-alert
	if (!window.confirm('Delete site "' + self.selected + '"? This cannot be undone.')) return
	const res = await self.request('delete_site', { slug: self.selected })
	if (request_failed(res)) return self.report(res)
	self.selected = null
	await self.refresh_sites()
	self.nodes.chat.replaceChildren()
	self.nodes.preview.replaceChildren()
}//end delete_site



/**
 * RENDER_CHAT_SHELL
 * Center pane: a message log, a composer with send/stop, and a build button. Reused across
 * selection changes; the log is repopulated by load_history and the live stream.
 */
sitebuilder_controller.prototype.render_chat_shell = function() {

	const self	= this
	const pane	= self.nodes.chat
	pane.replaceChildren()
	if (!self.selected) return

	const log = document.createElement('div')
	log.className = 'sb_chat_log'
	self.chat_log = log

	const composer = document.createElement('div')
	composer.className = 'sb_composer'
	const textarea = document.createElement('textarea')
	textarea.placeholder = 'Describe the site or the change you want…'
	textarea.className = 'sb_prompt'
	self.prompt_input = textarea

	const send = document.createElement('button')
	send.textContent = 'Send'
	send.className = 'sb_send'
	send.addEventListener('click', () => self.send())

	const stop = document.createElement('button')
	stop.textContent = 'Stop'
	stop.className = 'sb_stop'
	stop.disabled = true
	stop.addEventListener('click', () => self.stop())
	self.stop_btn = stop

	const build = document.createElement('button')
	build.textContent = self.label('sitebuilder_build', 'Build')
	build.className = 'sb_build'
	build.addEventListener('click', () => self.run_build())

	const del = document.createElement('button')
	del.textContent = 'Delete site'
	del.className = 'sb_delete'
	del.addEventListener('click', () => self.delete_site())

	composer.append(textarea, send, stop, build, del)
	pane.append(log, composer)
}//end render_chat_shell



/**
 * LOAD_HISTORY
 * Fetch the site's past sessions (session_history) and note how many exist. It does NOT
 * replay their events — the live stream only opens for a session the user starts or
 * continues; a full past-session browser is a later refinement.
 */
sitebuilder_controller.prototype.load_history = async function() {

	const self = this
	if (!self.selected) return
	const res = await self.request('session_history', { slug: self.selected })
	if (request_failed(res)) return
	// The most recent session's events are streamed on demand; here we only show that a
	// history exists. A full past-session browser is a later refinement.
	const sessions = response_data(res)?.data || []
	if (sessions.length > 0 && self.chat_log) {
		const note = document.createElement('div')
		note.className = 'sb_history_note'
		note.textContent = sessions.length + ' previous session(s).'
		self.chat_log.appendChild(note)
	}
}//end load_history



/**
 * SEND
 * Start a new session for the selected site with the composer's prompt, then open the SSE
 * stream and render events as they arrive.
 */
sitebuilder_controller.prototype.send = async function() {

	const self = this
	if (!self.selected) return
	const prompt = (self.prompt_input.value || '').trim()
	if (!prompt) return

	self.append_user(prompt)
	self.prompt_input.value = ''

	let res
	if (self.session_id) {
		res = await self.request('session_message', { session_id: self.session_id, message: prompt })
	} else {
		res = await self.request('session_start', { slug: self.selected, prompt: prompt })
		const started = response_data(res)
		if (started && started.session_id) self.session_id = started.session_id
	}
	if (request_failed(res)) return self.report(res)

	self.open_stream()
}//end send



/**
 * OPEN_STREAM
 * Subscribe to the current session's event stream from seq 0 (replay + tail) and render
 * each event. Closes when the turn ends.
 */
sitebuilder_controller.prototype.open_stream = function() {

	const self = this
	if (!self.session_id) return
	self.abort_stream()
	self.stream_abort = new AbortController()
	self.set_running(true)

	builder_stream({
		options	: { session_id: self.session_id, after: -1 },
		signal	: self.stream_abort.signal,
		on_event: (stored) => self.render_event(stored.body),
		// on_error carries an ApiError (builder_stream.js): the dispatcher owns the
		// surface, so a session that died mid-build raises the relogin overlay
		// instead of a line in a chat log nobody can act on.
		on_error: async (api_error) => {
			self.set_running(false)
			await handle_api_error(api_error, {
				wrapper	: self.chat_log || self.nodes.root,
				scope	: 'tool_sitebuilder'
			})
		},
		on_done	: () => { self.set_running(false); self.load_preview() }
	})
}//end open_stream



/**
 * RENDER_EVENT
 * Turn one daemon StoredEvent body into a chat-log line. Each `body.type` maps to a styled
 * line; `text` is the exception — it is accumulated into a grouped agent block by
 * append_agent_text. An unknown type is ignored so a newer daemon can add event kinds
 * without breaking an older client.
 */
sitebuilder_controller.prototype.render_event = function(body) {

	const self = this
	if (!self.chat_log) return
	switch (body.type) {
		case 'turn_start':
			self.append_line('sb_turn', '— turn ' + body.turn + ' —')
			break
		case 'text':
			self.append_agent_text(body.text)
			break
		case 'tool':
			self.append_line('sb_tool', '⚙ ' + (body.summary || body.name))
			break
		case 'file_change':
			self.append_line('sb_files', '✎ ' + body.files.length + ' file(s): ' + body.files.slice(0, 6).join(', '))
			break
		case 'error':
			self.append_line('sb_error', '✖ ' + body.message)
			break
		case 'turn_end':
			self.append_line('sb_turn_end', body.state === 'idle' ? '✓ done' : ('■ ' + body.state))
			break
		default:
			break
	}
}//end render_event



/**
 * STOP
 * Interrupt the running turn: ask the daemon to stop (session_stop), then tear down the
 * local stream and re-enable the composer. Best-effort — we do not wait to confirm the
 * daemon actually halted before releasing the UI.
 */
sitebuilder_controller.prototype.stop = async function() {

	const self = this
	if (!self.session_id) return
	await self.request('session_stop', { session_id: self.session_id })
	self.abort_stream()
	self.set_running(false)
}//end stop



/**
 * RUN_BUILD
 * Trigger a build (build action) and start polling its outcome. The `building` flag guards
 * against a second concurrent build while one is in flight.
 */
sitebuilder_controller.prototype.run_build = async function() {

	const self = this
	if (!self.selected || self.building) return
	self.building = true
	self.append_line('sb_build_status', 'Building…')
	const res = await self.request('build', { slug: self.selected })
	if (request_failed(res)) { self.building = false; return self.report(res) }
	const build_id = response_data(res)?.build_id
	self.poll_build(build_id)
}//end run_build



/**
 * POLL_BUILD
 * Poll get_build every 1.5s until the outcome is no longer 'running'. On success it reloads
 * the preview cache-busted so the freshly built output is shown; on failure it writes the
 * error into the chat log. Self-rescheduling via setTimeout — there is no separate timer to
 * clear because each tick either reschedules itself or stops.
 */
sitebuilder_controller.prototype.poll_build = async function(build_id) {

	const self = this
	const res = await self.request('get_build', { slug: self.selected, build_id: build_id })
	const record = response_data(res) || {}
	if (record.outcome === 'running') {
		window.setTimeout(() => self.poll_build(build_id), 1500)
		return
	}
	self.building = false
	if (record.outcome === 'success') {
		self.append_line('sb_build_status', '✓ Built. Reloading preview…')
		await self.load_preview(true)
	} else {
		self.append_line('sb_error', '✖ Build failed: ' + (record.error || 'see log'))
	}
}//end poll_build



/**
 * LOAD_PREVIEW
 * Right pane: an iframe on the site's preprod URL, a reload/open control, and — for a
 * publisher — a Publish button with a confirm dialog.
 */
sitebuilder_controller.prototype.load_preview = async function(bust) {

	const self = this
	if (!self.selected) return
	const res = await self.request('preview', { slug: self.selected })
	if (request_failed(res)) return
	const preview = response_data(res) || {}

	const pane = self.nodes.preview
	pane.replaceChildren()

	const bar = document.createElement('div')
	bar.className = 'sb_preview_bar'
	const reload = document.createElement('button')
	reload.textContent = 'Reload'
	reload.addEventListener('click', () => self.load_preview(true))
	const open = document.createElement('a')
	open.textContent = 'Open ↗'
	open.target = '_blank'
	open.rel = 'noopener'
	open.href = preview.url || '#'
	bar.append(reload, open)

	if (self.can_publish) {
		const publish = document.createElement('button')
		publish.textContent = self.label('sitebuilder_publish', 'Publish')
		publish.className = 'sb_publish'
		publish.addEventListener('click', () => self.publish(preview.url))
		bar.appendChild(publish)
	}

	const frame = document.createElement('iframe')
	frame.className = 'sb_preview_frame'
	frame.setAttribute('sandbox', 'allow-scripts allow-same-origin')
	const src = preview.url || 'about:blank'
	frame.src = bust ? (src + (src.indexOf('?') === -1 ? '?' : '&') + 'v=' + Date.now()) : src

	pane.append(bar, frame)
}//end load_preview



/**
 * PUBLISH
 * Push the site live (publish action) after a blocking confirm that shows the public URL.
 * The button only exists when can_publish is true, but the server re-checks the publisher
 * gate and the confirm flag regardless — this dialog is UX, not the security boundary.
 */
sitebuilder_controller.prototype.publish = async function(url) {

	const self = this
	if (!self.selected) return
	// eslint-disable-next-line no-alert
	if (!window.confirm('Publish "' + self.selected + '" to production?\nIt will be public at:\n' + (url || ''))) return
	const res = await self.request('publish', { slug: self.selected, confirm: true })
	if (request_failed(res)) return self.report(res)
	self.toast('Published.')
}//end publish



// --- small helpers ---

/** Toggle the Stop button: enabled only while a turn is streaming. */
sitebuilder_controller.prototype.set_running = function(running) {

	const self = this
	if (self.stop_btn) self.stop_btn.disabled = !running
}//end set_running



/**
 * Tear down the live SSE stream if one is open. Aborting the AbortController closes the
 * fetch, which the engine's pass-through cancel() propagates upstream to the daemon leg.
 * Idempotent — safe to call when no stream is running.
 */
sitebuilder_controller.prototype.abort_stream = function() {

	const self = this
	if (self.stream_abort) { self.stream_abort.abort(); self.stream_abort = null }
}//end abort_stream



/**
 * Append one styled line to the chat log and scroll to it. Uses textContent (not innerHTML)
 * — these lines carry daemon-supplied text (tool summaries, file names, errors) and must
 * never be interpreted as markup. append_agent_text is the only path that renders HTML.
 */
sitebuilder_controller.prototype.append_line = function(cls, text) {

	const self = this
	if (!self.chat_log) return
	const line = document.createElement('div')
	line.className = 'sb_line ' + cls
	line.textContent = text
	self.chat_log.appendChild(line)
	self.chat_log.scrollTop = self.chat_log.scrollHeight
}//end append_line



/** Echo the user's own prompt into the log immediately, before the daemon answers. */
sitebuilder_controller.prototype.append_user = function(text) {

	const self = this
	if (!self.chat_log) return
	const line = document.createElement('div')
	line.className = 'sb_line sb_user'
	line.textContent = text
	self.chat_log.appendChild(line)
	self.chat_log.scrollTop = self.chat_log.scrollHeight
}//end append_user



/**
 * APPEND_AGENT_TEXT
 * Stream agent prose into the log. The daemon emits `text` in many small deltas; rather
 * than a line per delta, consecutive deltas are accumulated onto one block (its raw source
 * stashed in dataset.raw) and re-rendered as markdown on each arrival. The `:last-child`
 * selector is what breaks the grouping: once any other event appends a line the agent block
 * is no longer the last child, so the next text run opens a fresh block.
 */
sitebuilder_controller.prototype.append_agent_text = function(text) {

	const self = this
	if (!self.chat_log) return
	// Group consecutive agent text into one rendered block (see the docblock: the
	// :last-child selector is the grouping break).
	let block = self.chat_log.querySelector('.sb_agent:last-child')
	if (!block) {
		block = document.createElement('div')
		block.className = 'sb_line sb_agent'
		block.dataset.raw = ''
		self.chat_log.appendChild(block)
	}
	block.dataset.raw += text
	block.innerHTML = markdown.render(block.dataset.raw)
	self.chat_log.scrollTop = self.chat_log.scrollHeight
}//end append_agent_text



/**
 * RENDER_EMPTY_STATE
 * Replace the whole workspace with a single explanatory line when there is nothing to build
 * against. Takes the SENTENCE, never a code: the two callers are a state the daemon
 * reported (unconfigured / unreachable) and an ApiError already resolved through
 * `error_text` — the local code→prose map that used to live here is gone with the
 * server-side registry that owns those words now.
 *
 * textContent, never innerHTML: the sentence can carry the server's own message.
 *
 * @param {string} message
 */
sitebuilder_controller.prototype.render_empty_state = function(message) {

	const self = this
	self.nodes.root.replaceChildren()
	const box = document.createElement('div')
	box.className = 'sb_empty'
	box.textContent = message || 'The site builder is unavailable.'
	self.nodes.root.appendChild(box)
}//end render_empty_state



sitebuilder_controller.prototype.toast = function(text) {
	// Minimal, non-blocking notice. A richer notification surface is a later refinement.
	// eslint-disable-next-line no-console
	console.warn('[site_builder]', text)
	this.append_line('sb_notice', text)
}//end toast



/** Resolve a localized tool label by name, falling back to the given literal when absent. */
sitebuilder_controller.prototype.label = function(name, fallback) {

	const self = this
	if (self.tool && typeof self.tool.get_tool_label === 'function') {
		const value = self.tool.get_tool_label(name)
		if (value) return value
	}
	return fallback
}//end label

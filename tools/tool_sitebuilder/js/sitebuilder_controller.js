// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global window*/
/*eslint no-undef: "error"*/



// imports
	import { builder_stream } from './builder_stream.js'
	import { render_markdown } from './markdown.js'



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
 * One tool_request round-trip. Returns the parsed ToolResponse. A failure surfaces its
 * stable error code in `errors[0]`, which the caller maps to a message.
 */
sitebuilder_controller.prototype.request = async function(action, options) {

	const self = this
	return self.tool.tool_request({ action: action, options: options || {} })
}//end request



/**
 * BOOT
 * Ask the daemon (via the engine) whether it is reachable and whether this user may
 * publish, then load the site list. A daemon that is unconfigured or unreachable renders a
 * single empty-state message instead of the workspace.
 */
sitebuilder_controller.prototype.boot = async function() {

	const self = this

	const status = await self.request('get_status', {})
	if (status.result === false) {
		return self.render_empty_state(status.errors && status.errors[0])
	}
	const value = status.result || {}
	if (value.configured === false) return self.render_empty_state('site_builder_unconfigured')
	if (value.reachable === false) return self.render_empty_state('site_builder_unreachable')

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
	if (res.result === false) return self.toast(self.message_for(res.errors))
	self.sites = (res.result && res.result.data) || []
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
	const create_btn = document.createElement('button')
	create_btn.textContent = '+'
	create_btn.title = self.label('sitebuilder_new_site', 'New site')
	create_btn.addEventListener('click', () => self.create_site(slug_input.value, name_input.value))
	create.append(slug_input, name_input, create_btn)
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



sitebuilder_controller.prototype.create_site = async function(slug, name) {

	const self = this
	if (!slug || !name) return self.toast('A slug and a name are required.')
	const res = await self.request('create_site', { slug: slug.trim(), name: name.trim() })
	if (res.result === false) return self.toast(self.message_for(res.errors, res.msg))
	await self.refresh_sites()
	self.select_site(slug.trim())
}//end create_site



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



sitebuilder_controller.prototype.delete_site = async function() {

	const self = this
	if (!self.selected) return
	// eslint-disable-next-line no-alert
	if (!window.confirm('Delete site "' + self.selected + '"? This cannot be undone.')) return
	const res = await self.request('delete_site', { slug: self.selected })
	if (res.result === false) return self.toast(self.message_for(res.errors, res.msg))
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



sitebuilder_controller.prototype.load_history = async function() {

	const self = this
	if (!self.selected) return
	const res = await self.request('session_history', { slug: self.selected })
	if (res.result === false) return
	// The most recent session's events are streamed on demand; here we only show that a
	// history exists. A full past-session browser is a later refinement.
	const sessions = (res.result && res.result.data) || []
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
		if (res.result && res.result.session_id) self.session_id = res.result.session_id
	}
	if (res.result === false) return self.toast(self.message_for(res.errors, res.msg))

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
		on_error: (err) => { self.toast(err.message); self.set_running(false) },
		on_done	: () => { self.set_running(false); self.load_preview() }
	})
}//end open_stream



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



sitebuilder_controller.prototype.stop = async function() {

	const self = this
	if (!self.session_id) return
	await self.request('session_stop', { session_id: self.session_id })
	self.abort_stream()
	self.set_running(false)
}//end stop



sitebuilder_controller.prototype.run_build = async function() {

	const self = this
	if (!self.selected || self.building) return
	self.building = true
	self.append_line('sb_build_status', 'Building…')
	const res = await self.request('build', { slug: self.selected })
	if (res.result === false) { self.building = false; return self.toast(self.message_for(res.errors, res.msg)) }
	const build_id = res.result && res.result.build_id
	self.poll_build(build_id)
}//end run_build



sitebuilder_controller.prototype.poll_build = async function(build_id) {

	const self = this
	const res = await self.request('get_build', { slug: self.selected, build_id: build_id })
	const record = res.result || {}
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
	if (res.result === false) return
	const preview = res.result || {}

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



sitebuilder_controller.prototype.publish = async function(url) {

	const self = this
	if (!self.selected) return
	// eslint-disable-next-line no-alert
	if (!window.confirm('Publish "' + self.selected + '" to production?\nIt will be public at:\n' + (url || ''))) return
	const res = await self.request('publish', { slug: self.selected, confirm: true })
	if (res.result === false) return self.toast(self.message_for(res.errors, res.msg))
	self.toast('Published.')
}//end publish



// --- small helpers ---

sitebuilder_controller.prototype.set_running = function(running) {

	const self = this
	if (self.stop_btn) self.stop_btn.disabled = !running
}//end set_running



sitebuilder_controller.prototype.abort_stream = function() {

	const self = this
	if (self.stream_abort) { self.stream_abort.abort(); self.stream_abort = null }
}//end abort_stream



sitebuilder_controller.prototype.append_line = function(cls, text) {

	const self = this
	if (!self.chat_log) return
	const line = document.createElement('div')
	line.className = 'sb_line ' + cls
	line.textContent = text
	self.chat_log.appendChild(line)
	self.chat_log.scrollTop = self.chat_log.scrollHeight
}//end append_line



sitebuilder_controller.prototype.append_user = function(text) {

	const self = this
	if (!self.chat_log) return
	const line = document.createElement('div')
	line.className = 'sb_line sb_user'
	line.textContent = text
	self.chat_log.appendChild(line)
	self.chat_log.scrollTop = self.chat_log.scrollHeight
}//end append_user



sitebuilder_controller.prototype.append_agent_text = function(text) {

	const self = this
	if (!self.chat_log) return
	// Group consecutive agent text into one rendered block.
	let block = self.chat_log.querySelector('.sb_agent:last-child')
	if (!block || block.dataset.closed === 'true') {
		block = document.createElement('div')
		block.className = 'sb_line sb_agent'
		block.dataset.raw = ''
		self.chat_log.appendChild(block)
	}
	block.dataset.raw += text
	block.innerHTML = render_markdown(block.dataset.raw)
	self.chat_log.scrollTop = self.chat_log.scrollHeight
}//end append_agent_text



sitebuilder_controller.prototype.render_empty_state = function(code) {

	const self = this
	const messages = {
		site_builder_unconfigured	: 'The site builder is not configured on this server.',
		site_builder_unreachable	: 'The site builder service is not reachable right now.',
		site_builder_auth			: 'The site builder rejected this server. Check its configuration.'
	}
	self.nodes.root.replaceChildren()
	const box = document.createElement('div')
	box.className = 'sb_empty'
	box.textContent = messages[code] || 'The site builder is unavailable.'
	self.nodes.root.appendChild(box)
}//end render_empty_state



sitebuilder_controller.prototype.message_for = function(errors, fallback) {

	const messages = {
		site_builder_unconfigured	: 'The site builder is not configured.',
		site_builder_unreachable	: 'The site builder is not reachable.',
		site_builder_auth			: 'The site builder rejected this server.',
		site_builder_failed			: 'The site builder reported an error.'
	}
	const code = errors && errors[0]
	return (code && messages[code]) || fallback || 'The request failed.'
}//end message_for



sitebuilder_controller.prototype.toast = function(text) {
	// Minimal, non-blocking notice. A richer notification surface is a later refinement.
	// eslint-disable-next-line no-console
	console.warn('[site_builder]', text)
	this.append_line('sb_notice', text)
}//end toast



sitebuilder_controller.prototype.label = function(name, fallback) {

	const self = this
	if (self.tool && typeof self.tool.get_label === 'function') {
		const value = self.tool.get_label(name)
		if (value) return value
	}
	return fallback
}//end label

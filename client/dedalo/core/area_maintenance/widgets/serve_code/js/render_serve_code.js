// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {CHANNELS, section, fact_row, check_row, verdict, release_facts, channel_label} from '../../update_code/js/render_update_status.js'



/**
* RENDER_SERVE_CODE
* View layer of the serve_code widget: this installation as a CODE SERVER.
* Split out of update_code (2026-09-28) — the same split as serve_ontology.
*
* Layout: a role note, then the code-server readout (publish readiness, build
* source, one row per channel with its BUILD button beside the archive it
* writes, and what a consumer at this version is offered), then the response
* surface the build form reports into.
*
* Widget value shape (serve_code.ts getValue):
*   { is_a_code_server: boolean, code_server: Object|null }
* `code_server` is null on the development entity when it is not a code server:
* the panel then says which key makes it one, and offers no build.
*/
export const render_serve_code = function() {

	return true
}//end render_serve_code



/**
* LIST
* Entry point for both 'edit' and 'list' modes. `render_level` 'content' returns
* the content_data node only (widget_common.load repaint path).
* @param {Object} options
* @returns {Promise<HTMLElement>}
*/
render_serve_code.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* @param {Object} self - serve_code widget instance
* @returns {HTMLElement} content_data
*/
const get_content_data_edit = function(self) {

	const value = self.value || {}

	const content_data = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'content_data'
	})

	// role note
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_note serve_code_note',
			text_content	: value.code_server
				? (get_label.serve_code_note || 'This installation is a code server: it builds releases from GIT and serves them to the installations that ask it for updates.')
				: (get_label.serve_code_not_server || 'This installation is not a code server. Set IS_A_CODE_SERVER=true in ../private/.env and restart to build and serve releases.'),
			parent			: content_data
		})

	// body_response: the build form reports here (appended at the end)
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// the readout, re-rendered after every build
		const content_data_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'serve_code_body',
			parent			: content_data
		})
		// The readout lays out one row per channel and calls back to mount
		// the build action into it, so the button and the archive it writes
		// are one entry instead of two disconnected blocks.
		//
		// It is rendered through a function because a BUILD invalidates it:
		// the archive list, and what a consumer at this version is offered,
		// are both answers about the disk that the build just changed. The
		// pair is mutually recursive by design — the mounter needs the
		// refresh, the refresh needs a mounter built from the FRESH value —
		// and `refresh_code_server` is only ever read at call time.
		const render_code_server_half = (code_server, build_mark) => {
			while (content_data_body.firstChild) {
				content_data_body.removeChild(content_data_body.firstChild)
			}
			render_code_server_status(
				content_data_body,
				code_server,
				make_builder_mounter(self, body_response, code_server, refresh_code_server),
				build_mark
			)
		}
		// `build_mark` is {channel, previous} — the row whose button was just
		// pressed and the facts it showed BEFORE. It survives exactly one
		// render: the re-read below replaces the whole half, and without it
		// the new archive line appears in place of the old one with nothing
		// saying which of the two the operator is looking at.
		const refresh_code_server = async (build_mark) => {
			try {
				const fresh = await self.get_value()
				if (!fresh || !fresh.code_server) {
					return
				}
				// keep the instance coherent too: the next render reads self.value
				self.value = fresh
				render_code_server_half(fresh.code_server, build_mark)
			} catch (error) {
				// a failed refresh must never take the panel down: the build
				// already reported its own outcome in body_response
				console.error('serve_code: could not refresh the code-server readout', error)
			}
		}
		render_code_server_half(value.code_server)

	content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



/**
* RENDER_CODE_SERVER_STATUS
* The master half: can this instance publish, from which commit, what is
* already on disk, and what a consumer would actually be offered.
* @param {HTMLElement} parent
* @param {Object|null} code_server - value.code_server, null on a plain install
* @returns {HTMLElement|null}
*/
const render_code_server_status = function(parent, code_server, mount_builder, build_mark) {

	if (!code_server) return null

	const wrapper = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'update_status code_server_status',
		parent			: parent
	})

	// role + publish readiness
		const role = section(wrapper, get_label.serve_code_server_role || 'Code server')
		verdict(
			role.parentNode,
			code_server.ready===true,
			get_label.serve_code_publish_ready || 'Ready to publish',
			get_label.serve_code_publish_blocked || 'Cannot publish'
		)
		;(code_server.checks || []).forEach(check => check_row(role, check))

	// the tree releases are built FROM
		const source = code_server.source || {}
		const build_source = section(wrapper, get_label.serve_code_build_source || 'Build source')
		fact_row(build_source, get_label.update_code_check_git_dir || 'Git source directory', source.git_dir, true)
		fact_row(build_source, get_label.update_code_commit || 'Commit', source.head_sha, true)
		fact_row(build_source, get_label.update_code_current_build || 'Current build', source.head_date, true)
		fact_row(build_source, get_label.serve_code_head_branch || 'Checked-out branch', source.branch, true)
		fact_row(build_source, get_label.update_code_bun || 'Bun runtime', source.bun_pin, true)

	// THE RELEASE REF — what a published release is actually built from. It is
	// its own block because it is routinely NOT the checked-out branch, and the
	// publish checks above all read it: without these rows a red check on a
	// fix the operator just committed is unexplainable from the panel.
		const release = section(wrapper, get_label.serve_code_release_ref || 'Release ref')
		fact_row(release, get_label.serve_code_release_ref || 'Release ref', source.release_ref, true)
		fact_row(release, get_label.serve_code_release_commit || 'Release ref commit', source.release_sha, true)
		fact_row(release, get_label.serve_code_release_date || 'Release ref date', source.release_date, true)
		if (source.divergence) {
			const behind_row = fact_row(
				release,
				get_label.serve_code_behind || 'Commits not in the release ref',
				String(source.divergence.behind)
			)
			if (source.divergence.behind > 0) {
				const behind_value = behind_row.querySelector('.dd_v')
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'dd_badge pill_warning',
					text_content	: source.branch || 'HEAD',
					parent			: behind_value
				})
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'check_note',
					text_content	: get_label.update_code_note_release_ref_current || '',
					parent			: behind_value
				})
			}
		}

	// BUILD AND PUBLISH — ONE ENTRY PER CHANNEL: the action, and the archive
	// that action produces, on the same row.
	//
	// They were two blocks ('Code builders from GIT' below a 'Published
	// releases' list) and nothing on screen said the first writes the second —
	// nor which of two same-sized archives belonged to which button. The pairing
	// key is the version a build WOULD produce (source.release_version), so the
	// row shows the artifact that the button beside it would overwrite.
		const releases = code_server.releases || []
		const target_version = (code_server.source || {}).release_version || null
		const build = section(wrapper, get_label.serve_code_build_publish || 'Build and publish')
		CHANNELS.forEach(channel => {
			const row = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_row build_row',
				parent			: build
			})
			const action = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_k build_action',
				parent			: row
			})
			// THE ARTIFACT CELL IS CREATED BEFORE THE BUTTON IS MOUNTED, and is
			// handed to the mounter: while a build runs, the row that says what
			// is on disk is the row that has to say it is being rewritten. The
			// button's own spinner reports that the REQUEST is in flight; only
			// this cell can report that THIS artifact is the one changing.
			const value = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_v build_file',
				parent			: row
			})
			const built = releases.find(release =>
				release.channel===channel && (target_version===null || release.version===target_version)
			)
			if (mount_builder) {
				mount_builder(channel, action, value, built || null)
			} else {
				// no form builder on this page: name the channel anyway, so the
				// artifact below is still attributable
				action.textContent = channel_label(channel)
			}
			// the verdict belongs to the channel whose button was pressed
			const mark = (build_mark && build_mark.channel===channel) ? build_mark : null
			if (!built) {
				value.classList.add('none')
				value.textContent = get_label.update_code_not_built || 'Not built yet'
				return
			}
			release_facts(value, built, mark)
		})

	// Archives on disk for OTHER versions. They have no builder (a build always
	// produces the release ref's version), but hiding them would leave an
	// operator wondering where the disk space went — and a stale archive of a
	// neighbouring version is exactly what a manifest may still advertise.
		const others = releases.filter(release =>
			target_version!==null && release.version!==target_version
		)
		if (others.length) {
			const other_block = section(wrapper, get_label.serve_code_other_archives || 'Other archives on disk')
			others.forEach(release => {
				const row = fact_row(other_block, release.file, '', true)
				release_facts(row.querySelector('.dd_v'), release)
			})
		}

	// what a consumer is ACTUALLY offered — the gap operators cannot otherwise see
		const advertises = code_server.advertises || {files:[], rungs:[]}
		const offered = section(wrapper, get_label.serve_code_advertised || 'Offered to an installation at this version')
		// One row per REACHABLE consumer version. Asking only about the
		// master's OWN version was the least useful question available: a
		// master publishes releases AT its own version, so a correctly
		// operating one that had just published <v>.zip rendered
		// "No release is offered" — the panel reporting a fault in exactly the
		// steady state it exists to confirm — while a real museum, one or more
		// rungs behind, got an answer nobody could see.
		const rungs = (advertises.rungs && advertises.rungs.length)
			? advertises.rungs
			: [{for_version:advertises.for_version, files:advertises.files}]
		rungs.forEach(rung => {
			if (!rung.files.length) {
				fact_row(
					offered,
					rung.for_version,
					get_label.serve_code_note_advertised_empty || 'No release is offered.'
				)
				return
			}
			rung.files.forEach(file => fact_row(offered, `${rung.for_version} → ${file.version}`, file.url, true))
		})

	return wrapper
}//end render_code_server_status



/**
* MAKE_BUILDER_MOUNTER
* Builds the "mount a build button HERE" function the code-server readout uses.
*
* The buttons and the archives they produce used to be two separate blocks —
* 'Code builders from GIT' floating below a 'Published releases' list — so
* nothing on screen said that pressing the first writes the second. Now the
* readout owns the layout (one row per channel: the action and its artifact
* side by side) and calls back here to mount the action, which is the only part
* that needs the widget's wire machinery (`self.caller.init_form`).
*
* Two channels, and the difference is load-bearing:
*   - 'master' → `<v>.zip`     — the published release
*   - 'dev'    → `<v>-dev.zip` — a branch build; never overwrites the master
*                                 archive of the same version
*
* No cross-widget event on completion: a build writes an archive for OTHER
* installations and changes nothing this install runs, so no other panel has
* anything to refresh. (The 'build_code_done' publish it used to fire had no
* subscriber anywhere — removed 2026-09-28.)
*
* @param {Object} self - serve_code widget instance
* @param {HTMLElement} body_response - the response area passed to init_form
* @param {Object} code_server - value.code_server (its source.release_version
*   is THE version a build will produce; see below)
* @param {Function} [on_built] - called after a build finishes, so the readout
*   that lists the archives can re-read them: the row next to the button is a
*   claim about the disk, and a stale one is worse than none.
* @returns {Function|null} (channel, node) => void, or null when this page
*   provides no form builder
*/
const make_builder_mounter = function(self, body_response, code_server, on_built) {

	if (!self.caller?.init_form) {
		return null
	}

	// on_done. On build completion, execute this function
	const on_done = (build_mark) => {

		// COHERENCE: the archive list sitting beside these buttons was read
		// BEFORE the build. Leaving it is how a panel comes to show '7.0.0.zip ·
		// 16:25' next to a button that has just rewritten that very file — or
		// 'Not built yet' next to a build that succeeded.
		//
		// The mark rides along so the row that comes back can say WHICH of the
		// two values it is (see render_update_status.js release_facts).
		if (on_built) {
			on_built(build_mark)
		}
	}

	// version parts (shared by both confirm texts)
	// THE VERSION THE PUBLISH WILL ACTUALLY PRODUCE — the one the release
	// REF declares, which the server sends as source.release_version. The
	// running process's own version (page_globals.dedalo_version) is only a
	// fallback: naming the artifact after it is exactly the bug that let a
	// 7.0.0 master publish an uninstallable 7.0.0.zip, and it silently
	// mislabels every build made by a master left running across a bump.
	const ref_version	= code_server && code_server.source && code_server.source.release_version
	const ar_version	= String(ref_version || page_globals.dedalo_version).split('.')
	const major_version	= ar_version[0]
	const version		= [ar_version[0],ar_version[1],ar_version[2]].join('.')
	const release_dir	= `<DEDALO_CODE_FILES_DIR>/${major_version}/${ar_version[0]}.${ar_version[1]}/`

	// THE DEVELOPER CHANNEL'S REF IS THE SERVER'S CHECKED-OUT BRANCH. The
	// server sends it as source.branch; source.release_ref is the master
	// channel's ref, and a branch equal to it publishes nothing new.
	const source		= (code_server && code_server.source) || {}
	const release_ref	= source.release_ref || 'master'
	const dev_branch	= (source.branch && source.branch!==release_ref && source.branch!=='HEAD')
		? source.branch
		: null

	const channels = {
		master : {
			// the panel's main publishing action — filled (widget_kit .primary)
			button_class	: 'primary',
			submit_label	: get_label.serve_code_build_master || 'Build master release',
			confirm_text	: (get_label.serve_code_build_master_confirm || "A release of version %s will be created from branch 'master' as: %s")
				.replace('%s', version)
				.replace('%s', `\n\n${release_dir}${version}.zip\n`),
			branch			: 'master'
		},
		dev : {
			// secondary, but still unmistakably a control (see .build_action button)
			button_class	: 'light',
			submit_label	: get_label.serve_code_build_developer || 'Build developer release',
			// %branch% is NAMED, not positional: the branch appears in a
			// different place in each translated sentence, and a third '%s'
			// would land wherever that language happens to put it.
			confirm_text	: (get_label.serve_code_build_developer_confirm || "A developer release of version %s will be created from branch '%branch%' as: %s The master build of the same version is kept.")
				.replace('%s', version)
				.replace('%s', `\n\n${release_dir}${version}-dev.zip\n\n`)
				// LAST: a branch name may legally contain '%s', and substituting it
				// first would hand the positional pass a token of its own.
				.replaceAll('%branch%', String(dev_branch)),
			branch			: dev_branch
		}
	}

	return function(channel, node, artifact_cell, built_before) {

		const def = channels[channel]
		if (!def) {
			return
		}

		// A DEVELOPER BUILD IS A BUILD OF THE BRANCH THIS SERVER HAS CHECKED
		// OUT — never a branch name baked into the client. The hardcoded 'v7'
		// refused on every server that does not carry that branch ("Could not
		// read src/core/update/version.ts at ref 'v7'"). When HEAD IS the
		// release ref there is no development work to publish, and a
		// '<v>-dev.zip' that is byte-identical to the master build would be a
		// lie: the row says so instead of offering a button.
		if (channel==='dev' && !dev_branch) {
			node.classList.add('none')
			node.textContent = get_label.serve_code_build_developer_unavailable
				|| 'No developer branch: this code server has the release branch checked out'
			return
		}

		const form = self.caller.init_form({
			submit_label	: def.submit_label,
			confirm_text	: def.confirm_text,
			body_info		: node,
			body_response	: body_response,
			trigger : {
				dd_api	: 'dd_area_maintenance_api',
				action	: 'widget_request',
				source	: {
					type	: 'widget',
					model	: 'serve_code',
					action	: 'build_version_from_git_master'
				},
				options	: {
					branch : def.branch
				}
			},
			// the mark travels from the row that was pressed to the row that
			// comes back — captured HERE, at mount time, because the refresh
			// destroys this half before anything could read it back off the DOM.
			on_done : () => on_done({
				channel		: channel,
				previous	: built_before
					? { bytes : built_before.bytes, stamp : built_before.stamp }
					: null
			})
		})
		// build_form always emits `light button_submit`; the channel's own weight
		// is added here (it exposes the node for exactly this kind of reach-in).
		if (form && form.button_submit) {
			form.button_submit.classList.add('build_button', def.button_class)
		}

		// IN FLIGHT: say WHICH artifact is being rewritten, on the artifact.
		// The button's spinner reports that a request is running; it does not
		// say that the line beside it — the file name, the size, the date — is
		// about to stop being true. A build takes tens of seconds and rewrites
		// the file in place, so for that whole time the row states something
		// the operator cannot act on and cannot tell is stale.
		//
		// build_form's lifecycle is the hook: its submit handler runs the
		// window.confirm gate SYNCHRONOUSLY and only then adds `button_spinner`,
		// before its first await. A listener registered after it therefore runs
		// once the request is under way — and never when the operator cancelled
		// the confirm. Pinned by test/unit/client_update_code_render.test.ts.
		if (form && form.button_submit && artifact_cell) {
			form.addEventListener('submit', () => {
				if (!form.button_submit.classList.contains('button_spinner')) {
					return	// the confirm was declined: nothing is being built
				}
				artifact_cell.classList.add('building')
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'dd_badge pill_warning build_verdict',
					text_content	: get_label.serve_code_build_building || 'building…',
					parent			: artifact_cell
				})
			})
		}
	}
}//end make_builder_mounter



// @license-end

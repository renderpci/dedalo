// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_UPDATE_STATUS
* The update_code panel's STATUS half: what an operator needs to know before
* pressing a button that replaces the code tree, and — on a code master — before
* publishing a release other installations will install.
*
* It renders the two payload halves that `update_code.get_value` answers
* (server: core/update/status.ts):
*   value.consumer    — always present: readiness, provenance, last update,
*                       restore points.
*   value.code_server — only on a code server (null otherwise), so a plain
*                       install renders nothing for it and pays for nothing.
*
* THE CONTRACT WITH THE SERVER: the server sends check IDS and FACTS, never
* sentences. Every word here comes from the label catalog, keyed by check id
* (`update_code_check_<id>`), so a check the server adds tomorrow renders with
* its id until someone writes its label — visibly incomplete, never invented.
* Details are values (a path, a count, a version, an hour count) and are always
* set as TEXT, never HTML: several of them are operator-controlled paths.
*
* State vocabulary (mirrors StatusCheck.state): ok / warn / blocked / unknown.
* `blocked` means the update pipeline WILL refuse on this account — the panel's
* headline verdict is simply whether any check is blocked.
*/



/**
* STATE_CHIP
* One state pill, in the SHARED widget_kit severity vocabulary
* (`area_maintenance/css/widget_kit.less`: .dd_badge + pill_ok / pill_warning /
* pill_danger, calm by default and coloured only where action is needed). A
* parallel chip system local to this widget would drift from every other
* maintenance panel, so there is none — `unknown` is a plain, muted badge
* because "not decidable here" is information, not an alarm.
* @param {string} state - 'ok' | 'warn' | 'blocked' | 'unknown'
* @returns {HTMLElement}
*/
const state_chip = function(state) {

	const pills = {
		ok		: 'dd_badge pill_ok',
		warn	: 'dd_badge pill_warning',
		blocked	: 'dd_badge pill_danger',
		unknown	: 'dd_badge'
	}
	const words = {
		ok		: get_label.update_code_state_ok || 'ok',
		warn	: get_label.update_code_state_warn || 'warning',
		blocked	: get_label.update_code_state_blocked || 'blocked',
		unknown	: get_label.update_code_state_unknown || 'unknown'
	}

	return ui.create_dom_element({
		element_type	: 'span',
		class_name		: pills[state] || 'dd_badge',
		text_content	: words[state] || state
	})
}//end state_chip



/**
* SECTION
* A titled block inside the panel.
* @param {HTMLElement} parent
* @param {string} title
* @returns {HTMLElement} the block's body, ready to receive rows
*/
const section = function(parent, title) {

	const block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'status_block',
		parent			: parent
	})
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_eyebrow',
		text_content	: title,
		parent			: block
	})

	return ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_readout',
		parent			: block
	})
}//end section



/**
* FACT_ROW
* A plain key/value row (no state).
* @param {HTMLElement} parent
* @param {string} k
* @param {string|null} v
* @param {boolean} [mono]
* @returns {HTMLElement}
*/
const fact_row = function(parent, k, v, mono) {

	const row = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_row',
		parent			: parent
	})
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_k',
		text_content	: k,
		parent			: row
	})
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: mono ? 'dd_v mono' : 'dd_v',
		text_content	: (v===null || v===undefined || v==='') ? '—' : String(v),
		parent			: row
	})

	return row
}//end fact_row



/**
* CHECK_ROW
* One readiness line: label (by check id), state chip, and the server's fact.
* A `note` label — `update_code_note_<id>` — is rendered underneath, but ONLY
* when the check is not ok: an operator reading a green panel does not need the
* explanation of a failure that did not happen.
* @param {HTMLElement} parent
* @param {{id:string, state:string, detail:string|undefined}} check
* @returns {HTMLElement}
*/
const check_row = function(parent, check) {

	const row = ui.create_dom_element({
		element_type	: 'div',
		class_name		: `dd_row check_row state_${check.state}`,
		parent			: parent
	})

	// label by id — an unlabelled check shows its id rather than nothing
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_k',
		text_content	: get_label['update_code_check_' + check.id] || check.id,
		parent			: row
	})

	const value = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_v',
		parent			: row
	})
	value.appendChild(state_chip(check.state))

	// WHAT the check looked at, when the server says. Always rendered, not only
	// on a failure: on a code server the publish checks read the RELEASE ref,
	// never the branch the operator has checked out, and a red line whose scope
	// is invisible reads as a false alarm on work they have already committed.
	if (check.scope) {
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'check_scope',
			text_content	: `${get_label.update_code_scope || 'checked against'} ${check.scope}`,
			parent			: value
		})
	}

	if (check.detail!==undefined && check.detail!==null && check.detail!=='') {
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'check_detail mono',
			text_content	: String(check.detail),
			parent			: value
		})
	}

	// the why, only where it helps
	const note = get_label['update_code_note_' + check.id]
	if (note && check.state!=='ok') {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'check_note',
			text_content	: note,
			parent			: value
		})
	}

	return row
}//end check_row



/**
* VERDICT
* The headline line of a role: ready or blocked, as a chip.
* @param {HTMLElement} parent
* @param {boolean} ready
* @param {string} ok_label
* @param {string} bad_label
* @returns {HTMLElement}
*/
const verdict = function(parent, ready, ok_label, bad_label) {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: `status_verdict ${ready ? 'state_ok' : 'state_danger'}`,
		text_content	: ready ? ok_label : bad_label,
		parent			: parent
	})

	return node
}//end verdict



/**
* FORMAT_BYTES / FORMAT_STAMP
* Local, dependency-free formatting for the disk facts. Sizes come from the
* server as raw byte counts and timestamps as epoch ms, so the operator's own
* locale decides how they read.
*/
const format_bytes = function(bytes) {
	if (typeof bytes!=='number' || !isFinite(bytes)) return '—'
	const units = ['B','KB','MB','GB','TB']
	let n = bytes
	let i = 0
	while (n>=1024 && i<units.length-1) { n = n/1024; i++ }
	return `${n<10 && i>0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}
const format_stamp = function(ms) {
	if (!ms) return '—'
	try { return new Date(ms).toLocaleString() } catch (e) { return String(ms) }
}



/**
* RENDER_CONSUMER_STATUS
* The half every installation has: what is running, whether it can take an
* update, what happened last time, and what it could roll back to.
* @param {HTMLElement} parent
* @param {Object} consumer - value.consumer (core/update/status.ts ConsumerStatus)
* @returns {HTMLElement|null}
*/
export const render_consumer_status = function(parent, consumer) {

	if (!consumer) return null

	const wrapper = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'update_status consumer_status',
		parent			: parent
	})

	// what is running
		const engine = consumer.engine || {}
		const installation = section(wrapper, get_label.update_code_installation || 'This installation')
		fact_row(installation, get_label.update_code_current_version || 'Current version', engine.engine_version, true)
		fact_row(
			installation,
			get_label.update_code_posture || 'Build posture',
			engine.posture==='release'
				? (get_label.update_code_posture_release || 'Release build')
				: (get_label.update_code_posture_dev || 'Development checkout')
		)
		fact_row(installation, get_label.update_code_current_build || 'Current build', engine.build, true)
		fact_row(installation, get_label.update_code_commit || 'Commit', engine.sha, true)
		fact_row(installation, get_label.update_code_bun || 'Bun runtime', engine.bun, true)
		const tree = consumer.tree || {}
		fact_row(installation, get_label.update_code_tree_root || 'Code tree', tree.root, true)
		fact_row(installation, get_label.update_code_backup_root || 'Backup root', tree.backup_root, true)

	// readiness
		const readiness = section(wrapper, get_label.update_code_readiness || 'Update readiness')
		verdict(
			readiness.parentNode,
			consumer.ready===true,
			get_label.update_code_ready || 'Ready to update',
			get_label.update_code_blocked || 'Update blocked'
		)
		;(consumer.checks || []).forEach(check => check_row(readiness, check))

	// last update — only when there has been one
		const sentinel = consumer.last_update
		if (sentinel) {
			const status_words = {
				pending			: get_label.update_code_sentinel_pending || 'pending confirmation',
				confirmed		: get_label.update_code_sentinel_confirmed || 'confirmed',
				rolled_back		: get_label.update_code_sentinel_rolled_back || 'rolled back'
			}
			const last = section(wrapper, get_label.update_code_last_update || 'Last code update')
			fact_row(last, get_label.update_code_sentinel_from || 'Updated from', sentinel.previousVersion, true)
			fact_row(last, get_label.update_code_sentinel_to || 'Updated to', sentinel.version, true)
			fact_row(last, get_label.update_code_sentinel_when || 'When', sentinel.stamp)
			const status_row = fact_row(last, get_label.update_code_sentinel_status || 'Status', '')
			const status_value = status_row.querySelector('.dd_v')
			status_value.textContent = ''
			// a sentinel still pending is the state the rollback path acts on
			status_value.appendChild(state_chip(sentinel.status==='confirmed' ? 'ok' : 'warn'))
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'check_detail',
				text_content	: status_words[sentinel.status] || String(sentinel.status),
				parent			: status_value
			})
		}

	// restore points
		const points = consumer.restore_points || []
		const restore = section(wrapper, get_label.update_code_restore_points || 'Restore points')
		if (!points.length) {
			fact_row(restore, get_label.update_code_none || 'None', get_label.update_code_note_no_restore_points || '')
		}
		points.forEach(point => {
			const row = fact_row(restore, point.name, `${format_bytes(point.bytes)} · ${format_stamp(point.stamp)}`, true)
			const value = row.querySelector('.dd_v')
			// bootability is the rollback contract: a backup without
			// package.json + node_modules cannot be booted back into
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: point.bootable ? 'dd_badge pill_ok' : 'dd_badge pill_warning',
				text_content	: point.bootable
					? (get_label.update_code_restore_bootable || 'bootable')
					: (get_label.update_code_restore_incomplete || 'incomplete'),
				parent			: value
			})
		})

	return wrapper
}//end render_consumer_status



/**
* RENDER_CODE_SERVER_STATUS
* The master half: can this instance publish, from which commit, what is
* already on disk, and what a consumer would actually be offered.
* @param {HTMLElement} parent
* @param {Object|null} code_server - value.code_server, null on a plain install
* @returns {HTMLElement|null}
*/
export const render_code_server_status = function(parent, code_server) {

	if (!code_server) return null

	const wrapper = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'update_status code_server_status',
		parent			: parent
	})

	// role + publish readiness
		const role = section(wrapper, get_label.update_code_server_role || 'Code server')
		verdict(
			role.parentNode,
			code_server.ready===true,
			get_label.update_code_publish_ready || 'Ready to publish',
			get_label.update_code_publish_blocked || 'Cannot publish'
		)
		;(code_server.checks || []).forEach(check => check_row(role, check))

	// the tree releases are built FROM
		const source = code_server.source || {}
		const build_source = section(wrapper, get_label.update_code_build_source || 'Build source')
		fact_row(build_source, get_label.update_code_check_git_dir || 'Git source directory', source.git_dir, true)
		fact_row(build_source, get_label.update_code_commit || 'Commit', source.head_sha, true)
		fact_row(build_source, get_label.update_code_current_build || 'Current build', source.head_date, true)
		fact_row(build_source, get_label.update_code_head_branch || 'Checked-out branch', source.branch, true)
		fact_row(build_source, get_label.update_code_bun || 'Bun runtime', source.bun_pin, true)

	// THE RELEASE REF — what a published release is actually built from. It is
	// its own block because it is routinely NOT the checked-out branch, and the
	// publish checks above all read it: without these rows a red check on a
	// fix the operator just committed is unexplainable from the panel.
		const release = section(wrapper, get_label.update_code_release_ref || 'Release ref')
		fact_row(release, get_label.update_code_release_ref || 'Release ref', source.release_ref, true)
		fact_row(release, get_label.update_code_release_commit || 'Release ref commit', source.release_sha, true)
		fact_row(release, get_label.update_code_release_date || 'Release ref date', source.release_date, true)
		if (source.divergence) {
			const behind_row = fact_row(
				release,
				get_label.update_code_behind || 'Commits not in the release ref',
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

	// what is already published
		const releases = code_server.releases || []
		const published = section(wrapper, get_label.update_code_published || 'Published releases')
		if (!releases.length) {
			fact_row(published, get_label.update_code_none || 'None', '')
		}
		releases.forEach(release => {
			const row = fact_row(
				published,
				release.file,
				`${format_bytes(release.bytes)} · ${format_stamp(release.stamp)}`,
				true
			)
			const value = row.querySelector('.dd_v')
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: release.channel==='master' ? 'dd_badge pill_ok' : 'dd_badge',
				text_content	: release.channel==='master'
					? (get_label.update_code_channel_master || 'published')
					: (get_label.update_code_channel_dev || 'developer (not offered)'),
				parent			: value
			})
			// a missing sidecar means a consumer has no digest to verify against
			if (release.sidecar!==true) {
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'dd_badge pill_warning',
					text_content	: get_label.update_code_sidecar_missing || 'no sha256 sidecar',
					parent			: value
				})
			}
		})

	// what a consumer is ACTUALLY offered — the gap operators cannot otherwise see
		const advertises = code_server.advertises || {files:[]}
		const offered = section(wrapper, get_label.update_code_advertised || 'Offered to an installation at this version')
		if (!advertises.files.length) {
			fact_row(
				offered,
				advertises.for_version,
				get_label.update_code_note_advertised_empty || 'No release is offered.'
			)
		}
		advertises.files.forEach(file => fact_row(offered, file.version, file.url, true))

	return wrapper
}//end render_code_server_status



// @license-end

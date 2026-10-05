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
* It renders `value.consumer` (server: core/update/status.ts) — readiness,
* provenance, last update, restore points. The code-server readout moved to the
* serve_code widget (2026-09-28), which imports the row helpers exported here
* (section / fact_row / check_row / verdict / release_facts / channel_label) so both panels speak one
* layout vocabulary.
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
export const section = function(parent, title) {

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
* FOLD_STORAGE_PREFIX
* One localStorage key per fold (`dedalo.update_code.fold.<key>` → '1'|'0'):
* the operator's own reading preference, origin-scoped like the server picker's
* `dedalo.update_code.server`. Private-mode browsers throw on access, so both
* sides are guarded and degrade to "no memory" (folded).
*/
const FOLD_STORAGE_PREFIX = 'dedalo.update_code.fold.'

const read_fold = function(key) {
	try {
		const stored = window.localStorage.getItem(FOLD_STORAGE_PREFIX + key)
		return stored==='1' ? true : (stored==='0' ? false : null)
	} catch (_error) {
		return null
	}
}
const store_fold = function(key, open) {
	try {
		window.localStorage.setItem(FOLD_STORAGE_PREFIX + key, open ? '1' : '0')
	} catch (_error) {
		// no memory available — the fold still works for this visit
	}
}//end store_fold



/**
* FOLD_SECTION
* A titled block that FOLDS: a native <details> whose <summary> carries the
* eyebrow plus a one-line hint (the facts an operator needs without opening it),
* and whose body is the usual .dd_readout. The panel exposes the action and the
* verdict; the reference facts live one click away.
*
* Open state is the operator's, remembered per key. `force_open` opens it for
* THIS render only (a state that needs attention — e.g. a last update still
* pending) without overwriting the remembered preference: only a click stores.
* Stored from `toggle`, skipping the one the initial programmatic open queues.
*
* @param {HTMLElement} parent
* @param {string} key - storage key suffix
* @param {string} title
* @param {Object} [options]
* @param {string|null} [options.hint] - text after the eyebrow (TEXT, never HTML)
* @param {boolean} [options.force_open]
* @returns {{block:HTMLElement, summary:HTMLElement, body:HTMLElement}}
*/
export const fold_section = function(parent, key, title, options) {

	const opts = options || {}

	const block = ui.create_dom_element({
		element_type	: 'details',
		class_name		: `status_block status_fold fold_${key}`,
		parent			: parent
	})
	if (opts.force_open===true || read_fold(key)===true) {
		block.open = true
	}

	const summary = ui.create_dom_element({
		element_type	: 'summary',
		class_name		: 'status_fold_summary',
		parent			: block
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'dd_eyebrow',
		text_content	: title,
		parent			: summary
	})
	if (opts.hint) {
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'fold_hint',
			text_content	: opts.hint,
			parent			: summary
		})
	}
	// `toggle` covers pointer AND keyboard (the summary is the native control)
	// but also fires, queued, for the programmatic open above: that first event
	// is the render's, not the operator's, so it is skipped — a forced open
	// never overwrites the remembered preference.
	let skip_render_toggle = block.open
	block.addEventListener('toggle', () => {
		if (skip_render_toggle) {
			skip_render_toggle = false
			return
		}
		store_fold(key, block.open)
	})

	const body = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_readout',
		parent			: block
	})

	return { block, summary, body }
}//end fold_section



/**
* CHECK_COUNTS
* Per-state count chips for a folded check list: "9 ok · 1 warning · 2 unknown",
* in the same pill vocabulary as each row, so the closed fold still says whether
* opening it is worth the click.
* @param {HTMLElement} parent
* @param {Array} checks
*/
const check_counts = function(parent, checks) {

	const counts = {}
	checks.forEach(check => { counts[check.state] = (counts[check.state] || 0) + 1 })
	;['blocked', 'warn', 'unknown', 'ok'].forEach(state => {
		if (!counts[state]) {
			return
		}
		const chip = state_chip(state)
		chip.textContent = `${counts[state]} ${chip.textContent}`
		parent.appendChild(chip)
	})
}//end check_counts



/** The two build channels, in the order the readout lists them. */
export const CHANNELS = ['master', 'dev']

/** What a channel is CALLED (the badge vocabulary, reused as a fallback title). */
export const channel_label = function(channel) {
	return channel==='master'
		? (get_label.update_code_channel_master || 'published')
		: (get_label.update_code_channel_dev || 'developer')
}//end channel_label



/**
* RELEASE_FACTS
* One archive's facts into a value cell: file name, size · date, the channel
* badge, and the missing-sidecar warning. ONE writer for both the per-channel
* rows and the other-versions list — they showed the same facts through two
* code paths, which is how the 'developer (not offered)' wording survived in
* one of them after the dev channel started offering exactly those builds.
*
* @param {HTMLElement} value - the .dd_v cell to fill
* @param {Object} release - {file, bytes, stamp, channel, sidecar}
* @param {Object} [mark] - THE BUILD THAT JUST RAN, when this row is its
*   artifact: `{previous}` — the facts the row showed BEFORE it (null when the
*   archive did not exist yet). A build rewrites a file IN PLACE, so the new
*   row is byte-for-byte plausible whether or not anything happened: without
*   the before-value the operator has nothing to compare against, and no way to
*   tell a build that wrote from one that did not.
*/
export const release_facts = function(value, release, mark) {

	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'build_file_name mono',
		text_content	: release.file,
		parent			: value
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'build_file_meta',
		text_content	: `${format_bytes(release.bytes)} · ${format_stamp(release.stamp)}`,
		parent			: value
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: release.channel==='master' ? 'dd_badge pill_ok' : 'dd_badge',
		text_content	: channel_label(release.channel),
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

	// THE VERDICT ON THE BUILD THAT JUST RAN — present only on the row whose
	// button was pressed, and only until the next render of this half.
	if (mark) {
		const previous	= mark.previous || null
		// The STAMP is the evidence. A build rewrites the archive, so a stamp
		// that did not move means the file on disk is the one already there;
		// saying "updated" then would be a claim the disk does not support.
		const wrote		= previous===null || previous.stamp!==release.stamp
		value.classList.add(wrote ? 'built_updated' : 'built_unchanged')
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: wrote ? 'dd_badge pill_ok build_verdict' : 'dd_badge pill_warning build_verdict',
			text_content	: wrote
				? (get_label.update_code_build_updated || 'updated just now')
				: (get_label.update_code_build_unchanged || 'unchanged: the build wrote no new file'),
			parent			: value
		})
		// …and the value it replaced — but ONLY THE PART THAT MOVED. Repeating
		// the facts unchanged ("173 MB · 28/08/2026, 11:41:43" above,
		// "was 173 MB · 28/08/2026, 11:41:12" below) buries the one figure the
		// operator is here to read in three that did not change. So: the size
		// appears only when it differs, and the date only when the build crossed
		// midnight — otherwise the time of day carries the whole difference.
		const previous_text = (() => {
			if (previous===null) {
				return get_label.update_code_not_built || 'Not built yet'
			}
			// nothing moved: the `unchanged` badge above IS the statement, and a
			// before-value identical to the value above it would be pure noise.
			if (!wrote) {
				return null
			}
			const parts = []
			if (previous.bytes!==release.bytes) {
				parts.push(format_bytes(previous.bytes))
			}
			parts.push(same_day(previous.stamp, release.stamp)
				? format_time(previous.stamp)
				: format_stamp(previous.stamp))
			return parts.join(' · ')
		})()
		if (previous_text!==null) {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'build_file_previous',
				text_content	: (get_label.update_code_build_previous || 'was %s')
					.replace('%s', previous_text),
				parent			: value
			})
		}
	}

	return value
}//end release_facts



/**
* FACT_ROW
* A plain key/value row (no state).
* @param {HTMLElement} parent
* @param {string} k
* @param {string|null} v
* @param {boolean} [mono]
* @returns {HTMLElement}
*/
export const fact_row = function(parent, k, v, mono) {

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
* A `note` label — `<prefix>_note_<id>` — is rendered underneath, but ONLY
* when the check is not ok: an operator reading a green panel does not need the
* explanation of a failure that did not happen.
* The label PREFIX defaults to `update_code` (update_code and serve_code share
* the `update_code_check_*` keys); another panel speaking the same StatusCheck
* vocabulary passes its own (publication_hosts → `publication_hosts_check_*`).
* @param {HTMLElement} parent
* @param {{id:string, state:string, detail:string|undefined}} check
* @param {string} [label_prefix='update_code']
* @returns {HTMLElement}
*/
export const check_row = function(parent, check, label_prefix='update_code') {

	const row = ui.create_dom_element({
		element_type	: 'div',
		class_name		: `dd_row check_row state_${check.state}`,
		parent			: parent
	})

	// label by id — an unlabelled check shows its id rather than nothing
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_k',
		text_content	: get_label[label_prefix + '_check_' + check.id] || check.id,
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
		// `disk_space` sends the raw available byte count (the server sends
		// FACTS): read it like every other size on this panel.
		const detail_text = check.id==='disk_space' && isFinite(Number(check.detail))
			? (format_bytes(Number(check.detail)) + ' ' + (get_label.update_code_free || 'free'))
			: String(check.detail)
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'check_detail mono',
			text_content	: detail_text,
			parent			: value
		})
	}

	// the why, only where it helps
	const note = get_label[label_prefix + '_note_' + check.id]
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
* BACKUP_WAIVER_CHECK
* THE ONE PREDICATE for "this install needs the backup waiver to update".
*
* Both the readiness HEADLINE (below) and the version modal's waiver CHECKBOX
* (render_update_code.js) have to answer the same question, and they must
* answer it the same way: a headline naming a waiver the modal does not offer —
* or a checkbox the headline never warned about — is the panel/pipeline
* disagreement core/update/status.ts forbids, just wearing a different hat.
*
* It is `backup_fresh` SPECIFICALLY, never "any warning". The consumer half has
* three warn-capable checks (`backup_fresh`, `bun_pin`, `staging_clean`) and
* only the first is waivable: a leftover `.code_staging` dir or a bun-pin drift
* over a FRESH backup must not make the panel demand a waiver that nothing can
* give. Any state but `ok` counts, so a probe that threw (`unknown`) also
* offers the way through rather than stranding the operator.
*
* @param {Object} consumer - consumerStatus payload
* @returns {Object|null} the backup_fresh check when a waiver is pending, else null
*/
export const backup_waiver_check = function(consumer) {

	const check = ((consumer || {}).checks || []).find(el => el.id==='backup_fresh')

	return (check && check.state!=='ok') ? check : null
}//end backup_waiver_check



/**
* VERDICT
* The headline line of a role: ready, ready-but-only-with-a-waiver, or blocked.
*
* THE THIRD STATE IS NOT DECORATION. `ready` is `!checks.some(blocked)`, and
* since 2026-08-25 the waivable gate (`backup_fresh`) reports `warn`, so an
* install with a stale or missing database backup is `ready:true` — while the
* request the Update button sends by DEFAULT (`waive_backup:false`) is still
* refused on exactly that account. A bare "Ready to update" over that install
* would over-report as loudly as the "Update blocked" it replaced, only in the
* other direction. So: ready AND a PENDING WAIVER ⇒ say the waiver is the
* condition, in the warning voice.
*
* Pending waiver, not "any warning": see backup_waiver_check above.
*
* @param {HTMLElement} parent
* @param {boolean} ready
* @param {string} ok_label
* @param {string} bad_label
* @param {string} [waived_label] - shown instead of ok_label when the role is
*   ready only because a warning is waivable (omitted ⇒ the two-state verdict).
* @returns {HTMLElement}
*/
export const verdict = function(parent, ready, ok_label, bad_label, waived_label) {

	const waived = ready===true && typeof waived_label==='string'
	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: `status_verdict ${ready ? (waived ? 'state_warning' : 'state_ok') : 'state_danger'}`,
		text_content	: ready ? (waived ? waived_label : ok_label) : bad_label,
		parent			: parent
	})

	return node
}//end verdict



/**
* RENDER_READINESS
* The consumer's readiness half — the headline verdict plus one row per check.
* ONE writer, so the panel can be re-stated from a fresher value without a
* second copy of the layout drifting from this one.
*
* @param {HTMLElement} parent - the consumer status wrapper
* @param {Object} consumer - consumerStatus payload {ready, checks}
* @returns {HTMLElement} the block, marked so refresh_readiness can find it
*/
const render_readiness = function(parent, consumer) {

	const block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'status_block readiness_block',
		parent			: parent
	})
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_eyebrow',
		text_content	: get_label.update_code_readiness || 'Update readiness',
		parent			: block
	})

	// a PENDING WAIVER is what stands between `ready:true` and the DEFAULT
	// request actually succeeding — name it, never headline a plain "ready".
	// The SAME predicate the modal draws its checkbox from, so the two can
	// never disagree about whether a waiver is on the table.
	const waiver_check = backup_waiver_check(consumer)
	verdict(
		block,
		consumer.ready===true,
		get_label.update_code_ready || 'Ready to update',
		get_label.update_code_blocked || 'Update blocked',
		waiver_check!==null
			? (get_label.update_code_ready_with_waiver || 'Ready to update, but only with a waiver')
			: undefined
	)

	// WHAT NEEDS ATTENTION stays in view: every check the pipeline would refuse
	// or warn on, plus the waiver check whatever its state (an `unknown` backup
	// also puts a waiver on the table). The headline names the condition; these
	// rows name the cause, with their notes. `unknown` alone is information,
	// not an alarm — it stays in the folded list below.
	const checks = consumer.checks || []
	const attention = checks.filter(check =>
		check.state==='blocked' || check.state==='warn' || check===waiver_check
	)
	if (attention.length) {
		const attention_readout = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_readout attention_checks',
			parent			: block
		})
		attention.forEach(check => { check_row(attention_readout, check) })
	}

	// …and the COMPLETE list, folded, with per-state counts on its summary
	const all = fold_section(block, 'checks', get_label.update_code_all_checks || 'All checks')
	check_counts(all.summary, checks)
	checks.forEach(check => { check_row(all.body, check) })

	return block
}//end render_readiness



/**
* REFRESH_READINESS
* Re-state the readiness half from a FRESHER consumer payload, in place.
*
* Why it exists: `backup_fresh` AGES. The panel is built once and the version
* modal re-reads the value before it opens, so without this the operator can
* see the modal's red waiver row and its "25 h" over a panel still showing
* "Recent database backup · 23 h · ok" — one fact, two states, both on screen.
*
* @param {HTMLElement} root - the node render_consumer_status wrote into
* @param {Object} consumer - the fresh consumerStatus payload
* @returns {boolean} true when a block was found and replaced
*/
export const refresh_readiness = function(root, consumer) {

	if (!root || !consumer) {
		return false
	}
	const current = root.querySelector('.readiness_block')
	if (!current) {
		return false
	}
	const parent = current.parentNode
	const rebuilt = render_readiness(parent, consumer)
	parent.replaceChild(rebuilt, current)

	return true
}//end refresh_readiness



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
/** Time of day only — for a before-value on the SAME day as the value beside it. */
const format_time = function(ms) {
	if (!ms) return '—'
	try { return new Date(ms).toLocaleTimeString() } catch (e) { return String(ms) }
}
/** Same calendar day in the operator's own timezone. */
const same_day = function(a, b) {
	if (!a || !b) return false
	const x = new Date(a)
	const y = new Date(b)
	return x.getFullYear()===y.getFullYear() && x.getMonth()===y.getMonth() && x.getDate()===y.getDate()
}



/**
* RENDER_CONSUMER_STATUS
* The half every installation has: what is running, whether it can take an
* update, what happened last time, and what it could roll back to.
* @param {HTMLElement} parent
* @param {Object} consumer - value.consumer (core/update/status.ts ConsumerStatus)
* @param {Function} [on_restore] - (point) => void, mounted on each restore
*   point's Restore button. Omitted on any surface that cannot start a job (the
*   browser suite renders this module standalone), and then no button is drawn at
*   all: an inert control on a destructive action is worse than none.
* @returns {HTMLElement|null}
*/
export const render_consumer_status = function(parent, consumer, on_restore, on_delete) {

	if (!consumer) return null

	const wrapper = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'update_status consumer_status',
		parent			: parent
	})

	// what is running
		const engine = consumer.engine || {}
		// THREE postures, not two: 'dev' now covers a working checkout AND an
		// installed developer build (a branch archive, same version as the
		// release it replaced). Naming the second one a "checkout" would send an
		// operator hunting for a git tree that is not there.
		const posture_text = engine.posture==='release'
			? (get_label.update_code_posture_release || 'Release build')
			: engine.install_channel==='dev'
				? (get_label.update_code_posture_dev_build || "Developer build (unreleased code from 'master')")
				: (get_label.update_code_posture_dev || 'Development checkout')
		// folded: version + posture ARE the summary; the provenance facts
		// (commit, archive digest, paths) are one click away
		const installation = fold_section(
			wrapper,
			'installation',
			get_label.update_code_installation || 'This installation',
			{ hint : [engine.engine_version, posture_text].filter(Boolean).join(' · ') }
		).body
		fact_row(installation, get_label.update_code_current_version || 'Current version', engine.engine_version, true)
		fact_row(
			installation,
			get_label.update_code_posture || 'Build posture',
			posture_text
		)
		fact_row(installation, get_label.update_code_current_build || 'Current build', engine.build, true)
		fact_row(installation, get_label.update_code_commit || 'Commit', engine.sha, true)
		// The installed ARCHIVE — the identity a same-version install turns on.
		fact_row(installation, get_label.update_code_install_digest || 'Installed archive', engine.install_digest, true)
		fact_row(installation, get_label.update_code_bun || 'Bun runtime', engine.bun, true)
		const tree = consumer.tree || {}
		fact_row(installation, get_label.update_code_tree_root || 'Code tree', tree.root, true)
		fact_row(installation, get_label.update_code_backup_root || 'Backup root', tree.backup_root, true)

	// readiness
		render_readiness(wrapper, consumer)

	// last update — only when there has been one
		const sentinel = consumer.last_update
		if (sentinel) {
			const status_words = {
				pending			: get_label.update_code_sentinel_pending || 'pending confirmation',
				confirmed		: get_label.update_code_sentinel_confirmed || 'confirmed',
				rolled_back		: get_label.update_code_sentinel_rolled_back || 'rolled back'
			}
			// folded on its one-line story ("7.0.0 → 7.0.1 · confirmed"), but
			// OPEN while it is not confirmed: a pending or rolled-back update is
			// the state an operator has to see without asking for it
			const last = fold_section(
				wrapper,
				'last_update',
				get_label.update_code_last_update || 'Last code update',
				{
					hint		: `${sentinel.previousVersion || '—'} → ${sentinel.version || '—'} · ${status_words[sentinel.status] || String(sentinel.status)}`,
					force_open	: sentinel.status!=='confirmed'
				}
			).body
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
		// folded on the count + the newest point (the server lists newest first)
		const restore = fold_section(
			wrapper,
			'restore_points',
			get_label.update_code_restore_points || 'Restore points',
			{
				hint : points.length
					? `${points.length} · ${format_stamp(points[0].stamp)}${points[0].version ? ' · ' + points[0].version : ''}`
					: (get_label.update_code_none || 'None')
			}
		).body
		if (!points.length) {
			fact_row(restore, get_label.update_code_none || 'None', get_label.update_code_note_no_restore_points || '')
		}
		points.forEach(point => {
			// NO size: the server used to send the directory inode's own size
			// (a few hundred bytes for a multi-GB tree) and this printed it
			// through format_bytes as if it were the backup's size.
			const row = fact_row(restore, point.name, format_stamp(point.stamp), true)
			row.classList.add('restore_row')
			const value = row.querySelector('.dd_v')
			// THE VERSION THE POINT DECLARES, read from its own install stamp.
			// Without it the row is a directory name and a date: two points cut by
			// consecutive updates are indistinguishable at exactly the moment the
			// operator has to choose which code to make live again.
			if (point.version) {
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'restore_version mono',
					text_content	: String(point.version),
					parent			: value
				})
			}
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
			// RESTORE. The panel must never offer what the pipeline would refuse,
			// nor refuse what it would accept: `restorable` is computed by the SAME
			// predicate the restore pipeline refuses on (core/update/code_restore.ts,
			// re-exported through status.ts), so this button is a mirror of that
			// verdict and never a second opinion.
			if (!on_restore) {
				return
			}
			const button_restore = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light button_restore',
				inner_html		: get_label.update_code_restore || 'Restore',
				parent			: value
			})
			// DELETE, beside Restore. Rendered after it so the destructive control
			// is never the first thing under the pointer, and `light` — the
			// panel's own weight for a secondary action — with `.button_delete`
			// carrying the danger colour, the way `Mover a tabla` is marked.
			if (on_delete) {
				const button_delete = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'light button_delete_point',
					// the generic verb: the ROW already says what it is deleting,
					// and 'Delete restore point' on a button inside a restore-point
					// row is the noun twice.
					inner_html		: get_label.delete || 'Delete',
					parent			: value
				})
				if (point.deletable!==true) {
					button_delete.disabled = true
					// SAME CONTRACT AS `restorable`: the server sends a reason id,
					// this side the sentence, so a reason added tomorrow renders as
					// its id rather than as an invented excuse. There is one today —
					// the point is the rollback for the code running now — and it is
					// a REFUSAL, not a confirm: a dialog is not a sufficient guard
					// for deleting disaster recovery.
					const delete_reason = get_label['update_code_delete_reason_' + point.deletable_reason]
						|| String(point.deletable_reason || '')
					button_delete.title = delete_reason
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'restore_reason',
						text_content	: delete_reason,
						parent			: value
					})
				} else {
					button_delete.addEventListener('click', (e) => {
						e.stopPropagation()
						on_delete(point)
					})
				}
			}
			if (point.restorable!==true) {
				button_restore.disabled = true
				// the server sends a reason ID, this side the sentence — same
				// contract as the readiness checks above, so a reason added
				// tomorrow renders as its id rather than as an invented excuse.
				// It used to fall back to the not-bootable sentence, which told an
				// operator whose point declares no version — or pins another Bun —
				// that it was "incomplete", beside the green `bootable` pill the
				// same row draws: two contradictory statements about one directory.
				const reason_text = get_label['update_code_restore_reason_' + point.restorable_reason]
					|| String(point.restorable_reason || '')
				// …and the NUMBERS behind it, when the refusal is about a version
				// the operator now has to go and install. The sentence alone said
				// "a different Bun runtime than the one running" without naming
				// either one, so an admin reading it could not tell WHICH Bun to
				// install, nor which of several restore points was the odd one —
				// and both facts were already on the wire (the point's own
				// `bun_pin`, the engine's `bun`). Only this reason has numbers to
				// add; the others stay exactly as they were.
				const reason_detail = (point.restorable_reason==='bun_pin_mismatch' && point.bun_pin && engine.bun)
					? (get_label.update_code_restore_bun_versions
						|| 'This copy pins Bun %s; this server runs Bun %s. Install Bun %s to restore it.')
						.replace('%s', String(point.bun_pin))
						.replace('%s', String(engine.bun))
						.replace('%s', String(point.bun_pin))
					: ''
				// the hover tooltip carries both lines; the rendered lines below
				// are what a touch screen (and the operator manual) actually get.
				button_restore.title = reason_detail
					? (reason_text + ' ' + reason_detail)
					: reason_text
				// RENDERED, not only hovered (2026-08-26): a `title` is a hover
				// tooltip — it does not exist on a touch screen and the operator
				// manual promised the reason was on the button. A disabled button
				// whose refusal cannot be read is a dead end, so the sentence gets
				// its own line under the row (the top line keeps its layout).
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'restore_reason',
					text_content	: reason_text,
					parent			: value
				})
				if (reason_detail) {
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'restore_reason_detail mono',
						text_content	: reason_detail,
						parent			: value
					})
				}
				return
			}
			button_restore.addEventListener('click', (e) => {
				e.stopPropagation()
				on_restore(point)
			})
		})

	return wrapper
}//end render_consumer_status



// @license-end

// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* RENDER_TOOL_IDENTIFY_CLUSTERS
* The batch half of tool_identify: the groups inside a set of records, and the
* one action that turns a group into a fact — PROMOTING it to a canonical Type.
*
* ── WHY PROMOTION EXISTS ─────────────────────────────────────────────────────
*
* Clustering says "these thirty are the same thing" and says it every time
* someone runs it. Until a curator acts, the grouping is IMPLICIT: nothing in the
* catalogue records it, nothing can cite it, nothing can count it. Promotion is
* the end of that — a canonical **Type** record other objects link to, and every
* member of the group linked to it. From then on the answer is data: the Type has
* an id, a name, a record page, and thirty objects pointing at it.
*
* ── THE WRITE IS THE ORDINARY ONE, AND THAT IS THE WHOLE DESIGN ──────────────
*
* Attaching a member is `get_instance` + `change_value` on that record's own link
* component (tool_identify.js `attach_members`) — the same call the record's edit
* form makes when a curator picks the Type by hand, on the precedent of
* `tools/tool_cataloging/js/tool_cataloging.js`, which owns no server write path
* at all. Minting the Type is `section.create_section()`, the client's own "new
* record". So the result is INDISTINGUISHABLE from hand work: same TM audit, same
* observers, same server-side permission re-check, same diffusion. No bulk
* endpoint exists and none should — thirty saves are thirty ordinary saves.
*
* ── FOUR RULES THIS VIEW IS BUILT ON ─────────────────────────────────────────
*
* 1. ONLY WHERE IT IS MEANINGFUL. A profile with no `typeSectionTipo` (a photo
*    archive with no published typology) clusters happily and has nothing to
*    promote INTO; a profile whose criteria never reach the Type section in one
*    hop does not say WHICH component is the link. Both are asked of the server
*    ONCE, before any cluster is drawn, and both mean the promote control is not
*    rendered at all — the panel explains instead. An offered button that cannot
*    work is worse than no button.
* 2. NEVER GUESS THE LINK COMPONENT. The server derives it from the profile's own
*    criteria and refuses when they do not reveal it. When it reveals SEVERAL,
*    this asks the curator which one — it does not pick.
* 3. CONFIRM BEFORE WRITING. Promotion is a bulk mutation of curatorial data, so
*    the flow is choose → REVIEW (what will be written, into which component, on
*    how many records, named one by one) → confirm. The confirm button says the
*    number out loud.
* 4. PARTIAL FAILURE IS THE NORMAL CASE. Thirty members are thirty round trips.
*    Every member gets its own line — attached / already linked / FAILED with the
*    server's reason / unconfirmed — and the failures stay on screen with a Retry
*    that runs only them. Silently attaching 27 of 30 is the worst outcome
*    available here; REPORTING 30 attached when 3 were written is worse, so every
*    line is derived from what the server echoed back (promote_rules.js), never
*    from the request merely having succeeded.
* 5. A RUN LOCKS THE WHOLE BLOCK. While members are being written, no control in
*    this promote block is live — not the review button (it detaches the node the
*    outcomes are written into), not the promote toggle, not a second confirm.
*
* @module render_tool_identify_clusters
*/



// imports
	// ui: DOM node factory + spinner-wrapped async loads
	import {ui} from '../../../core/common/js/ui.js'
	// the tool's own shared render helpers: ONE decline renderer for the whole
	// tool (the codes overlap) and ONE record-title resolver.
	import {render_decline, record_title} from './render_tool_identify.js'
	// lock_flow_controls: a run freezes the WHOLE promote block, not two buttons
	// (see its header — the review button detaches the node the outcomes are
	// written into, and the promote toggle closes the form under a live run).
	import {lock_flow_controls} from './promote_rules.js'



/**
* BUILD_CLUSTERS_PANEL
* The panel shell: a head with the run control, a notices strip, and the list.
*
* NOTHING RUNS ON OPEN, deliberately. Clustering compares every record in the
* pool with every other and is quadratic in the pool size; opening a record's
* inspector must not start that. The curator presses the button.
*
* @param {Object} self - the tool_identify instance
* @param {HTMLElement} container - the .identify_clusters node
* @returns {HTMLElement} container
*/
export const build_clusters_panel = function(self, container) {

	// head
		const head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_clusters_head',
			parent			: container
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_clusters_title',
			text_content	: self.get_tool_label('identify_clusters_title') || 'Groups in this batch',
			parent			: head
		})
		const button_cluster = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'secondary identify_cluster_run',
			text_content	: self.get_tool_label('identify_cluster_run') || 'Group these records',
			parent			: head
		})

	// what will be compared, said before it is run: a grouping cannot be read
	// without knowing the bound that produced it.
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_clusters_scope',
			text_content	: (self.get_tool_label('identify_clusters_scope')
				|| 'Compares the records of your current filter — up to')
				+ ' ' + self.cluster_cap + '.',
			parent			: container
		})

	// notices (thresholds, cap, per-section notes, declines) + the list
		const notices = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_cluster_notices',
			parent			: container
		})
		const list = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_clusters_list',
			parent			: container
		})

	const nodes = {
		notices	: notices,
		list	: list
	}

	button_cluster.addEventListener('click', function(e) {
		e.stopPropagation()
		run_clusters(self, nodes).catch(error => console.error(error))
	})


	return container
}//end build_clusters_panel



/**
* RUN_CLUSTERS
* One full cycle: cluster, resolve the record titles, ask ONCE whether promotion
* is possible at all, repaint.
*
* The promotion question is asked here rather than per cluster on purpose: it is
* a fact about the SECTION (does this collection keep canonical Types, and does
* its profile say which component links to them), so asking it once decides
* whether any cluster gets a promote control, and the answer is explained once.
*
* @param {Object} self
* @param {Object} nodes - {notices, list}
* @returns {Promise<HTMLElement|null>}
*/
const run_clusters = async function(self, nodes) {

	nodes.notices.replaceChildren()

	return ui.load_item_with_spinner({
		container			: nodes.list,
		preserve_content	: false,
		label				: self.get_tool_label('identify_clustering') || 'Comparing the whole batch…',
		callback			: async () => {

			const ok = await self.cluster()

			if (ok!==true) {
				render_decline(self, nodes.notices, self.clusters_decline)
				return ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'identify_results_empty'
				})
			}

			const report = self.clusters

			// titles for every member and every singleton, in ONE batched request
			// through the client's existing (ACL-checked) resolver
				const locators	= []
				const seen		= {}
				const add		= function(locator) {
					if (!locator || !locator.section_tipo) {
						return
					}
					const key = locator.section_tipo + '_' + locator.section_id
					if (seen[key]===true) {
						return
					}
					seen[key] = true
					locators.push({
						section_tipo	: locator.section_tipo,
						section_id		: locator.section_id
					})
				}
				const clusters = Array.isArray(report.clusters) ? report.clusters : []
				for (let i = 0; i < clusters.length; i++) {
					const members = Array.isArray(clusters[i].members) ? clusters[i].members : []
					for (let j = 0; j < members.length; j++) {
						add(members[j])
					}
				}
				const singletons = Array.isArray(report.singletons) ? report.singletons : []
				for (let i = 0; i < singletons.length; i++) {
					add(singletons[i])
				}
				if (locators.length>0) {
					self.labels = Object.assign(self.labels || {}, await self.resolve_labels(locators))
				}

			// CAN ANYTHING BE PROMOTED? One question, asked once, before a single
			// promote control is drawn.
				const promotion = await self.resolve_type_link()

			render_cluster_notices(self, nodes.notices, report, promotion)

			return render_clusters(self, report, promotion)
		}
	})
}//end run_clusters



/**
* RENDER_CLUSTER_NOTICES
* The bounds the report was produced under, and the state of promotion.
*
* Every one of these exists because a grouping read without it means something
* else: a truncated run is a statement about the first `cap` records and not
* about the collection; a stopped run is partial; the thresholds are what "the
* same thing" meant in THIS run; a section without a profile contributed no
* criteria leg at all.
*
* @param {Object} self
* @param {HTMLElement} container
* @param {Object} report - the cluster wire report
* @param {Object|null} promotion - the resolve_type_link result, or null
* @returns {HTMLElement} container
*/
const render_cluster_notices = function(self, container, report, promotion) {

	// the pool cap actually stopped the run
		if (report.truncated===true) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_notice more',
				text_content	: (self.get_tool_label('identify_cluster_truncated')
					|| 'More records matched than were compared: the pool cap stopped the run. These groups describe the first')
					+ ' ' + (report.cap || '') + '.',
				parent			: container
			})
		}

	// the run was cancelled at a record boundary
		if (report.stopped===true) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_notice more',
				text_content	: self.get_tool_label('identify_cluster_stopped')
					|| 'The run was stopped before it finished. These groups are partial.',
				parent			: container
			})
		}

	// the thresholds that produced the grouping, and how many records were in it
		const thresholds = report.thresholds || {}
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_notice info',
			text_content	: (report.records_considered || 0) + ' '
				+ (self.get_tool_label('identify_cluster_considered') || 'record(s) compared.')
				+ ' ' + (self.get_tool_label('identify_cluster_thresholds') || 'Thresholds:')
				+ ' ' + (self.get_tool_label('identify_cluster_signal_image') || 'images')
				+ ' ' + format_share(thresholds.image)
				+ ', ' + (self.get_tool_label('identify_cluster_signal_criteria') || 'criteria')
				+ ' ' + (thresholds.criteria===null || thresholds.criteria===undefined
					? (self.get_tool_label('identify_cluster_no_criteria_leg') || '—')
					: format_share(thresholds.criteria)),
			parent			: container
		})

	// the engine's own per-section notes (a missing or unusable profile)
		const notes = Array.isArray(report.notes) ? report.notes : []
		for (let i = 0; i < notes.length; i++) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_notice decline',
				text_content	: notes[i],
				parent			: container
			})
		}

	// PROMOTION: available, or explained. Never a silently missing button.
		if (promotion===null) {
			render_decline(self, container, self.type_link_decline)
			return container
		}

		const type_section	= promotion.type_section || {}
		const links			= Array.isArray(promotion.links) ? promotion.links : []
		const writable		= links.filter(link => link.writable===true)
		if (writable.length<1) {
			// the link exists but this caller may not write it (or it cannot hold a
			// record link at all) — the server's own sentence says which
			const notice = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_notice decline',
				text_content	: self.get_tool_label('identify_promote_readonly')
					|| 'Groups cannot be promoted to a Type from here:',
				parent			: container
			})
			for (let i = 0; i < links.length; i++) {
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_notice_detail',
					text_content	: links[i].detail || links[i].reason || '',
					parent			: notice
				})
			}
			return container
		}

		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_notice info',
			text_content	: (self.get_tool_label('identify_promote_available')
				|| 'Groups can be promoted to a Type record in section')
				+ ' ' + (type_section.section_tipo || '') + '.',
			parent			: container
		})


	return container
}//end render_cluster_notices



/**
* RENDER_CLUSTERS
* The groups, largest first (the server ordered them), then the records that
* grouped with nothing.
*
* The singletons are NOT dropped: "this one is on its own" is an answer, and a
* curator triaging an import needs to see what the run could not group.
*
* @param {Object} self
* @param {Object} report
* @param {Object|null} promotion
* @returns {HTMLElement}
*/
const render_clusters = function(self, report, promotion) {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_clusters_cards'
	})

	const clusters = Array.isArray(report.clusters) ? report.clusters : []

	if (clusters.length<1) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_notice decline',
			text_content	: self.get_tool_label('identify_no_clusters')
				|| 'Nothing grouped: no two records in this batch were similar enough to link.',
			parent			: node
		})
	}

	for (let i = 0; i < clusters.length; i++) {
		node.appendChild(render_cluster(self, clusters[i], promotion))
	}

	// singletons
		const singletons = Array.isArray(report.singletons) ? report.singletons : []
		if (singletons.length>0) {
			const block = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_singletons',
				parent			: node
			})
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_singletons_label',
				text_content	: singletons.length + ' '
					+ (self.get_tool_label('identify_cluster_singletons')
						|| 'record(s) grouped with nothing.'),
				parent			: block
			})
			const list = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'identify_singletons_list',
				parent			: block
			})
			for (let i = 0; i < singletons.length; i++) {
				block_member_row(self, list, singletons[i])
			}
		}


	return node
}//end render_clusters



/**
* RENDER_CLUSTER
* One group: what holds it together, what its members agree on, who is in it —
* and the promote control when promotion is possible at all.
*
* THE CHAINING NUMBERS ARE NOT DECORATION. Single linkage groups A with C when
* A~B and B~C, even if A and C share nothing; `direct_edge_ratio` and
* `max_chain_hops` are exactly what a curator must look at before accepting
* thirty records at once, so they are rendered next to the confidence and a chain
* is called a chain in words.
*
* @param {Object} self
* @param {Object} cluster
* @param {Object|null} promotion
* @returns {HTMLElement}
*/
const render_cluster = function(self, cluster, promotion) {

	const members		= Array.isArray(cluster.members) ? cluster.members : []
	const ratio			= (typeof cluster.direct_edge_ratio==='number') ? cluster.direct_edge_ratio : 1
	const hops			= (typeof cluster.max_chain_hops==='number') ? cluster.max_chain_hops : 1
	const chained		= hops>1 || ratio<0.5

	const card = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_cluster' + (chained ? ' chained' : '')
	})

	// head: size, confidence, the signals that produced it
		const head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_cluster_head',
			parent			: card
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_cluster_size',
			text_content	: members.length + ' '
				+ (self.get_tool_label('identify_cluster_members') || 'records'),
			parent			: head
		})
		const signals = Array.isArray(cluster.signals) ? cluster.signals : []
		for (let i = 0; i < signals.length; i++) {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'identify_cluster_signal ' + signals[i],
				text_content	: signals[i]==='image'
					? (self.get_tool_label('identify_cluster_signal_image') || 'images')
					: (self.get_tool_label('identify_cluster_signal_criteria') || 'criteria'),
				parent			: head
			})
		}
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_cluster_confidence',
			text_content	: (self.get_tool_label('identify_cluster_confidence') || 'mean link')
				+ ' ' + format_share(cluster.confidence),
			parent			: head
		})

	// how much single linkage had to chain to hold this together
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_cluster_shape',
			text_content	: (self.get_tool_label('identify_cluster_shape') || 'Directly linked pairs')
				+ ': ' + format_share(ratio)
				+ ' · ' + (self.get_tool_label('identify_cluster_hops') || 'longest chain')
				+ ': ' + hops
				+ ' · ' + (self.get_tool_label('identify_cluster_weakest') || 'weakest link')
				+ ': ' + format_share(cluster.weakest_link),
			parent			: card
		})
		if (chained) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_notice decline identify_cluster_chaining',
				text_content	: self.get_tool_label('identify_cluster_chaining')
					|| 'This group is held together by a chain: some members are similar to each other only through other members. Read the links before accepting it whole.',
				parent			: card
			})
		}

	// what the members agree on — the short answer, then the full consensus
		const agreed_on = Array.isArray(cluster.agreed_on) ? cluster.agreed_on : []
		if (agreed_on.length>0) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_cluster_agreed',
				text_content	: (self.get_tool_label('identify_cluster_agreed_on') || 'They all agree on')
					+ ': ' + agreed_on.join(', '),
				parent			: card
			})
		}
		const consensus = Array.isArray(cluster.consensus) ? cluster.consensus : []
		if (consensus.length>0) {
			const list = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'identify_consensus_list',
				parent			: card
			})
			for (let i = 0; i < consensus.length; i++) {
				const entry = consensus[i]
				const row = ui.create_dom_element({
					element_type	: 'li',
					class_name		: 'identify_consensus ' + (entry.state || ''),
					parent			: list
				})
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_consensus_label',
					text_content	: entry.label || entry.criterion_id || '',
					parent			: row
				})
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_consensus_state',
					// the four states are NOT two: 'unrecorded' is absence, which is
					// never disagreement, and 'partial' is only some members stating it
					text_content	: self.get_tool_label('identify_consensus_' + entry.state) || entry.state,
					parent			: row
				})
				if (typeof entry.value==='string' && entry.value.length>0) {
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'identify_consensus_value',
						text_content	: entry.value,
						parent			: row
					})
				}
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_consensus_counts',
					text_content	: (entry.stated || 0) + '/' + (entry.compared || 0) + ' '
						+ (self.get_tool_label('identify_consensus_counts') || 'readable members state it'),
					parent			: row
				})
			}
		}

	// the representative, then every member
		const representative = cluster.representative || null
		if (representative) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_cluster_representative',
				text_content	: (self.get_tool_label('identify_cluster_representative') || 'Most central')
					+ ': ' + record_title(self, representative)
					+ ' — ' + (cluster.representative_reason || ''),
				parent			: card
			})
		}
		const members_list = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'identify_members_list',
			parent			: card
		})
		for (let i = 0; i < members.length; i++) {
			block_member_row(self, members_list, members[i])
		}

	// WHY they are together, in the engine's own sentences
		const links = Array.isArray(cluster.links) ? cluster.links : []
		if (links.length>0) {
			const details = ui.create_dom_element({
				element_type	: 'details',
				class_name		: 'identify_links',
				parent			: card
			})
			ui.create_dom_element({
				element_type	: 'summary',
				text_content	: links.length + ' '
					+ (self.get_tool_label('identify_cluster_links') || 'link(s) hold this group together'),
				parent			: details
			})
			const list = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'identify_links_list',
				parent			: details
			})
			for (let i = 0; i < links.length; i++) {
				const link = links[i]
				ui.create_dom_element({
					element_type	: 'li',
					class_name		: 'identify_link ' + (link.signal || ''),
					text_content	: record_title(self, link.a) + ' ↔ ' + record_title(self, link.b)
						+ ' — ' + (link.detail || ''),
					parent			: list
				})
			}
		}

	// PROMOTE. Rendered only when the server said it is possible AND writable:
	// rule 1 of this module's header.
		if (promotion!==null) {
			const links_writable = (Array.isArray(promotion.links) ? promotion.links : [])
				.filter(link => link.writable===true)
			if (links_writable.length>0) {
				card.appendChild(build_promote_block(self, cluster, promotion))
			}
		}


	return card
}//end render_cluster



/**
* BLOCK_MEMBER_ROW
* One record inside a group (or a singleton): its title, its locator, and a
* click that opens it. The locator is always shown — when no term resolves it IS
* the title, and when one does it still says which record.
*
* @param {Object} self
* @param {HTMLElement} list
* @param {Object} locator
* @returns {HTMLElement} row
*/
const block_member_row = function(self, list, locator) {

	const row = ui.create_dom_element({
		element_type	: 'li',
		class_name		: 'identify_member',
		parent			: list
	})
	const title = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'identify_member_title',
		text_content	: record_title(self, locator),
		parent			: row
	})
	title.title = self.get_tool_label('identify_open_record') || 'Open this record'
	title.addEventListener('click', function(e) {
		e.stopPropagation()
		self.open_record(locator)
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'identify_member_locator',
		text_content	: locator.section_tipo + ' / ' + locator.section_id,
		parent			: row
	})


	return row
}//end block_member_row



/* ═══════════════════════════ PROMOTION ═══════════════════════════════════ */



/**
* BUILD_PROMOTE_BLOCK
* The promote control and the form it opens, for ONE cluster.
*
* The form is not shown until asked for, and opening it asks the server a SECOND
* time — this time naming the cluster's members — so it can report the Types
* those members already carry. That survey is what makes "attach to the existing
* Type" the common case it should be: a typology is usually already catalogued,
* and usually already on some of the group.
*
* @param {Object} self
* @param {Object} cluster
* @param {Object} promotion - the section-level resolve_type_link answer
* @returns {HTMLElement}
*/
const build_promote_block = function(self, cluster, promotion) {

	const block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_promote'
	})

	const actions = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_promote_actions',
		parent			: block
	})
	const button = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'primary identify_promote_button',
		text_content	: self.get_tool_label('identify_promote') || 'Promote to a Type…',
		parent			: actions
	})
	const form = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_promote_form',
		parent			: block
	})

	button.addEventListener('click', async function(e) {
		e.stopPropagation()

		// a second press closes the form again without touching anything
			if (form.childNodes.length>0) {
				form.replaceChildren()
				return
			}

		button.disabled = true
		try {
			await ui.load_item_with_spinner({
				container			: form,
				preserve_content	: false,
				label				: self.get_tool_label('identify_promote_loading') || 'Reading the group’s current Types…',
				callback			: async () => {
					const survey = await self.resolve_type_link(cluster.members)
					if (survey===null) {
						const node = ui.create_dom_element({ element_type : 'div' })
						render_decline(self, node, self.type_link_decline)
						return node
					}
					return build_promote_form(self, cluster, survey)
				}
			})
		} finally {
			button.disabled = false
		}
	})


	return block
}//end build_promote_block



/**
* BUILD_PROMOTE_FORM
* Choose what the members will be linked to, and where the link is written.
*
* Three choices, and no fourth: an existing Type the members already carry, any
* other existing Type by id, or a NEW Type record minted here. Whichever is
* chosen, the next step is a REVIEW — this form never writes.
*
* @param {Object} self
* @param {Object} cluster
* @param {Object} survey - resolve_type_link, with this cluster's members surveyed
* @returns {HTMLElement}
*/
const build_promote_form = function(self, cluster, survey) {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_promote_body'
	})

	const type_section	= survey.type_section || {}
	const links			= (Array.isArray(survey.links) ? survey.links : []).filter(link => link.writable===true)
	const group			= 'identify_promote_' + (cluster.id || Math.random().toString(36).slice(2))

	// ── WHERE THE LINK IS WRITTEN ────────────────────────────────────────────
	// Derived from the profile, never guessed. When two criteria reach the
	// typology through DIFFERENT components the curator chooses; the panel does
	// not, because both are legitimate and only one is meant.
		const link_box = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_promote_link',
			parent			: node
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_promote_link_label',
			text_content	: self.get_tool_label('identify_promote_component') || 'The link is written into',
			parent			: link_box
		})
		const link_inputs = []
		for (let i = 0; i < links.length; i++) {
			const link	= links[i]
			const row	= ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'identify_promote_link_option',
				parent			: link_box
			})
			const input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'radio',
				parent			: row
			})
			input.name		= group + '_link'
			input.value		= link.component_tipo
			input.checked	= i===0
			// with a single candidate there is nothing to choose: show it, do not
			// pretend it is a decision
			if (links.length===1) {
				input.style.display = 'none'
			}
			link_inputs.push(input)
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'identify_promote_link_name',
				text_content	: link.component_tipo
					+ (link.component_model ? ' (' + link.component_model + ')' : ''),
				parent			: row
			})
			const revealed = Array.isArray(link.revealed_by) ? link.revealed_by : []
			if (revealed.length>0) {
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_promote_revealed',
					text_content	: (self.get_tool_label('identify_promote_revealed_by')
						|| 'derived from the profile’s criteria:')
						+ ' ' + revealed.map(entry => entry.label || entry.criterion_id).join(', '),
					parent			: row
				})
			}
		}

	// ── WHICH TYPE ───────────────────────────────────────────────────────────
		const target_box = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_promote_target',
			parent			: node
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_promote_target_label',
			text_content	: self.get_tool_label('identify_promote_target') || 'Link every member to',
			parent			: target_box
		})

		const targets = []
		const add_target_option = function(value, build_body) {
			const row = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'identify_promote_option',
				parent			: target_box
			})
			const input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'radio',
				parent			: row
			})
			input.name	= group + '_target'
			input.value	= value
			targets.push(input)
			build_body(row)
			return input
		}

		// the Types the members already carry, commonest first — the common case
			const existing = Array.isArray(survey.existing_types) ? survey.existing_types : []
			for (let i = 0; i < existing.length; i++) {
				const type = existing[i]
				const input = add_target_option('existing_' + type.section_id, function(row) {
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'identify_promote_option_title',
						text_content	: (typeof type.label==='string' && type.label.length>0)
							? type.label
							: (type.section_tipo + ' / ' + type.section_id),
						parent			: row
					})
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'identify_promote_option_note',
						text_content	: type.member_count + ' '
							+ (self.get_tool_label('identify_promote_already_linked')
								|| 'member(s) of this group already link to it'),
						parent			: row
					})
				})
				input.dataset.section_id	= String(type.section_id)
				input.dataset.section_tipo	= type.section_tipo
				if (i===0) {
					input.checked = true
				}
			}
			if (existing.length<1) {
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'identify_promote_option_none',
					text_content	: self.get_tool_label('identify_promote_existing_none')
						|| 'No member of this group links to a Type yet.',
					parent			: target_box
				})
			}

		// any other existing Type, by record id. Deliberately plain: the id is
		// verified by the SERVER — it must name a record that EXISTS and that this
		// caller may read — before the confirm step can be armed with it, so a typo
		// cannot silently attach thirty records to a Type that is not there.
			let other_locator = null
			const other_input = add_target_option('other', function(row) {
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_promote_option_title',
					text_content	: self.get_tool_label('identify_promote_other')
						|| 'Another existing Type, by record id',
					parent			: row
				})
			})
			const other_row = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_promote_other_row',
				parent			: target_box
			})
			const other_id = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				class_name		: 'identify_promote_other_id',
				parent			: other_row
			})
			other_id.placeholder = (type_section.section_tipo || '') + ' id'
			const other_check = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'secondary identify_promote_check',
				text_content	: self.get_tool_label('identify_promote_check') || 'Check',
				parent			: other_row
			})
			const other_found = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'identify_promote_other_found',
				parent			: other_row
			})
			other_check.addEventListener('click', async function(e) {
				e.stopPropagation()

				// the previous answer is void the moment the field is re-checked: the
				// confirm step is armed by `other_locator`, and it stays null until
				// the SERVER says the record is there
					other_locator		= null
					other_input.checked	= true
					other_found.classList.remove('failure')

				const id = Number(String(other_id.value || '').trim())
				if (!Number.isFinite(id) || id<1) {
					other_found.textContent = self.get_tool_label('identify_promote_bad_id') || 'Not a record id.'
					other_found.classList.add('failure')
					return
				}

				other_check.disabled = true
				try {
					// EXISTENCE + READABILITY, server-side. A title resolver cannot do
					// this: it falls back to "tipo / id" for a hit and for a miss alike,
					// so a mistyped id would render exactly like a real Type.
					const checked = await self.check_type_record(id)
					if (!checked || checked.exists!==true) {
						other_found.textContent = (checked && typeof checked.detail==='string' && checked.detail.length>0)
							? checked.detail
							: (self.get_tool_label('identify_promote_not_found')
								|| 'No readable record with that id exists in the Type section, so nothing can be attached to it.')
						other_found.classList.add('failure')
						return
					}

					const locator = {
						section_tipo	: checked.section_tipo || type_section.section_tipo,
						section_id		: checked.section_id
					}
					// the server already named it; keep that title so the review sentence
					// quotes the record the server verified, not a locator
					self.labels = self.labels || {}
					if (typeof checked.label==='string' && checked.label.length>0) {
						self.labels[locator.section_tipo + '_' + locator.section_id] = checked.label
					}else{
						const labels = await self.resolve_labels([locator])
						self.labels = Object.assign(self.labels, labels)
					}

					other_locator			= locator
					other_found.textContent	= record_title(self, locator)
				} finally {
					other_check.disabled = false
				}
			})

		// a NEW Type record. Minted through the client's own record creation, and
		// named through the ordinary component save when the Type section's own
		// label component is a literal this caller may write.
			const label_component	= type_section.label_component || null
			const can_name			= label_component!==null && label_component.writable===true
			let new_name			= null
			if (type_section.can_create===true) {
				add_target_option('new', function(row) {
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'identify_promote_option_title',
						text_content	: (self.get_tool_label('identify_promote_new') || 'A NEW Type record in')
							+ ' ' + (type_section.section_tipo || ''),
						parent			: row
					})
				})
				const new_row = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'identify_promote_new_row',
					parent			: target_box
				})
				if (can_name) {
					new_name = ui.create_dom_element({
						element_type	: 'input',
						type			: 'text',
						class_name		: 'identify_promote_new_name',
						parent			: new_row
					})
					new_name.placeholder = self.get_tool_label('identify_promote_new_name')
						|| 'Name for the new Type (optional)'
				}else{
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'identify_promote_new_note',
						text_content	: self.get_tool_label('identify_promote_new_name_note')
							|| 'The new Type record is created empty: this section’s title is not a plain text field you may write from here, so open the record afterwards and name it.',
						parent			: new_row
					})
				}
			}else{
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'identify_promote_option_none',
					text_content	: self.get_tool_label('identify_promote_no_create')
						|| 'You may not create records in the Type section, so a new Type cannot be minted here.',
					parent			: target_box
				})
			}

	// ── REVIEW ───────────────────────────────────────────────────────────────
	// This button never writes. It states what would be written, to how many
	// records, and asks again.
		const review_actions = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_promote_actions',
			parent			: node
		})
		const button_review = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary identify_promote_review',
			text_content	: self.get_tool_label('identify_promote_review') || 'Review what will be written',
			parent			: review_actions
		})
		const stage = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_promote_stage',
			parent			: node
		})

		button_review.addEventListener('click', function(e) {
			e.stopPropagation()

			const link_tipo = (link_inputs.find(input => input.checked) || link_inputs[0] || {}).value
			const chosen	= targets.find(input => input.checked) || null

			stage.replaceChildren()

			if (!link_tipo || !chosen) {
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'identify_notice failure',
					text_content	: self.get_tool_label('identify_promote_pick_target')
						|| 'Choose which Type the members will be linked to.',
					parent			: stage
				})
				return
			}

			// what was chosen, resolved to ONE plan the review can state plainly
			let plan = null
			if (chosen.value==='new') {
				plan = {
					kind			: 'new',
					section_tipo	: type_section.section_tipo,
					name			: (can_name && new_name) ? String(new_name.value || '').trim() : '',
					label_component	: label_component
				}
			}else if (chosen.value==='other') {
				if (other_locator===null) {
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'identify_notice failure',
						text_content	: self.get_tool_label('identify_promote_check_first')
							|| 'Check the record id first, so you can see which Type it is.',
						parent			: stage
					})
					return
				}
				plan = { kind : 'existing', locator : other_locator }
			}else{
				plan = {
					kind	: 'existing',
					locator	: {
						section_tipo	: chosen.dataset.section_tipo,
						section_id		: Number(chosen.dataset.section_id)
					}
				}
			}
			plan.link_component_tipo = link_tipo

			stage.appendChild(render_promote_review(self, cluster, plan))
		})


	return node
}//end build_promote_form



/**
* RENDER_PROMOTE_REVIEW
* THE CONFIRMATION. Exactly what will be written, into which component, on how
* many records — and the records named, one by one, because "30 records" is not
* something a curator can check and a list is.
*
* Promotion is a bulk mutation of curatorial data. Nothing above this point wrote
* anything, and nothing below it runs until the confirm button is pressed.
*
* @param {Object} self
* @param {Object} cluster
* @param {Object} plan - {kind:'new'|'existing', …, link_component_tipo}
* @returns {HTMLElement}
*/
const render_promote_review = function(self, cluster, plan) {

	const members = Array.isArray(cluster.members) ? cluster.members : []

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_promote_review'
	})

	const target_text = plan.kind==='new'
		? (self.get_tool_label('identify_promote_review_new') || 'a NEW Type record created in')
			+ ' ' + plan.section_tipo
			+ (plan.name!=='' ? ' — “' + plan.name + '”' : '')
		: record_title(self, plan.locator)
			+ ' (' + plan.locator.section_tipo + ' / ' + plan.locator.section_id + ')'

	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_promote_review_sentence',
		text_content	: (self.get_tool_label('identify_promote_review_1') || 'This will write')
			+ ' ' + target_text
			+ ' ' + (self.get_tool_label('identify_promote_review_2') || 'into the component')
			+ ' ' + plan.link_component_tipo
			+ ' ' + (self.get_tool_label('identify_promote_review_3') || 'of these')
			+ ' ' + members.length + ' '
			+ (self.get_tool_label('identify_promote_review_4') || 'records. Members already linked to it are skipped and reported.'),
		parent		: node
	})

	const list = ui.create_dom_element({
		element_type	: 'ul',
		class_name		: 'identify_members_list',
		parent			: node
	})
	for (let i = 0; i < members.length; i++) {
		block_member_row(self, list, members[i])
	}

	const actions = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_promote_actions',
		parent			: node
	})
	const button_confirm = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'primary identify_promote_confirm',
		// the number is IN the button: a confirm that says "OK" is a confirm
		// nobody read
		text_content	: (self.get_tool_label('identify_promote_confirm') || 'Write to')
			+ ' ' + members.length + ' '
			+ (self.get_tool_label('identify_promote_confirm_records') || 'records'),
		parent			: actions
	})
	const button_cancel = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'secondary identify_promote_cancel',
		text_content	: self.get_tool_label('identify_promote_cancel') || 'Cancel',
		parent			: actions
	})
	const outcome_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_promote_outcome',
		parent			: node
	})

	button_cancel.addEventListener('click', function(e) {
		e.stopPropagation()
		node.remove()
	})

	button_confirm.addEventListener('click', async function(e) {
		e.stopPropagation()

		// LOCK THE WHOLE FLOW, not this pair of buttons. While a run writes, the
		// review button would replaceChildren() the stage this very node lives in
		// — detaching the list the outcomes are being appended to, so the rest of
		// the run reports into nothing — and the promote toggle would close the
		// form; either also starts a SECOND concurrent attach over the same
		// members. The unit of locking is the promote block.
		const unlock = lock_flow_controls(node.closest('.identify_promote') || node)

		outcome_node.replaceChildren()

		try {
			await run_promotion(self, {
				members				: members,
				plan				: plan,
				container			: outcome_node
			})
		} finally {
			unlock()
		}

		// the run is finished; the review is now history and must not be
		// re-submitted (which would attach a second time or report 30 'already')
		button_confirm.remove()
		button_cancel.disabled = false
		button_cancel.textContent = self.get_tool_label('identify_promote_close') || 'Close'
	})


	return node
}//end render_promote_review



/**
* RUN_PROMOTION
* Mint (if asked), name (if asked), attach — and report every member.
*
* ORDER MATTERS AND SO DOES STOPPING. If the Type cannot be created there is
* nothing to attach to, so the run stops and says so; nothing has been written.
* If the Type is created but cannot be NAMED, the run continues — the record
* exists and the members belong on it — and the failed naming is its own line,
* because an unnamed Type is something a curator must go and fix.
*
* @param {Object} self
* @param {Object} options - {members, plan, container}
* @returns {Promise<void>}
*/
const run_promotion = async function(self, options) {

	const members	= options.members
	const plan		= options.plan
	const container	= options.container

	const progress = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_promote_progress',
		text_content	: self.get_tool_label('identify_promote_writing') || 'Writing…',
		parent			: container
	})

	// 1. the Type record itself
		let locator = null
		if (plan.kind==='new') {
			progress.textContent = self.get_tool_label('identify_promote_creating') || 'Creating the Type record…'
			const new_id = await self.create_type_record(plan.section_tipo)
			if (new_id===null) {
				progress.remove()
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'identify_notice failure',
					text_content	: self.get_tool_label('identify_promote_create_failed')
						|| 'The Type record could not be created, so nothing was linked. Nothing was written.',
					parent			: container
				})
				return
			}
			locator = { section_tipo : plan.section_tipo, section_id : new_id }

			// name it, when the curator gave a name and the field allows it
			if (plan.name!=='' && plan.label_component) {
				const named = await self.name_type_record(plan.label_component, new_id, plan.name)
				if (named!==true) {
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'identify_notice failure',
						text_content	: (self.get_tool_label('identify_promote_name_failed')
							|| 'The new Type record was created but could not be named — open it and name it by hand:')
							+ ' ' + plan.section_tipo + ' / ' + new_id,
						parent			: container
					})
				}
			}
			// the new record has no term yet: show the locator until it is named
			self.labels = self.labels || {}
			if (plan.name!=='') {
				self.labels[plan.section_tipo + '_' + new_id] = plan.name
			}
		}else{
			locator = plan.locator
		}

	// 2. the members, one ordinary save each
		const results = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'identify_promote_results',
			parent			: container
		})
		const outcomes = await self.attach_members({
			members				: members,
			type				: locator,
			link_component_tipo	: plan.link_component_tipo,
			on_progress			: function(done, total, outcome) {
				progress.textContent = (self.get_tool_label('identify_promote_writing') || 'Writing…')
					+ ' ' + done + '/' + total
				results.appendChild(render_outcome_row(self, outcome))
			}
		})

		progress.remove()

	// 3. THE REPORT. Never a bare "done": the three states are counted, and the
	//    failures are listed again with a retry that runs only them.
		render_promotion_summary(self, {
			container			: container,
			outcomes			: outcomes,
			locator				: locator,
			link_component_tipo	: plan.link_component_tipo,
			results				: results
		})
}//end run_promotion



/**
* RENDER_OUTCOME_ROW
* One member's result, in the list, as it happens.
*
* @param {Object} self
* @param {Object} outcome - {section_tipo, section_id, status, detail}
* @returns {HTMLElement}
*/
const render_outcome_row = function(self, outcome) {

	const row = ui.create_dom_element({
		element_type	: 'li',
		class_name		: 'identify_promote_result ' + outcome.status
	})

	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'identify_promote_result_mark',
		// FOUR marks, because there are four answers: written, already there,
		// refused — and 'unconfirmed', the save the server accepted without saying
		// what it did. A '✓' on that last one is the false report this flow exists
		// to prevent.
		text_content	: outcome.status==='attached'
			? '✓'
			: outcome.status==='already'
				? '='
				: outcome.status==='unconfirmed'
					? '?'
					: '✕',
		parent			: row
	})
	const title = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'identify_promote_result_title',
		text_content	: record_title(self, outcome),
		parent			: row
	})
	title.title = self.get_tool_label('identify_open_record') || 'Open this record'
	title.addEventListener('click', function(e) {
		e.stopPropagation()
		self.open_record(outcome)
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'identify_promote_result_state',
		text_content	: self.get_tool_label('identify_promote_' + outcome.status)
			|| outcome.status,
		parent			: row
	})
	if (typeof outcome.detail==='string' && outcome.detail.length>0) {
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_promote_result_detail',
			text_content	: outcome.detail,
			parent			: row
		})
	}


	return row
}//end render_outcome_row



/**
* RENDER_PROMOTION_SUMMARY
* What actually happened, counted — and the retry for what did not.
*
* A FAILED MEMBER IS NEVER OUT OF SIGHT. It stays in the list with the server's
* own reason, it is counted in the sentence, and the retry button runs the failed
* ones ALONE (the ones that succeeded are already linked and re-running them
* would only produce 'already' noise). Silently attaching 27 of 30 is the failure
* mode this whole block exists to prevent.
*
* @param {Object} self
* @param {Object} options - {container, outcomes, locator, link_component_tipo, results}
* @returns {HTMLElement}
*/
const render_promotion_summary = function(self, options) {

	const container	= options.container
	const outcomes	= Array.isArray(options.outcomes) ? options.outcomes : []

	const attached		= outcomes.filter(outcome => outcome.status==='attached')
	const already		= outcomes.filter(outcome => outcome.status==='already')
	const failed		= outcomes.filter(outcome => outcome.status==='failed')
	// the save the server accepted without reporting what it did: not a success,
	// not a failure, and never silently folded into either
	const unconfirmed	= outcomes.filter(outcome => outcome.status==='unconfirmed')

	const summary = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_notice ' + (failed.length>0 || unconfirmed.length>0 ? 'failure' : 'info'),
		text_content	: attached.length + ' '
			+ (self.get_tool_label('identify_promote_summary_attached') || 'linked')
			+ ' · ' + already.length + ' '
			+ (self.get_tool_label('identify_promote_summary_already') || 'already linked (nothing written)')
			+ ' · ' + failed.length + ' '
			+ (self.get_tool_label('identify_promote_summary_failed') || 'FAILED')
			+ (unconfirmed.length>0
				? ' · ' + unconfirmed.length + ' '
					+ (self.get_tool_label('identify_promote_summary_unconfirmed')
						|| 'UNCONFIRMED (open those records and check)')
				: ''),
		parent			: container
	})

	// where the Type is, so it can be opened and checked
		const open_type = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'secondary identify_promote_open_type',
			text_content	: (self.get_tool_label('identify_promote_open_type') || 'Open the Type record')
				+ ' ' + options.locator.section_tipo + ' / ' + options.locator.section_id,
			parent			: container
		})
		open_type.addEventListener('click', function(e) {
			e.stopPropagation()
			self.open_record(options.locator)
		})

	if (failed.length<1) {
		return summary
	}

	// RETRY, over the failures only
		const retry = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary identify_promote_retry',
			text_content	: (self.get_tool_label('identify_promote_retry') || 'Retry the')
				+ ' ' + failed.length + ' '
				+ (self.get_tool_label('identify_promote_retry_failed') || 'that failed'),
			parent			: container
		})
		retry.addEventListener('click', async function(e) {
			e.stopPropagation()
			// a retry is a run: the same whole-block lock, for the same reason
			const unlock = lock_flow_controls(container.closest('.identify_promote') || container)
			retry.disabled	= true
			summary.remove()
			open_type.remove()
			// the failed rows are replaced by their new outcomes; the successful
			// ones above them stay exactly as they were
			const rows = options.results.querySelectorAll('.identify_promote_result.failed')
			for (let i = 0; i < rows.length; i++) {
				rows[i].remove()
			}
			let again = []
			try {
				again = await self.attach_members({
					members				: failed.map(outcome => ({
						section_tipo	: outcome.section_tipo,
						section_id		: outcome.section_id
					})),
					type				: options.locator,
					link_component_tipo	: options.link_component_tipo,
					on_progress			: function(done, total, outcome) {
						options.results.appendChild(render_outcome_row(self, outcome))
					}
				})
			} finally {
				unlock()
			}
			retry.remove()
			render_promotion_summary(self, {
				container			: container,
				// the retry's own outcomes plus everything that had already worked,
				// so the counted sentence still describes the WHOLE group
				// (unconfirmed rides along too: dropping it would quietly shrink the
				// group to the members whose fate is known)
				outcomes			: attached.concat(already, unconfirmed, again),
				locator				: options.locator,
				link_component_tipo	: options.link_component_tipo,
				results				: options.results
			})
		})


	return summary
}//end render_promotion_summary



/**
* FORMAT_SHARE
* A [0,1] similarity as a percentage. Non-numbers render as an em dash rather
* than as 0%, which would read as "not similar at all" when it means "unknown".
*
* @param {number|null|undefined} value
* @returns {string}
*/
const format_share = function(value) {

	if (typeof value!=='number' || !isFinite(value)) {
		return '—'
	}

	return Math.round(Math.max(0, Math.min(1, value)) * 100) + '%'
}//end format_share



// @license-end

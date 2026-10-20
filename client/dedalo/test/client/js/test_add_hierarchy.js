// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, before, after, afterEach, assert */
/*eslint no-undef: "error"*/

/**
* TEST_ADD_HIERARCHY
* The Maintenance › add_hierarchy widget and its import block
* (widgets/add_hierarchy/js/render_hierarchies_import.js — extracted from the
* retired browser install wizard, WC-2026-10-12-install-surface-removed).
*
* Outcomes pinned:
*   - one checkbox per importable hierarchy, grouped by typology; an installed
*     TLD carries the `installed` chip and is not ticked;
*   - the filter count follows the input, the no-match note appears;
*   - ticking a row pre-ticks the thesauri it declares (never a lock);
*   - the import body is the widget's own widget_request — never dd_utils_api;
*   - reset sends ONLY the ticked, already-installed TLDs;
*   - the block refuses to render without its endpoints;
*   - the spinner is VISIBLE (animated) while a request is pending: its CSS
*     moved with the block (add_hierarchy.less), not left behind in the wizard.
*
* Backend-free: a fake `value`, data_manager.request / confirm / alert replaced
* on their shared objects and restored after each case.
*/

import {add_hierarchy} from '../../../core/area_maintenance/widgets/add_hierarchy/js/add_hierarchy.js'
import {render_hierarchies_import_block} from '../../../core/area_maintenance/widgets/add_hierarchy/js/render_hierarchies_import.js'
import {data_manager} from '../../../core/common/js/data_manager.js'



// DOM container
	const container = document.getElementById('content');

// fixtures (fresh per case). Deliberately NOT A→Z: the block renders the server's
// order (hierarchyChoiceView) and must never re-sort it.
	const build_value = () => {
		return {
			hierarchies : [
				{label : 'Spain',		tld : 'es',			typology : 2, has_data : true},
				{label : 'France',		tld : 'fr',			typology : 2, has_data : true},
				{label : 'Material',	tld : 'material',	typology : 5, has_data : false, dependencies : []},
				{label : 'Technique',	tld : 'technique',	typology : 5, has_data : true,
					dependencies : [{tld : 'material', mandatory : true}]},
				{label : 'Template',	tld : 'zzmodel',	typology : 5, type : 'model'}
			],
			installed_hierarchies		: [{tld : 'ES'}],
			hierarchy_files_dir_path	: '/srv/dedalo/install/import/hierarchy',
			hierarchy_typologies		: [
				{label : 'Toponymy',	typology : 2},
				{label : 'Thesaurus',	typology : 5}
			]
		}
	}

	const WIDGET_SOURCE = (action) => {
		return {type : 'widget', model : 'add_hierarchy', action : action}
	}

	// render the REAL widget content inside the scope its stylesheet targets
	// (every add_hierarchy.less rule lives under .wrapper_widget.add_hierarchy)
	const mount_widget = async () => {
		const self = new add_hierarchy()
		self.id				= 'test_add_hierarchy'
		self.value			= build_value()
		self.events_tokens	= []
		const content_data = await self.list({ render_level : 'content' })
		const host = document.createElement('div')
		host.className = 'wrapper_widget add_hierarchy'
		host.appendChild(content_data)
		container.appendChild(host)
		return host
	}

	const row_of = (root, tld) => {
		const labels = [...root.querySelectorAll('.hierarchy_label')]
		const label = labels.find(el => el.textContent.includes('[' + tld + ']'))
		return label ? label.closest('li') : null
	}
	const checkbox_of = (root, tld) => row_of(root, tld).querySelector('.hierarchy_checkbox')
	const tick = (root, tld, checked=true) => {
		const checkbox = checkbox_of(root, tld)
		checkbox.checked = checked
		checkbox.dispatchEvent(new Event('change'))
	}
	const type_filter = (root, text) => {
		const input = root.querySelector('.hierarchy_filter_input')
		input.value = text
		input.dispatchEvent(new Event('input'))
	}
	const mouseup = (node) => node.dispatchEvent(new MouseEvent('mouseup'))
	const tick_once = () => new Promise(resolve => setTimeout(resolve, 0))



describe('ADD_HIERARCHY WIDGET', function() {

	this.timeout(10000);

	// shared-object seams, restored after every case
	const native_request	= data_manager.request
	const native_confirm	= window.confirm
	const native_alert		= window.alert
	let captured			= []
	let hosts				= []

	before(function() {
		window.confirm	= () => true
		window.alert	= () => {}
	})
	afterEach(function() {
		data_manager.request = native_request
		captured = []
		for (const host of hosts) host.remove()
		hosts = []
	})
	after(function() {
		data_manager.request	= native_request
		window.confirm			= native_confirm
		window.alert			= native_alert
	})

	const fake_request = (answer) => {
		data_manager.request = async function(options) {
			captured.push(options.body)
			return answer
		}
	}


	it('renders one checkbox per importable hierarchy, grouped by typology; installed rows are marked, not ticked', async function() {

		const host = await mount_widget()
		hosts.push(host)

		// the model entry is a template, never offered
		assert.strictEqual(host.querySelectorAll('.hierarchy_checkbox').length, 4, 'four importable rows (model skipped)')
		assert.strictEqual(row_of(host, 'zzmodel'), null, 'no row for a model entry')

		// typology groups in the SERVER's order, each holding its own hierarchies
		const headings = [...host.querySelectorAll('.typology_label')].map(el => el.textContent)
		assert.deepEqual(headings, ['Toponymy', 'Thesaurus'], 'typology headings in the order handed')
		const groups = [...host.querySelectorAll('.hierarchy_ul')]
		assert.strictEqual(groups.length, 2)
		assert.ok(groups[0].contains(row_of(host, 'es')), 'es under Toponymy')
		assert.ok(groups[1].contains(row_of(host, 'technique')), 'technique under Thesaurus')

		// rows in the SERVER's order too — never re-sorted by the client
		const tlds = [...host.querySelectorAll('.hierarchy_checkbox')].map(el => el.closest('li').querySelector('.hierarchy_label').textContent.match(/\[(\w+)\]/)[1])
		assert.deepEqual(tlds, ['es', 'fr', 'material', 'technique'], 'rows in the order handed')

		// installed chip on the installed TLD only; nothing ticked on open
		assert.ok(row_of(host, 'es').querySelector('.installed_hierarchy'), 'es carries the installed chip')
		assert.strictEqual(row_of(host, 'fr').querySelector('.installed_hierarchy'), null, 'fr does not')
		assert.strictEqual(host.querySelectorAll('.hierarchy_checkbox:checked').length, 0, 'nothing pre-ticked')

		// an empty-by-design thesaurus is labelled as such
		assert.ok(row_of(host, 'material').querySelector('.empty_hierarchy'), 'material carries the empty chip')

		// the source directory path is shown (it used to be lost behind the label)
		assert.include(host.querySelector('.source_files').textContent, '/srv/dedalo/install/import/hierarchy')
	})


	it('the filter count follows the input and the no-match note appears', async function() {

		const host = await mount_widget()
		hosts.push(host)

		const count		= host.querySelector('.hierarchy_filter_count')
		const no_matches	= host.querySelector('.hierarchy_no_matches')

		assert.strictEqual(count.textContent, '4', 'seeded with the total')
		assert.isTrue(no_matches.hidden, 'no note while everything matches')

		type_filter(host, 'fra')
		assert.strictEqual(count.textContent, '1 / 4')
		assert.isFalse(row_of(host, 'fr').hidden, 'France visible')
		assert.isTrue(row_of(host, 'es').hidden, 'Spain hidden')
		assert.isTrue(host.querySelectorAll('.hierarchy_ul')[1].hidden, 'the emptied Thesaurus group is hidden')
		assert.isTrue(no_matches.hidden)

		type_filter(host, 'no such hierarchy')
		assert.strictEqual(count.textContent, '0 / 4')
		assert.isFalse(no_matches.hidden, 'the no-match note appears')

		type_filter(host, '')
		assert.strictEqual(count.textContent, '4')
		assert.isTrue(no_matches.hidden)
	})


	it('ticking a row pre-ticks the thesauri it declares, and unticking one shows the recommendation warning', async function() {

		const host = await mount_widget()
		hosts.push(host)

		tick(host, 'technique')
		assert.isTrue(checkbox_of(host, 'material').checked, 'the declared thesaurus is pre-ticked')
		assert.include(row_of(host, 'material').querySelector('.recommended_hierarchy').textContent, 'technique', 'marked as recommended by technique')

		// never a lock: the operator may untick it, and is told it can be installed later
		tick(host, 'material', false)
		assert.isFalse(checkbox_of(host, 'material').checked, 'still editable')
		assert.isFalse(row_of(host, 'material').querySelector('.recommended_declined').hidden, 'the declined warning shows')
	})


	it('import posts the ticked TLDs to the widget action — never to dd_utils_api', async function() {

		const host = await mount_widget()
		hosts.push(host)
		fake_request({ok : true, data : true, msg : 'imported', errors : []})

		tick(host, 'fr')
		tick(host, 'technique') // + material, through its declaration
		mouseup(host.querySelector('.import_hierarchies_button'))
		await tick_once()

		assert.strictEqual(captured.length, 1, 'one request')
		assert.deepEqual(captured[0], {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: WIDGET_SOURCE('install_hierarchies'),
			options			: {hierarchies : ['fr', 'technique', 'material']}
		})
		for (const body of captured) {
			assert.notInclude(JSON.stringify(body), 'dd_utils_api', 'no request reaches the retired install surface')
		}

		// outcome rendered as text; the import button leaves on success
		const status = host.querySelector('.msg')
		assert.isTrue(status.classList.contains('ok'))
		assert.strictEqual(status.textContent, 'imported')
		assert.strictEqual(host.querySelector('.import_hierarchies_button'), null)
		assert.ok(host.querySelector('.body_response .button_refresh'), 'the widget offers a reload')
	})


	it('a failed import shows the first per-item error and keeps the button', async function() {

		const host = await mount_widget()
		hosts.push(host)
		fake_request({ok : true, data : false, errors : ['fr: data file missing']})

		tick(host, 'fr')
		mouseup(host.querySelector('.import_hierarchies_button'))
		await tick_once()

		const status = host.querySelector('.msg')
		assert.isTrue(status.classList.contains('error'))
		assert.strictEqual(status.textContent, 'fr: data file missing')
		assert.ok(host.querySelector('.import_hierarchies_button'), 'the button stays for a retry')
	})


	it('reset sends ONLY the ticked hierarchies that are already installed', async function() {

		const host = await mount_widget()
		hosts.push(host)
		fake_request({ok : true, data : true, msg : 'reset', errors : []})

		tick(host, 'es')
		tick(host, 'fr')
		mouseup(host.querySelector('.reset_hierarchies_button'))
		await tick_once()

		assert.strictEqual(captured.length, 1)
		assert.deepEqual(captured[0], {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: WIDGET_SOURCE('reset_hierarchies'),
			options			: {hierarchies : ['es']}
		})
	})


	it('reset with no installed hierarchy ticked sends nothing', async function() {

		const host = await mount_widget()
		hosts.push(host)
		fake_request({ok : true, data : true})

		tick(host, 'fr')
		mouseup(host.querySelector('.reset_hierarchies_button'))
		await tick_once()

		assert.strictEqual(captured.length, 0)
	})


	it('the block refuses to render without its endpoints', function() {

		const request = {dd_api : 'dd_area_maintenance_api', action : 'widget_request', source : WIDGET_SOURCE('x')}
		const value = build_value()

		assert.throws(() => render_hierarchies_import_block({
			hierarchies : value.hierarchies, hierarchy_typologies : value.hierarchy_typologies, reset_request : request
		}), /import_request is required/)
		assert.throws(() => render_hierarchies_import_block({
			hierarchies : value.hierarchies, hierarchy_typologies : value.hierarchy_typologies, import_request : request
		}), /reset_request is required/)
	})


	it('the spinner is visible and animated while a request is pending', async function() {

		const host = await mount_widget()
		hosts.push(host)

		let release
		data_manager.request = function(options) {
			captured.push(options.body)
			return new Promise(resolve => { release = () => resolve({ok : true, data : true, msg : 'done', errors : []}) })
		}

		tick(host, 'fr')
		mouseup(host.querySelector('.import_hierarchies_button'))
		await tick_once()

		const spinner = host.querySelector('.msg.loading .hierarchy_import_spinner')
		assert.ok(spinner, 'the spinner row is mounted in the status line')
		const style = getComputedStyle(spinner)
		assert.strictEqual(style.animationName, 'dd_spin', 'the ring names the kit keyframe')
		// The computed animation-name is the DECLARED name whether or not a matching
		// @keyframes rule exists: only a running CSSAnimation proves the kit's dd_spin
		// keyframe (widget_kit.less) resolved — Chrome creates none for an unknown name.
		assert.ok(
			spinner.getAnimations().some(animation => animation.animationName === 'dd_spin'),
			'the dd_spin keyframe resolves and runs'
		)
		assert.notStrictEqual(style.borderTopStyle, 'none', 'the ring is drawn')
		assert.isAbove(spinner.getBoundingClientRect().width, 0, 'the ring has a size')

		release()
		await tick_once()
		assert.strictEqual(host.querySelector('.hierarchy_import_spinner'), null, 'the spinner leaves when the request settles')
	})
})



// @license-end

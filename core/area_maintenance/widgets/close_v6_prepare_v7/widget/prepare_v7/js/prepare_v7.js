/**
* prepare_v7.js
* v6 area-maintenance widget UI: "Prepare installation for v7".
*
* Renders a readiness panel + two actions (Preflight, Migrate) and polls the
* migration log. It is intentionally framework-light with ONE integration seam:
* `api_request(action, options)` — wire this to v6's maintenance API client
* (the same channel other maintenance widgets use: dd_area_maintenance_api
* widget_request → prepare_v7::prepare_v7, and get_widget_value → get_value).
*
* Expected server contract (class.prepare_v7.php):
*   get_value()               → { result:{ is_superuser, maintenance_mode, database,
*                                           engine_present, runner_present, php_binary,
*                                           package_root, engine_root, log_tail }, ... }
*   prepare_v7({mode,skip_backup}) → { result:bool, pid:int|null, msg:string, errors:[] }
*/

export const prepare_v7 = {

	// --- INTEGRATION SEAM ---------------------------------------------------
	// Replace this with the host's maintenance API call. Must resolve to the
	// server response object. `action` is 'get_value' or 'prepare_v7'.
	async api_request(action, options = {}) {
		if (typeof window !== 'undefined' && typeof window.dd_prepare_v7_api === 'function') {
			return window.dd_prepare_v7_api(action, options);
		}
		throw new Error('prepare_v7: wire api_request() to the v6 maintenance API (window.dd_prepare_v7_api).');
	},
	// ------------------------------------------------------------------------

	poll_timer: null,

	async render(container) {
		this.container = container;
		container.classList.add('prepare_v7_widget');
		container.innerHTML = '<div class="pv7_status">Loading…</div>'
			+ '<div class="pv7_actions"></div>'
			+ '<pre class="pv7_log" style="max-height:22em;overflow:auto"></pre>';
		await this.refresh();
	},

	async refresh() {
		let resp;
		try {
			resp = await this.api_request('get_value');
		} catch (e) {
			this.container.querySelector('.pv7_status').textContent = 'Error: ' + e.message;
			return;
		}
		const r = (resp && resp.result) || {};
		this.render_status(r);
		this.render_actions(r);
		if (r.log_tail) this.container.querySelector('.pv7_log').textContent = r.log_tail;
	},

	render_status(r) {
		const yn = (v) => v ? 'yes' : 'NO';
		this.container.querySelector('.pv7_status').innerHTML =
			`<ul>
				<li>Database: <b>${r.database ?? '?'}</b></li>
				<li>Superuser: <b>${yn(r.is_superuser)}</b></li>
				<li>Maintenance mode: <b>${yn(r.maintenance_mode)}</b></li>
				<li>Bundled engine present: <b>${yn(r.engine_present)}</b></li>
				<li>Runner present: <b>${yn(r.runner_present)}</b></li>
			</ul>`;
	},

	render_actions(r) {
		const box = this.container.querySelector('.pv7_actions');
		box.innerHTML = '';

		const preflight = document.createElement('button');
		preflight.textContent = 'Run preflight (safe, no writes)';
		preflight.disabled = !(r.engine_present && r.runner_present);
		preflight.addEventListener('click', () => this.launch('preflight', false));
		box.appendChild(preflight);

		const migrate = document.createElement('button');
		migrate.textContent = 'Prepare installation for v7 (migrate)';
		migrate.disabled = !(r.is_superuser && r.maintenance_mode && r.engine_present && r.runner_present);
		migrate.title = migrate.disabled ? 'Requires superuser + maintenance mode + bundled engine' : '';
		migrate.addEventListener('click', () => {
			const msg = 'This will BACK UP and then REWRITE the database into the v7 data model.\n'
				+ 'A full backup runs first (migration aborts if it fails).\n\nProceed?';
			if (window.confirm(msg)) this.launch('migrate', false);
		});
		box.appendChild(migrate);
	},

	async launch(mode, skip_backup) {
		try {
			const resp = await this.api_request('prepare_v7', { mode, skip_backup });
			const line = (resp && resp.msg) || 'launched';
			this.container.querySelector('.pv7_log').textContent = line + '\n';
			this.start_polling();
		} catch (e) {
			this.container.querySelector('.pv7_log').textContent = 'Error: ' + e.message;
		}
	},

	start_polling() {
		if (this.poll_timer) clearInterval(this.poll_timer);
		this.poll_timer = setInterval(() => this.refresh(), 4000);
	},

	stop_polling() {
		if (this.poll_timer) clearInterval(this.poll_timer);
		this.poll_timer = null;
	}
};

export default prepare_v7;

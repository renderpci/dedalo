// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/


/**
* TRANSCRIPTION_REPORT
* The ONE shape every status and failure of the transcription engine takes, and
* the translation of the runtime's own strings into something an archivist can act
* on.
*
* WHY THIS EXISTS. The engine used to speak in five voices — set_status, set_error,
* ui.show_message, a blocking modal dialog and console — and the paths that
* mattered most spoke in the last one. A failure to load the model surfaced as
* "Can't create a session. ERROR_CODE: 7, ERROR_MESSAGE: Failed to load model
* because protobuf parsing failed." in a console nobody had open, while the user
* saw a button that stopped responding. One shape, produced everywhere, is what
* makes silence impossible: there is no other exit.
*
* PURE ON PURPOSE. No DOM, no imports, no label lookups — it returns label KEYS,
* and the panel resolves them against the tool's catalog. That keeps the same file
* loadable by the browser worker, the tool, and a bun:test gate, so the rules are
* tested where they are used and never re-implemented.
*/

/** The stages a report can belong to, in the order they happen. */
export const REPORT_PHASES = ['preflight', 'audio', 'model', 'transcribe', 'speakers', 'done']

/**
* Severity, weakest first. The panel styles on this and never hides an error.
*
* `success` is a REAL severity and not a shade of `info`, because the panel is
* the only place a run says it finished: an outcome that arrives in the same
* neutral grey as "the model is unverified" is a run whose end the archivist has
* to infer. It is also why an unknown severity coerces to `error` below — an
* outcome must never be able to LOSE its colour, in either direction.
*/
export const REPORT_SEVERITIES = ['info', 'success', 'progress', 'warning', 'error']

/**
* The rules, in order. FIRST MATCH WINS, so the specific ones come first: a
* protobuf failure also contains the word "model", and "could not locate file"
* would otherwise be claimed by a generic loader rule.
*
* Each rule names a `key` (the report's identity, what tests assert on), the label
* keys the panel renders, and — where a remedy exists — the action the panel
* offers as a button.
*/
const RULES = [
	{
		key			: 'model_damaged',
		match		: /error_code:\s*7|protobuf parsing failed|invalid model|deserialize tensor/i,
		phase		: 'model',
		message_key	: 'error_model_damaged',
		cause_key	: 'cause_model_damaged',
		action_key	: 'action_repair_model'
	},
	{
		key			: 'model_missing',
		match		: /could not locate file|status code 404|no such file/i,
		phase		: 'model',
		message_key	: 'error_model_missing',
		cause_key	: 'cause_model_missing',
		action_key	: 'action_download_model'
	},
	{
		key			: 'out_of_memory',
		match		: /out of memory|failed to allocate|allocation failed|array buffer allocation/i,
		phase		: 'model',
		message_key	: 'error_out_of_memory',
		cause_key	: 'cause_out_of_memory',
		action_key	: 'action_lower_quality'
	},
	{
		key			: 'audio_undecodable',
		match		: /decode audio|decodeaudiodata|audiocontext|unsupported audio/i,
		phase		: 'audio',
		message_key	: 'error_audio_undecodable',
		cause_key	: 'cause_audio_undecodable',
		action_key	: 'action_check_media'
	},
	{
		key			: 'device_lost',
		// "createbuffer" alone is NOT enough: AudioContext.createBuffer() is a real
		// Web Audio API method, and a genuine audio failure such as "Failed to
		// execute 'createBuffer' on 'BaseAudioContext': invalid number of channels"
		// used to be misclassified as a lost GPU device (told the archivist to
		// retry on the CPU, when the fix was to check the audio file). Require a
		// GPU-side qualifier adjacent to createbuffer so only WebGPU's
		// device.createBuffer collides here.
		match		: /device (was )?lost|adapter.*lost|(gpu|webgpu|adapter|device).{0,40}createbuffer|createbuffer.{0,40}(gpu|webgpu|adapter|device)|gpu.*(failed|error)/i,
		phase		: 'model',
		message_key	: 'error_device_lost',
		cause_key	: 'cause_device_lost',
		action_key	: 'action_retry_cpu'
	},
	{
		key			: 'not_isolated',
		match		: /sharedarraybuffer is not defined|cross-origin isolat/i,
		phase		: 'model',
		message_key	: 'error_not_isolated',
		cause_key	: 'cause_not_isolated',
		action_key	: 'action_ask_admin'
	},
	{
		key			: 'network',
		match		: /failed to fetch|networkerror|load failed|err_connection/i,
		phase		: 'model',
		message_key	: 'error_network',
		cause_key	: 'cause_network',
		action_key	: 'action_retry'
	}
]


/**
* MODEL_STATES
* What each state of a model in the install's store MEANS — ONE table, read by
* both places that have to answer for it: the readiness line (before the button
* is pressed) and the run's own refusal (after it is).
*
* They used to disagree. The refusal knew only `installed` — the list of models
* that are ready OR unverified — so a DAMAGED model, being absent from it, was
* announced as "not installed" and offered a Download button that the server
* short-circuits ("Model already installed", because the files ARE there, just
* broken). The archivist was told the wrong thing and handed a remedy that does
* nothing, for precisely the failure this whole piece of work exists to fix.
*
* `usable` is the run gate: an UNVERIFIED model is NOT refused — it is the normal
* state of every store seeded before verification existed.
*/
export const MODEL_STATES = {
	ready : {
		state_key	: 'state_ready',
		usable		: true,
		action_key	: null
	},
	unverified : {
		state_key	: 'state_unverified',
		usable		: true,
		// Offered, never demanded: this is the only way to reach the check.
		action_key	: 'action_verify_model'
	},
	incomplete : {
		state_key	: 'state_incomplete',
		usable		: false,
		message_key	: 'error_model_damaged',
		cause_key	: 'cause_model_damaged',
		action_key	: 'action_repair_model'
	},
	damaged : {
		state_key	: 'state_damaged',
		usable		: false,
		message_key	: 'error_model_damaged',
		cause_key	: 'cause_model_damaged',
		action_key	: 'action_repair_model'
	},
	missing : {
		state_key	: 'state_missing',
		usable		: false,
		message_key	: 'error_model_missing',
		cause_key	: 'cause_model_missing',
		action_key	: 'action_download_model'
	}
}


/**
* MODEL_STATE_OF
* The state the server says one model is in — its OWN word for it, not ours.
*
* NULL IS A REAL ANSWER and must not be read as a fault: a server older than the
* per-file verification sends no `models` array at all, and the caller keeps its
* previous, coarser behaviour instead of inventing a verdict. Null therefore means
* only "not answered": no array, no entry for this model, or no state on it.
*
* AN UNKNOWN STATE IS RETURNED VERBATIM. It used to be flattened to null, which
* made a state string this table has not learned yet vanish from the readiness
* line entirely — and silence is the failure class this whole subsystem exists to
* remove. These states cross a wire; a server one version ahead is exactly how an
* unrecognised word arrives, and the honest answer is to show it. Callers look the
* word up in MODEL_STATES and must handle a miss (`undefined`) as "cannot
* interpret", never as "nothing to say".
*
* @param {Array<Object>} models - get_model_sources → result.models
* @param {string} name - catalog model id
* @returns {string|null} a MODEL_STATES key, an unrecognised state, or null
*/
export const model_state_of = function( models, name ) {

	if (!Array.isArray(models) || !name) {
		return null
	}
	const entry = models.find(el => el && el.name===name)

	return (entry && typeof entry.state==='string' && entry.state!=='')
		? entry.state
		: null
}//end model_state_of


/**
* THE DEGRADED-ANSWER CONTRACT of get_model_sources.
*
* The server answers three questions about models — `installed`, `models`,
* `diarization` — and it can fail to answer any of them (the catalog lives in the
* database, and a read can fail). ABSENT AND EMPTY ARE NOT THE SAME ANSWER:
*
*   absent  the field is not on the wire at all: this server CANNOT TELL. Every
*           consumer keeps its previous, permissive behaviour and says so where a
*           verdict was expected — never a verdict.
*   empty   `installed: []` / `models: []` / `diarization: null` are REAL answers:
*           nothing is installed / no model is declared.
*
* It is the hinge every refusal and every remedy pivots on, so it is stated ONCE,
* here, and read by the run's preflight, the model picker, the readiness line and
* the tests — the same law in one place, never re-derived from `Array.isArray` in
* four.
*
* @param {Object|null} sources - get_model_sources → result
* @param {string} field - 'installed' | 'models' | 'diarization' | …
* @returns {boolean} true when the server answered this field at all
*/
export const server_answered = function( sources, field ) {

	return !!sources && typeof sources==='object' && sources[field]!==undefined
}//end server_answered


/**
* INSTALLED_ANSWER
* What the server says about ONE model's membership of `installed` — the coarse
* "the browser may try this" list.
*
* 'unknown' is the answer for a server that did not send the list, and it must
* never be treated as 'no': a momentary catalog failure would otherwise tell
* every archivist that their model is not installed, and offer them a Download
* the server itself then contradicts.
*
* @param {Object|null} sources - get_model_sources → result
* @param {string} name - catalog model id
* @returns {string} 'yes' | 'no' | 'unknown'
*/
export const installed_answer = function( sources, name ) {

	if (!server_answered(sources, 'installed') || !Array.isArray(sources.installed) || !name) {
		return 'unknown'
	}


	return sources.installed.includes(name) ? 'yes' : 'no'
}//end installed_answer


/**
* BUILD_REPORT
* Normalize a report so every field is a string. The panel writes these straight
* into text nodes; `undefined` would render as the word "undefined" and an unknown
* severity would silently lose its styling — an error that looks like a note is
* worse than no report at all.
*
* @param {Object} input
* @returns {Object} {phase, severity, message, cause, action, detail}
*/
export const build_report = function( input ) {

	const source = input || {}

	return {
		phase		: REPORT_PHASES.includes(source.phase) ? source.phase : 'transcribe',
		severity	: REPORT_SEVERITIES.includes(source.severity) ? source.severity : 'error',
		message		: typeof source.message==='string' ? source.message : '',
		cause		: typeof source.cause==='string' ? source.cause : '',
		action		: typeof source.action==='string' ? source.action : '',
		detail		: typeof source.detail==='string' ? source.detail : ''
	}
}//end build_report


/**
* CLASSIFY_FAILURE
* Turn a raw runtime failure into a report skeleton carrying label keys.
*
* The unmatched case is the important one: it still returns a complete report, and
* `detail` still carries the raw text. The table improves the wording; it is never
* what decides whether the user is told.
*
* @param {string} raw_message - the runtime's own words
* @param {Object} [context] - {phase, model, device, log} — `log` is the runtime's
*                             console tail (onnxruntime writes the useful half of
*                             its diagnosis there, not into the exception)
* @returns {Object} {phase, severity, key, message_key, cause_key, action_key, detail}
*/
export const classify_failure = function( raw_message, context ) {

	const info		= context || {}
	const raw		= (typeof raw_message==='string' && raw_message.trim()!=='')
		? raw_message.trim()
		: 'The transcription engine failed without reporting a reason'

	const parts = [ raw ]
	if (info.model) parts.push(`model: ${info.model}`)
	if (info.device) parts.push(`device: ${info.device}`)
	if (typeof info.log==='string' && info.log.trim()!=='') parts.push(info.log.trim())
	const detail = parts.join('\n')

	// The runtime log is part of the evidence: ORT's session error arrives as a
	// bare "Failed to load model" often enough that the ERROR_CODE lives only in
	// the log tail we captured.
	const haystack = `${raw}\n${typeof info.log==='string' ? info.log : ''}`

	for (let i = 0; i < RULES.length; i++) {
		const rule = RULES[i]
		if (rule.match.test(haystack)) {
			return {
				key			: rule.key,
				phase		: REPORT_PHASES.includes(info.phase) ? info.phase : rule.phase,
				severity	: 'error',
				message_key	: rule.message_key,
				cause_key	: rule.cause_key,
				action_key	: rule.action_key,
				detail		: detail
			}
		}
	}

	return {
		key			: 'unknown',
		phase		: REPORT_PHASES.includes(info.phase) ? info.phase : 'transcribe',
		severity	: 'error',
		message_key	: 'error_unknown',
		cause_key	: '',
		action_key	: 'action_retry',
		detail		: detail
	}
}//end classify_failure


// @license-end

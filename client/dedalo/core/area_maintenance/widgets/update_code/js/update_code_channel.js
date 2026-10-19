// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
 * UPDATE_CODE_CHANNEL
 * The consumer half of the code-update CHANNEL LADDER (release identity design
 * §2.8 item 2, owner Q8): `master` ⊂ `prerelease` ⊂ `dev`. The panel's choice
 * (published releases / prereleases / developer builds) is sent as
 * `get_code_update_info` `options.channel`; each rung also sees the ones before
 * it, and a code server offers a rung only when it opted into it itself.
 *
 * DEPENDENCY-FREE on purpose (like update_code_phases.js): these are decisions,
 * and the unit tier imports this file directly to execute them.
 *
 * AN OLDER CODE SERVER never refuses the new token: its channel parse is
 * `channel==='dev' ? 'dev' : 'master'` (every v7 master since the dev channel,
 * 2026-08-24; before that the key was not read at all), so a `prerelease` ask is
 * answered exactly as a release ask. Nothing to retry, then — but the panel must
 * not let that answer pass for "there are no prereleases": a current master
 * reports every rung it honoured in `info.channels`, an older one does not, and
 * {@link channel_shortfall_note} turns either into the note the operator reads.
 */

/** The channel tokens, in ladder order (core/update/install_stamp.ts INSTALL_CHANNELS). */
export const CODE_CHANNELS = Object.freeze(['master', 'prerelease', 'dev']);

/**
 * CHANNEL_TOKEN
 * The wire token for a panel choice: one of CODE_CHANNELS exactly, anything else
 * the release channel — an unknown value must never be the one that widens what
 * is offered.
 * @param {*} choice
 * @returns {string} 'master' | 'prerelease' | 'dev'
 */
export const channel_token = (choice) => {
	return CODE_CHANNELS.includes(choice) ? choice : 'master';
}; //end channel_token

/**
 * HONOURED_CHANNELS
 * Every rung a code server's answer actually honoured, in ladder order, or null
 * when the answer cannot tell.
 *  - A current master says so: `info.channels`. A SET, not a highest rung: its
 *    two switches are separate, so a `dev` ask can be honoured WITHOUT the
 *    `prerelease` rung below it.
 *  - An older master says nothing. A `prerelease` ask then WAS answered as a
 *    release ask (its parse knows only 'dev'), so: ['master']. A `dev` ask was
 *    honoured exactly when developer items came back (and an older master has no
 *    prerelease rung at all); with none, it cannot be told from an opted-in
 *    master that simply has no developer build on disk → null (no note: the
 *    panel never claims what it does not know).
 * @param {string} asked - the token that was sent
 * @param {Object} result - the manifest ({info, files})
 * @returns {string[]|null}
 */
export const honoured_channels = (asked, result) => {
	const info = result?.info || {};
	if (Array.isArray(info.channels)) {
		// remote data: only exact tokens count, in ladder order; the release rung
		// is what every answer is
		return CODE_CHANNELS.filter((rung) => rung === 'master' || info.channels.includes(rung));
	}
	if (asked === 'dev') {
		const files = Array.isArray(result?.files) ? result.files : [];
		return files.some((item) => item?.channel === 'dev') ? ['master', 'dev'] : null;
	}

	return ['master'];
}; //end honoured_channels

/**
 * CHANNEL_SHORTFALL
 * The rungs that were asked for (the asked one and every rung below it) and NOT
 * honoured, in ladder order, or null when nothing is missing or the answer
 * cannot tell.
 * @param {string} asked
 * @param {Object} result
 * @returns {string[]|null} a non-empty subset of ['prerelease','dev'], or null
 */
export const channel_shortfall = (asked, result) => {
	const token = channel_token(asked);
	const honoured = honoured_channels(token, result);
	if (honoured === null || token === 'master') {
		return null;
	}
	const wanted = CODE_CHANNELS.slice(1, CODE_CHANNELS.indexOf(token) + 1);
	const missing = wanted.filter((rung) => !honoured.includes(rung));

	return missing.length > 0 ? missing : null;
}; //end channel_shortfall

/**
 * CHANNEL_SHORTFALL_NOTE
 * The label key of the note the panel shows above a list that lacks a rung it
 * asked for, or null. The sentence names what IS listed, so it follows the
 * whole shortfall:
 *  - developer builds missing → "does not offer developer builds" (whatever
 *    else is missing, the list is then the releases it publishes);
 *  - only prereleases missing, developer builds listed → its own sentence (the
 *    list is NOT "published releases only");
 *  - only prereleases missing on a prerelease ask → "does not offer prereleases".
 * @param {string} asked
 * @param {Object} result
 * @returns {string|null}
 */
export const channel_shortfall_note = (asked, result) => {
	const missing = channel_shortfall(asked, result);
	if (missing === null) {
		return null;
	}
	if (missing.includes('dev')) {
		return 'update_code_channel_not_offered_dev';
	}

	return channel_token(asked) === 'dev'
		? 'update_code_channel_not_offered_prerelease_with_dev'
		: 'update_code_channel_not_offered_prerelease';
}; //end channel_shortfall_note

/** A prerelease identity: `X.Y.Z-(alpha|beta|rc).N` (core/update/release_identity.ts RELEASE_VERSION_RE). */
const PRERELEASE_IDENTITY_RE =
	/^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})-(alpha|beta|rc)\.(0|[1-9][0-9]{0,5})$/;

/**
 * ITEM_RELEASE
 * The release identity a manifest item IS: a prerelease item's `release`
 * (`7.0.1-beta.2`) when it is one — remote data, so only in the exact grammar —
 * else its `version`. A prerelease item's `version` is the bare DATA triple (the
 * URL segment and what every update door parses), so naming the row after it
 * would show `7.0.1` for a beta of it.
 * @param {Object} item - manifest item {version, channel?, release?}
 * @returns {string|null} the identity, or null for a prerelease item whose
 *   `release` is malformed (never shown as the stable triple it is not)
 */
export const item_release = (item) => {
	if (item?.channel === 'prerelease') {
		const release = String(item.release ?? '');
		return PRERELEASE_IDENTITY_RE.test(release) ? release : null;
	}

	return String(item?.version ?? '');
}; //end item_release

// @license-end

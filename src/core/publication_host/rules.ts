/**
 * PUBLICATION-HOST EXPECTED RULES: the media include the engine says one host must run.
 * Spec: engineering/PUBLICATION_HOST_SPEC.md §5.1.
 *
 * INPUTS (one rule each, never a fallback):
 *  - `server` and `root` come from the agent's own `GET /v1/status` (`rules.server`,
 *    `media.root`): the host knows which web server it runs and where it mounts the media;
 *  - the qualities are the registry override (`record.qualities`) or, when null, the
 *    engine's getPublicQualities().
 *
 * CALLED, NEVER RE-DERIVED. The hash is getPublicationHostConfigHash's and the text is the
 * phase-1 builder's, which embeds that same hash in its `# config-hash:` header, so the
 * hash the panel compares and the hash `rules.apply` installs cannot disagree.
 *
 * ONE PROFILE FOR BOTH MEDIA MODES (phase 5, plan M2). A `shared` host is gated over its
 * read-only mount; a `copy` host over the agent's copy root, whose `.publication/pub/<key>`
 * markers the agent mirrors (media.mark) — an unpublish is a 404 at the gate before its
 * files are deleted. The mode is NOT a rule input: the same root gives the same bytes and
 * the same hash (rulesRootFor). A `none` host serves no media: asking for rules there is a
 * refusal, not an empty file.
 *
 * THE HOST-WIDE NGINX MAP (provision init §13.4). An nginx host needs its http{} map loaded
 * BEFORE the media include (the include uses `$dedalo_auth_key` and the two SVG variables).
 * On a publication host provisioned with `web.nginx_map: conf_d`, that map is ONE host-wide
 * file root renders from every instance's contribution; this engine contributes
 * buildNginxMap() with nginxMapConfigHash() through `rules.map` (expectedNginxMap). A host
 * whose map the operator places by hand (`managed: false`) gets no push, and that is not drift.
 *
 * Reads config (getPublicQualities, mediaDir inside the builders); no I/O of its own.
 */

import { DedaloError } from '../errors/dedalo_error.ts';
import { buildNginxMap, getPublicQualities, nginxMapConfigHash } from '../media/protection.ts';
import {
	buildPublicationHostApacheConf,
	buildPublicationHostNginxConf,
	getPublicationHostConfigHash,
	normalizePublicationHostInput,
	type PublicationHostRuleInput,
	type PublicationHostServer,
} from '../media/publication_host_rules.ts';
import type { AgentStatus } from './agent_client.ts';
import type { PublicationHostRecord } from './registry.ts';
import { AGENT_REASON_SENTENCES } from './wire.ts';

export interface ExpectedRules {
	server: PublicationHostServer;
	text: string;
	hash: string;
	/** Requested qualities the public filter refused: reported, never silent. */
	dropped: string[];
}

/** Why no expected rules exist: `mode` (a `none` host: no media), `server` (the agent reports
 * a web server the profile has no builder for), `root` (no media root reported),
 * `input` (the phase-1 normalizer refused the root or left no public quality). */
export type ExpectedRulesRefusal = 'mode' | 'server' | 'root' | 'input';

export type ExpectedRulesOutcome =
	| { ok: true; hash: string; dropped: string[] }
	| { ok: false; reason: ExpectedRulesRefusal };

const RENDERERS: Readonly<
	Record<PublicationHostServer, (input: PublicationHostRuleInput) => string>
> = Object.freeze({
	apache: buildPublicationHostApacheConf,
	nginx: buildPublicationHostNginxConf,
});

interface RenderTarget {
	server: PublicationHostServer;
	root: string;
}

function isRulesServer(value: string): value is PublicationHostServer {
	return value === 'apache' || value === 'nginx';
}

function renderTarget(status: AgentStatus): RenderTarget | ExpectedRulesRefusal {
	const { server } = status.rules;
	const { mode, root } = status.media;
	if (mode === 'none') return 'mode';
	if (!isRulesServer(server)) return 'server';
	return root === null ? 'root' : { server, root: rulesRootFor(status) };
}

/**
 * The root the publication_host profile gates on THIS host: the agent's own MEDIA_ROOT,
 * for `shared` (the read-only mount) and `copy` (the copy root) alike — the mode is
 * deliberately not a rule input. A host with no media root (`none`, or a status that
 * reports none) has nothing to gate: request.invalid_options.
 */
export function rulesRootFor(status: AgentStatus): string {
	const { mode, root } = status.media;
	if (mode === 'none' || root === null) {
		throw new DedaloError('request.invalid_options', {
			message: `publication host media mode '${mode}' has no media root to gate`,
			publicMessage:
				'This publication host serves no media (no media root): there are no media rules to apply',
		});
	}
	return root;
}

/** The include `apply_rules` sends. Throws request.invalid_options when there is none. */
export function expectedRulesForHost(
	record: PublicationHostRecord,
	status: AgentStatus,
): ExpectedRules {
	const target = renderTarget(status);
	if (typeof target === 'string') {
		throw new DedaloError('request.invalid_options', {
			message: `publication host ${record.name}: no media rules to render (${target})`,
		});
	}
	const input = normalizePublicationHostInput({
		root: target.root,
		qualities: record.qualities ?? getPublicQualities(),
	});
	return {
		server: target.server,
		text: RENDERERS[target.server](input),
		hash: getPublicationHostConfigHash(target.server, input),
		dropped: input.dropped,
	};
}

/** The same decision as a value, for the panel: a refusal becomes a reason, never a throw. */
export function expectedRulesOutcome(
	record: PublicationHostRecord,
	status: AgentStatus,
): ExpectedRulesOutcome {
	const target = renderTarget(status);
	if (typeof target === 'string') return { ok: false, reason: target };
	try {
		const { hash, dropped } = expectedRulesForHost(record, status);
		return { ok: true, hash, dropped };
	} catch (error) {
		if (error instanceof DedaloError && error.code === 'request.invalid_options') {
			return { ok: false, reason: 'input' };
		}
		throw error;
	}
}

/** What `rules.map` sends: the engine's http{} map and its hash (protection.ts, never re-derived). */
export interface ExpectedNginxMap {
	text: string;
	hash: string;
}

/**
 * The host-wide map this engine contributes to `status`'s host, or null when there is none to
 * push: an Apache host, a host serving no media (`none`), an agent that predates the host map
 * (no `rules.map`), or a map the operator places by hand (`managed: false` — not drift).
 */
export function expectedNginxMap(status: AgentStatus): ExpectedNginxMap | null {
	if (status.rules.server !== 'nginx' || status.media.mode === 'none') return null;
	const map = status.rules.map;
	if (map === undefined || map === null || map.managed !== true) return null;
	return { text: buildNginxMap(), hash: nginxMapConfigHash() };
}

/** The panel's view of one host's map (null: no host-wide map applies to this host). */
export interface NginxMapPanel {
	managed: boolean;
	/** nginxMapConfigHash() when a push applies; null otherwise. */
	expected: string | null;
	/** This instance's contribution hash in the LOADED host file (agent-reported, shaped), or null. */
	applied: string | null;
	/** The loaded host file's hash (shared), or null. */
	host_hash: string | null;
	contributions: number;
	invalid: number;
	/** The agent reason root recorded for this instance (a `map_*` reason, else 'malformed'), or null. */
	refused: string | null;
	/** expected and applied disagree: counts as drift. */
	drift: boolean;
	/** The agent predates the host map (no `rules.map` in its status). */
	agent_outdated: boolean;
}

const HEX64 = /^[0-9a-f]{64}$/;
const shaped = (value: string | null): string | null =>
	value !== null && HEX64.test(value) ? value : null;
/**
 * The agent's closed map-refusal vocabulary: the `map_*` members of the twin-gated agent reason
 * table. A recorded refusal outside it is served as 'malformed' (E7: agent text is not a fact
 * until checked), so a refusal is never hidden and never invents a state word.
 */
const MAP_REFUSAL_REASONS: ReadonlySet<string> = new Set(
	Object.keys(AGENT_REASON_SENTENCES).filter((reason) => reason.startsWith('map_')),
);
const mapRefusal = (value: string | null): string | null =>
	value === null ? null : MAP_REFUSAL_REASONS.has(value) ? value : 'malformed';

/** The panel row's map state, from a proved status. Pure apart from the engine's own config. */
export function nginxMapPanel(status: AgentStatus): NginxMapPanel | null {
	if (status.rules.server !== 'nginx' || status.media.mode === 'none') return null;
	const map = status.rules.map;
	const empty = { applied: null, host_hash: null, contributions: 0, invalid: 0, refused: null };
	if (map === undefined)
		return { managed: false, expected: null, ...empty, drift: true, agent_outdated: true };
	if (map === null || map.managed !== true) {
		return { managed: false, expected: null, ...empty, drift: false, agent_outdated: false };
	}
	const expected = nginxMapConfigHash();
	const applied = shaped(map.hash);
	return {
		managed: true,
		expected,
		applied,
		host_hash: shaped(map.host_hash),
		contributions: map.contributions,
		invalid: map.invalid,
		refused: mapRefusal(map.refused),
		drift: applied !== expected,
		agent_outdated: false,
	};
}

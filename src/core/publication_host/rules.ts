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
 * Reads config (getPublicQualities, mediaDir inside the builders); no I/O of its own.
 */

import { DedaloError } from '../errors/dedalo_error.ts';
import { getPublicQualities } from '../media/protection.ts';
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

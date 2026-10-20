/**
 * THE INSTALL FOLDER AND SERVICE ACCOUNT, IN WORDS (owner decisions
 * 2026-10-12) — what the Review shows of the identity verdict
 * (host/production/identity_rules.ts): what the installer will CREATE and
 * what it will USE AS IS, and what the operator is told. One formatter: the
 * screen model (plain and full-screen alike) renders these lines; no front end
 * words them itself. Without a verdict (the probe has not run — a headless
 * plan) the lines say the System check decides.
 *
 * PURE AND CONFIG-FREE (types only from the host module).
 */

import type { IdentityVerdict } from './host/production/identity_rules.ts';
import type { InstallAnswers } from './install_plan.ts';

/** One labelled Review line. */
export interface IdentityLine {
	label: 'install folder' | 'service user' | 'service group' | 'database user' | 'note';
	value: string;
}

/** Not measured yet: the run's System check (host_preflight) decides. */
const UNDECIDED = 'created or used as is — decided by the System check of the run';

/** The folder's line. */
function folderValue(answers: InstallAnswers, verdict: IdentityVerdict): string {
	const d = answers.install_dir;
	const owner = `${verdict.user.name}:${verdict.group.name}`;
	const folder = verdict.folder;
	if (folder.kind === 'owned') {
		return `${d} — USED AS IS (${folder.empty ? 'empty' : `owned by ${verdict.user.name}`})`;
	}
	if (folder.kind === 'adopt') {
		return `${d} — ADOPTED (empty; ${folder.owner}:${folder.group} → ${owner} 0750, given back by --abort)`;
	}
	const parents =
		folder.ancestors.length === 0 ? '' : `, parents created: ${folder.ancestors.join(', ')}`;
	return `${d} — CREATED (${owner} 0750${folder.by === 'user' ? `, by ${verdict.user.name}` : ''}; parent ${verdict.parent} unchanged${parents})`;
}

/** The user's line. */
function userValue(verdict: IdentityVerdict): string {
	const user = verdict.user;
	return user.create
		? `${user.name} — CREATED (system account, no login shell)`
		: `${user.name} — USED AS IS (uid ${String(user.uid)}; never created or deleted by the installer)`;
}

/** The group's line. */
function groupValue(verdict: IdentityVerdict): string {
	const group = verdict.group;
	if (group.create) return `${group.name} — CREATED`;
	return group.primaryOf === null
		? `${group.name} — USED AS IS`
		: `${group.name} — USED AS IS (primary group of ${group.primaryOf})`;
}

/** The role line (a created database only: its role IS the service user). */
function roleLines(answers: InstallAnswers): IdentityLine[] {
	return answers.db_mode === 'create'
		? [{ label: 'database user', value: `${answers.db_username} (peer: the service user)` }]
		: [];
}

/** The Review's identity lines (production only; [] elsewhere). */
export function identityLines(
	answers: InstallAnswers,
	verdict: IdentityVerdict | undefined,
): IdentityLine[] {
	if (answers.route !== 'production' || answers.engine_only) return [];
	if (verdict === undefined) {
		return [
			{ label: 'install folder', value: `${answers.install_dir} — ${UNDECIDED}` },
			{ label: 'service user', value: `${answers.service_user} — ${UNDECIDED}` },
			{
				label: 'service group',
				value: answers.service_group || `the service user's own group — ${UNDECIDED}`,
			},
			...roleLines(answers),
		];
	}
	return [
		{ label: 'install folder', value: folderValue(answers, verdict) },
		{ label: 'service user', value: userValue(verdict) },
		{ label: 'service group', value: groupValue(verdict) },
		...roleLines(answers),
		...verdict.told.map((line) => ({ label: 'note' as const, value: line })),
	];
}

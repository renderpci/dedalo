/**
 * THE OTHER DÉDALO INSTANCES ON THIS HOST (owner decisions 2026-10-12: one
 * service user, one service group and one install folder per instance) — what
 * host_preflight and the identity probe compare this install's answers with.
 * Read-only, through the HostFs, merged from four sources (each record names
 * the file that says so, so the operator can remove a genuinely stale one):
 *
 *  1. the host registry `/var/lib/dedalo-install/instances/<j>.json`
 *     (host_identity writes the user, group, folder and backup dir there);
 *  2. the stamped drop-ins `/etc/systemd/system/dedalo-ts@<j>.service.d/
 *     10-dedalo-install.conf` (`# dedalo-install <j> …`): User=, Group=,
 *     WorkingDirectory= (its parent is the install folder). A stamped drop-in
 *     WITHOUT User= is UNKNOWN — refused with its path, never guessed;
 *  3. the host run records `/var/lib/dedalo-install/<j>/install.state.json`
 *     (an interrupted install), counted only while `in_progress` or
 *     `complete`, the group taken from its FROZEN facts (never the plan's
 *     `service_group ''`);
 *  4. a hand-installed `/etc/systemd/system/dedalo*.service` (no `@`): its
 *     User=, Group=, WorkingDirectory=. Always a record — even when its name
 *     equals this instance's (only sources 1-3 can be this install's own).
 *
 * A unit with User= and NO Group= runs with that user's PRIMARY group (the
 * documented manual unit does): resolved by `getent` (withPrimaryGroups);
 * one that cannot be resolved is UNKNOWN — refused with its path, never
 * guessed.
 *
 * PURE parsers + the gather functions.
 */

import { dirname } from 'node:path';
import { normalizeInstallAnswers } from '../../install_plan.ts';
import { PLAN_FILE, STATE_FILE } from '../../run_files_core.ts';
import type { HostFs } from '../fs.ts';
import { INSTALL_STATE_ROOT } from '../layout.ts';

export interface OtherInstance {
	instance: string;
	/** null = the source does not say (refused when it is a stamped drop-in — `unknown`). */
	user: string | null;
	group: string | null;
	installDir: string | null;
	backupDir: string | null;
	/** The file that says so. */
	source: string;
	/**
	 * Why the account cannot be told (refused with its path), or null: a
	 * stamped drop-in without User=, a User= whose primary group is unknown.
	 */
	unknown: string | null;
}

/** The unknown-account reason of a stamped drop-in without User=. */
export const NO_USER = 'sets no User=';

const SYSTEMD_DIR = '/etc/systemd/system';
const REGISTRY_DIR = `${INSTALL_STATE_ROOT}/instances`;

/** One `Key=value` of a unit text (the LAST assignment wins, as systemd reads it). */
export function unitValue(text: string, key: string): string | null {
	const values = [...text.matchAll(new RegExp(`^\\s*${key}=(.*)$`, 'gm'))].map((m) =>
		(m[1] as string).trim(),
	);
	const last = values.at(-1);
	return last === undefined || last === '' ? null : last;
}

/** The record a unit text gives (`dir` = WorkingDirectory's parent, the install folder). */
export function unitRecord(
	instance: string,
	text: string,
	source: string,
	stamped: boolean,
): OtherInstance {
	const user = unitValue(text, 'User');
	const working = unitValue(text, 'WorkingDirectory');
	return {
		instance,
		user,
		group: unitValue(text, 'Group'),
		installDir: working === null ? null : dirname(working),
		backupDir: null,
		source,
		unknown: stamped && user === null ? NO_USER : null,
	};
}

/** A JSON file's object, or null. */
function readJson(fs: HostFs, path: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(fs.readText(path) ?? 'null');
		return parsed !== null && typeof parsed === 'object'
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

/** A string field, or null. */
function field(record: Record<string, unknown>, key: string): string | null {
	const value = record[key];
	return typeof value === 'string' && value !== '' ? value : null;
}

/** Source 1: the registry. */
function registryRecords(fs: HostFs): OtherInstance[] {
	return fs
		.list(REGISTRY_DIR)
		.filter((name) => name.endsWith('.json'))
		.flatMap((name) => {
			const source = `${REGISTRY_DIR}/${name}`;
			const entry = readJson(fs, source);
			if (entry === null) return [];
			return [
				{
					instance: field(entry, 'instance') ?? name.slice(0, -5),
					user: field(entry, 'user'),
					group: field(entry, 'group'),
					installDir: field(entry, 'install_dir'),
					backupDir: field(entry, 'backup_dir'),
					source,
					unknown: null,
				},
			];
		});
}

/** Source 2: the stamped drop-ins of dedalo-ts@<j>. */
function dropinRecords(fs: HostFs): OtherInstance[] {
	return fs.list(SYSTEMD_DIR).flatMap((name) => {
		const instance = /^dedalo-ts@(.+)\.service\.d$/.exec(name)?.[1];
		if (instance === undefined) return [];
		const source = `${SYSTEMD_DIR}/${name}/10-dedalo-install.conf`;
		const text = fs.readText(source);
		if (text === null || !text.startsWith(`# dedalo-install ${instance} `)) return [];
		return [unitRecord(instance, text, source, true)];
	});
}

/** A live run record's state and plan (null: absent, unreadable, aborted). */
function liveRun(
	fs: HostFs,
	dir: string,
): { state: Record<string, unknown>; plan: Record<string, unknown> } | null {
	const state = readJson(fs, `${dir}/${STATE_FILE}`);
	const plan = readJson(fs, `${dir}/${PLAN_FILE}`);
	if (state === null || plan === null) return null;
	return ['in_progress', 'complete'].includes(String(state.outcome)) ? { state, plan } : null;
}

/** '' → null. */
function named(value: string): string | null {
	return value === '' ? null : value;
}

/** The service account a host run record froze (its group from the facts, never the plan's ''). */
function runRecord(fs: HostFs, instance: string): OtherInstance | null {
	const dir = `${INSTALL_STATE_ROOT}/${instance}`;
	const run = liveRun(fs, dir);
	if (run === null) return null;
	const answers = normalizeInstallAnswers(
		(run.plan.answers ?? {}) as Record<string, unknown>,
	).answers;
	return {
		instance,
		user: named(answers.service_user),
		group:
			named(frozenAccount(run.state)?.groupName ?? '') ??
			named(answers.service_group || answers.service_user),
		installDir: named(answers.install_dir),
		backupDir: named(answers.backup_dir),
		source: `${dir}/${STATE_FILE}`,
		unknown: null,
	};
}

/** state.preflight.host.facts.account, when the run froze it. */
function frozenAccount(state: Record<string, unknown>): { groupName?: string } | null {
	const preflight = state.preflight as { host?: { facts?: { account?: { groupName?: string } } } };
	return preflight?.host?.facts?.account ?? null;
}

/** Source 3: the host run records. */
function runRecords(fs: HostFs): OtherInstance[] {
	return fs
		.list(INSTALL_STATE_ROOT)
		.map((name) => runRecord(fs, name))
		.filter((record): record is OtherInstance => record !== null);
}

/** Source 4: hand-installed single units (`dedalo*.service`, no `@`). */
function manualRecords(fs: HostFs): OtherInstance[] {
	return fs
		.list(SYSTEMD_DIR)
		.filter((name) => /^dedalo[^@]*\.service$/.test(name))
		.flatMap((name) => {
			const source = `${SYSTEMD_DIR}/${name}`;
			const text = fs.readText(source);
			return text === null
				? []
				: [unitRecord(name.slice(0, -'.service'.length), text, source, false)];
		});
}

/**
 * Every OTHER instance's records (all sources — each is checked on its own).
 * Only the installer's own sources (1-3) can be THIS instance's (a resume);
 * a hand-installed unit is another install whatever its name.
 */
export function otherInstances(fs: HostFs, instance: string): OtherInstance[] {
	return [
		...[...registryRecords(fs), ...dropinRecords(fs), ...runRecords(fs)].filter(
			(record) => record.instance !== instance,
		),
		...manualRecords(fs),
	];
}

/**
 * A record with User= but no group: the user's PRIMARY group, by `primaryGroup`
 * (a getent lookup); unresolvable → UNKNOWN (see the header).
 */
export async function withPrimaryGroups(
	records: readonly OtherInstance[],
	primaryGroup: (user: string) => Promise<string | null>,
): Promise<OtherInstance[]> {
	const resolved: OtherInstance[] = [];
	for (const record of records) {
		if (record.user === null || record.group !== null || record.unknown !== null) {
			resolved.push(record);
			continue;
		}
		const group = await primaryGroup(record.user);
		resolved.push(
			group === null
				? {
						...record,
						unknown: `runs as User=${record.user}, whose primary group cannot be resolved`,
					}
				: { ...record, group },
		);
	}
	return resolved;
}

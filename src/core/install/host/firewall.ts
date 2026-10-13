/**
 * IS THE WEB REACHABLE THROUGH THE HOST FIREWALL? (campaign 3 C3-6,
 * 2026-10-13) — the installer CHECKS and TELLS, it never changes the firewall
 * (owner). A production install on EL 10 completed while firewalld kept 80/443
 * closed: the last probe connects from the host itself (127.0.0.1), so only a
 * browser elsewhere found out. This module turns what the firewall reports into
 * a VERDICT for the ports the instance serves on:
 *
 *  - firewalld (active): the DEFAULT zone's services and ports — `http` covers
 *    80, `https` 443, `<p>/tcp` (or a `<a>-<b>/tcp` range) any port. An
 *    interface bound to another zone is not read: the line names the zone;
 *  - ufw: `ufw status` — inactive filters nothing; active: its ALLOW rules
 *    (ports, ranges, lists, and the web servers' application profiles);
 *  - neither: nothing was read (an nftables/iptables ruleset is not parsed).
 *
 * `closed` carries the exact command that opens the missing ports (shown on the
 * System check, the Review's to-do and the closing To-do — never run).
 *
 * PURE: parsers and the verdict; facts.ts gathers the outputs.
 */

/** What the host firewall reported (facts.ts gathers it; read-only commands). */
export type FirewallFacts =
	| { tool: 'firewalld'; zone: string; services: string[]; ports: string[] }
	| { tool: 'ufw'; active: boolean; allowed: string[] }
	| { tool: 'none' }
	/** A query that failed (`what` names it): no evidence either way. */
	| { tool: 'unknown'; what: string };

export interface FirewallVerdict {
	state: 'open' | 'closed' | 'inactive' | 'none' | 'unknown';
	/** One sentence for the System check, the preflight and the Review. */
	line: string;
	/** The command that opens the missing ports (closed only). */
	command: string | null;
}

/** firewalld's services that name a web port. */
const FIREWALLD_SERVICES: Readonly<Record<string, string>> = Object.freeze({
	'80': 'http',
	'443': 'https',
});

/** ufw's application profiles of the web servers (`ufw app list`) and the ports each opens. */
const UFW_PROFILES: Readonly<Record<string, readonly string[]>> = Object.freeze({
	'Nginx Full': ['80', '443'],
	'Nginx HTTP': ['80'],
	'Nginx HTTPS': ['443'],
	'Apache Full': ['80', '443'],
	Apache: ['80'],
	'Apache Secure': ['443'],
	'WWW Full': ['80', '443'],
	WWW: ['80'],
	'WWW Secure': ['443'],
});

/** Does a `<a>[-|:]<b>` range (or a single port) cover `port`? */
function covers(spec: string, port: string): boolean {
	const [low, high = low] = spec.split(/[-:]/);
	const value = Number(port);
	return Number(low) <= value && value <= Number(high);
}

/** Does a firewalld port entry (`8080/tcp`, `8000-8100/tcp`) open `port` over TCP? */
function firewalldPortOpens(entry: string, port: string): boolean {
	const [spec = '', protocol = ''] = entry.split('/');
	return protocol === 'tcp' && covers(spec, port);
}

/** Does a ufw rule target (`80/tcp`, `80,443/tcp`, `8000:8100/tcp`, `Nginx Full`) open `port`? */
function ufwTargetOpens(target: string, port: string): boolean {
	const profile = UFW_PROFILES[target];
	if (profile !== undefined) return profile.includes(port);
	const match = /^([\d,:]+)(?:\/(tcp|udp))?$/.exec(target);
	if (match === null || match[2] === 'udp') return false;
	return (match[1] as string).split(',').some((spec) => covers(spec, port));
}

/** `ufw status` → active, and the targets of its ALLOW rules (IPv6 duplicates folded). */
export function parseUfwStatus(output: string): { active: boolean; allowed: string[] } {
	const active = /^Status:\s*active\b/m.test(output);
	const allowed = output
		.split('\n')
		.map((line) => line.trim().split(/\s{2,}/))
		.filter((cols) => /^ALLOW\b/.test(cols[1] ?? ''))
		.map((cols) => (cols[0] as string).replace(/\s*\(v6\)$/, '').replace(/\s+on\s+\S+$/, ''));
	return { active, allowed: [...new Set(allowed)] };
}

/** firewalld's `--list-services` / `--list-ports` output → its words. */
export function words(output: string): string[] {
	return output.trim().split(/\s+/).filter(Boolean);
}

/** The ports of `wanted` firewalld does not open, and the command that opens them. */
function firewalldGaps(
	facts: Extract<FirewallFacts, { tool: 'firewalld' }>,
	wanted: readonly string[],
): { missing: string[]; command: string } {
	const missing = wanted.filter(
		(port) =>
			!facts.services.includes(FIREWALLD_SERVICES[port] ?? '') &&
			!facts.ports.some((entry) => firewalldPortOpens(entry, port)),
	);
	const flags = missing.map((port) =>
		FIREWALLD_SERVICES[port] === undefined
			? `--add-port=${port}/tcp`
			: `--add-service=${FIREWALLD_SERVICES[port]}`,
	);
	return {
		missing,
		command: `firewall-cmd --permanent ${flags.join(' ')} && firewall-cmd --reload`,
	};
}

/** The verdict sentence of a closed firewall. */
function closedLine(what: string, missing: readonly string[], command: string): FirewallVerdict {
	return {
		state: 'closed',
		line: `${what} does not allow port ${missing.join(' and ')} — browsers elsewhere cannot reach the site; open it yourself (the installer never changes the firewall): ${command}`,
		command,
	};
}

/** firewalld's verdict. */
function firewalldVerdict(
	facts: Extract<FirewallFacts, { tool: 'firewalld' }>,
	wanted: readonly string[],
): FirewallVerdict {
	const what = `firewalld (default zone ${facts.zone})`;
	const { missing, command } = firewalldGaps(facts, wanted);
	if (missing.length > 0) return closedLine(what, missing, command);
	return { state: 'open', line: `${what} allows port ${wanted.join(' and ')}`, command: null };
}

/** ufw's verdict. */
function ufwVerdict(
	facts: Extract<FirewallFacts, { tool: 'ufw' }>,
	wanted: readonly string[],
): FirewallVerdict {
	if (!facts.active) {
		return {
			state: 'inactive',
			line: 'ufw is installed but inactive (nothing filtered)',
			command: null,
		};
	}
	const missing = wanted.filter(
		(port) => !facts.allowed.some((target) => ufwTargetOpens(target, port)),
	);
	if (missing.length > 0)
		return closedLine('ufw (active)', missing, `ufw allow ${missing.join(',')}/tcp`);
	return { state: 'open', line: `ufw (active) allows port ${wanted.join(' and ')}`, command: null };
}

/** THE verdict for the ports the instance serves on (`wanted`: http, https). */
export function firewallVerdict(facts: FirewallFacts, wanted: readonly string[]): FirewallVerdict {
	if (facts.tool === 'firewalld') return firewalldVerdict(facts, wanted);
	if (facts.tool === 'ufw') return ufwVerdict(facts, wanted);
	if (facts.tool === 'unknown') {
		return {
			state: 'unknown',
			line: `${facts.what} failed — whether port ${wanted.join(' and ')} is reachable from outside is not known; check the firewall yourself`,
			command: null,
		};
	}
	return {
		state: 'none',
		line: 'no firewalld or ufw found — if nftables/iptables rules exist, the installer did not read them',
		command: null,
	};
}

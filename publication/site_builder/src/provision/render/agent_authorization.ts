/**
 * THE AGENT AUTHORIZATION — the one host artifact that lets a non-root daemon manage its
 * agent units at all: STOP and KILL a live run of one of ITS OWN declared sites, and nothing
 * else. It never grants START (F2), and since LEAD-1b it does not need to.
 *
 * WHY NO "start" (F2, 2026-09-26 audit). A polkit rule for manage-units is handed the unit
 * NAME and the VERB — and, for a transient start, nothing else: not `User=`, not any other
 * property of the unit being created. On systemd >= 257 a rule granting "start" on
 * `<prefix>*.service` therefore granted `systemd-run --unit=<prefix>x.service --uid=root …` to
 * the service user: the daemon was root-equivalent. No rule can bind the run-as uid.
 *
 * WHY NONE IS NEEDED (LEAD-1b). Root renders one socket, one target and one template per
 * (site k, door d) (`render/agent_units.ts`), with `User=` the site's identity written in the
 * file. The daemon starts nothing: it connects to the site's socket (the service user's own,
 * 0600) and PID 1 starts the instance — socket activation asks polkit nothing. What the daemon
 * still needs is CLEANUP: stop a run that outlived its connection (the death probe, the boot
 * reconciliation) and kill one that will not stop. That is this rule, and all of it:
 *
 *   Subject:  this instance's service user, by name.
 *   Action:   `org.freedesktop.systemd1.manage-units`.
 *   Object:   an INSTANCE of an ENUMERATED site's door template —
 *             `^<prefix>s(<k1>|<k2>|…)-(turn|build|git)@<nr>-<pid>-<uid>\.service$`, the k list
 *             being exactly the declared sites' ordinals (the AF_UNIX instance form of socket.c
 *             `instance_from_socket`). Not the template, not a socket, not a target, not the
 *             daemon's own unit, not a transient-style name, not an undeclared site, not another
 *             museum whose prefix happens to extend this one's.
 *   Verbs:    `stop`, `kill`. Never `start`, `restart`, `set-property` or anything else.
 *
 * Everything else falls through as NOT_HANDLED, so this file can only ADD the permission it
 * names; it cannot take one away or widen another rule. A removed site is removed from the
 * enumeration BEFORE its units are deleted (`provision apply`), so the grant never outlives a
 * site.
 *
 * WHY IT IS RENDERED AND NOT DOCUMENTED. A hand-written rule is a second owner of the museum's
 * identity; rendered from the layout and the host's identity facts, it cannot disagree with
 * the daemon that uses it. The renderer law of ./types.ts applies: pure, zero-dep, stamped,
 * carrying no credential. The stamp is a `//` comment, because polkit rules are JavaScript.
 * Without facts it renders a rule that enumerates no site — which grants nothing.
 */

import { INSTANCE_SUFFIX_SOURCE, isAgentOrdinal } from '../../drivers/agent_identity';
import { DOORS } from '../../drivers/network_profile';
import type { InstanceLayout, InstanceManifest } from '../layout';
import { UNIX_NAME_PATTERN } from '../layout';
import type { RenderFacts, Renderer } from './types';
import { artifact } from './types';

/** The polkit action every unit verb (start, stop, kill…) is checked against. */
export const MANAGE_UNITS_ACTION = 'org.freedesktop.systemd1.manage-units';

/**
 * The complete set of verbs this rule will ever answer YES to: cleanup of a running unit.
 * NEVER "start" (header, F2) — and the daemon has no use for one: socket activation starts
 * its runs without asking polkit anything.
 */
export const AGENT_UNIT_VERBS: readonly string[] = Object.freeze(['stop', 'kill']);

/**
 * A value that becomes a JavaScript string literal inside a root-installed rule file.
 *
 * Refused rather than escaped, for the same reason `render/unit.ts` refuses a newline in a
 * unit value: the grammars that would have to be escaped correctly here are two (JavaScript
 * string escapes and polkit's own file parsing), the strings this file interpolates are all
 * held to `UNIX_NAME_PATTERN` or built from it, and an escape is a property every future
 * call site would have to get right while a grammar is a property of the value.
 */
function ruleLiteral(label: string, value: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(
      `render(agent_authorization): ${label} '${String(value)}' does not match ${pattern.source}. ` +
        `It becomes a JavaScript string in a root-installed polkit rule, where a quote or a ` +
        `backslash would end the literal and the rest would be code. Nothing was rendered.`,
    );
  }
  return value;
}

/** The unit-name prefix grammar: the service user's own naming, plus the trailing dash. */
const UNIT_PREFIX_PATTERN = /^[a-z][a-z0-9-]{2,60}-$/;

export const agentAuthorizationRenderer: Renderer = {
  kind: 'agent_authorization',

  render(layout: InstanceLayout, _manifest: InstanceManifest, facts?: RenderFacts) {
    const user = ruleLiteral('identity.user', layout.identity.user, UNIX_NAME_PATTERN);
    const prefix = ruleLiteral('agentUnitPrefix', layout.agentUnitPrefix, UNIT_PREFIX_PATTERN);
    const verbs = AGENT_UNIT_VERBS.map(verb => `"${verb}"`).join(', ');
    const ordinals = [...new Set(facts ? [...facts.agentIdentities.values()] : [])].sort((a, b) => a - b);
    for (const k of ordinals) {
      if (!isAgentOrdinal(k)) {
        throw new Error(`render(agent_authorization): ${String(k)} is not a site ordinal. Nothing was rendered.`);
      }
    }
    const doors = DOORS.join('|');
    const unitPattern = ordinals.length > 0 ? `^${prefix}s(${ordinals.join('|')})-(${doors})@${INSTANCE_SUFFIX_SOURCE}\\.service$` : null;

    const body = [
      `// GENERATED by publication/site_builder/src/provision/render/agent_authorization.ts`,
      `// — do NOT edit. A hand edit is reported as drift and re-rendered away.`,
      `//`,
      `// Instance: ${layout.instance}`,
      `//`,
      `// WHAT THIS AUTHORIZES, AND NOTHING ELSE: the service user '${user}' may STOP and KILL a`,
      `// live run of one of this museum's DECLARED sites (${ordinals.length > 0 ? ordinals.map(k => `s${k}`).join(', ') : 'none'}): an instance`,
      `// '${prefix}s<k>-<door>@<instance>.service' of a unit root rendered for that site, <instance>`,
      `// being PID 1's name for one accepted connection in every spelling it has had.`,
      `// It may start NOTHING — polkit is never shown the uid a unit would run as. The daemon's`,
      `// runs are started by PID 1 through socket activation, which asks polkit nothing.`,
      `// Every other question falls through to whatever else this host decided.`,
      `polkit.addRule(function (action, subject) {`,
      `  if (action.id !== "${MANAGE_UNITS_ACTION}") {`,
      `    return polkit.Result.NOT_HANDLED;`,
      `  }`,
      `  if (subject.user !== "${user}") {`,
      `    return polkit.Result.NOT_HANDLED;`,
      `  }`,
      ...(unitPattern === null
        ? [
            `  // No site is declared on this host: there is no run to stop, so nothing is granted.`,
            `  return polkit.Result.NOT_HANDLED;`,
          ]
        : [
            `  var unit = action.lookup("unit");`,
            `  if (typeof unit !== "string") {`,
            `    return polkit.Result.NOT_HANDLED;`,
            `  }`,
            `  // Anchored at BOTH ends, the ordinals ENUMERATED: an undeclared site, a template, a`,
            `  // socket, a target, a transient-style name or another museum's unit never matches.`,
            `  if (!/${unitPattern}/.test(unit)) {`,
            `    return polkit.Result.NOT_HANDLED;`,
            `  }`,
            `  var verb = action.lookup("verb");`,
            `  var allowed = [${verbs}];`,
            `  if (allowed.indexOf(verb) === -1) {`,
            `    return polkit.Result.NOT_HANDLED;`,
            `  }`,
            `  return polkit.Result.YES;`,
          ]),
      `});`,
    ].join('\n');

    return [
      artifact(layout, {
        kind: 'agent_authorization',
        path: layout.agentPolicyPath,
        // Read by polkitd running as root: 0644 root:root, like the unit and the vhosts.
        mode: 'hostConfig',
        body: `${body}\n`,
        commentPrefix: '//',
      }),
    ];
  },
};

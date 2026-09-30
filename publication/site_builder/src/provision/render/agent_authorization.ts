/**
 * THE AGENT AUTHORIZATION — the one host artifact that lets a non-root daemon manage its
 * agent units at all. Today that is STOP and KILL only: it may no longer START one (F2, below).
 *
 * WHY IT HAS TO EXIST. The confinement this subsystem now depends on
 * (`src/drivers/confinement.ts`) was built to run each agent turn as a transient systemd
 * service owned by `identity.agentUser`, because the kernel draws no boundary between a process and
 * itself: while the turn ran as the daemon's own uid, `$CREDENTIALS_DIRECTORY`, the
 * provider keys and the audit handle were all readable to it whatever the unit's
 * `Protect*` directives said. Starting a unit as another uid is PID 1's job, and asking PID
 * 1 for it is a privileged operation. So either the daemon is root (it is not, and must
 * never be), or the host says in writing which non-root caller may ask for what — which is
 * what polkit is, and this file is that sentence. What polkit can NOT say is "…as which
 * uid", and that is why the sentence no longer contains "start".
 *
 * WHY IT IS RENDERED AND NOT DOCUMENTED. A hand-written rule is a second owner of the
 * museum's identity: it would state the service user and the unit prefix again, in a file
 * nothing compares against the layout, and the failure mode is silent in the dangerous
 * direction — a stale rule keeps authorizing a name that has moved, or authorizes more than
 * the prefix it was meant to. Rendered from `layout.identity` and `layout.agentUnitPrefix`,
 * it cannot disagree with the daemon that will invoke it.
 *
 * THE GRANT, EXACTLY. Subject: this instance's service user, by name. Action:
 * `org.freedesktop.systemd1.manage-units`. Object: a unit whose name STARTS WITH this
 * museum's agent prefix and ends in `.service`. Verbs: STOP and KILL — cleanup of a unit
 * already running, nothing else. Never start, never enable, never reload the manager, never
 * anything about a unit installed on the host. Everything else falls through as
 * NOT_HANDLED, so this file can only ever ADD the permission it names; it cannot take one
 * away or widen another rule.
 *
 * WHY NO "start" (F2, 2026-09-26 audit). A polkit rule for manage-units is handed the unit
 * NAME and the VERB — and, for a transient start, nothing else: not `User=`, not any other
 * property of the unit being created. On systemd >= 257 (which passes unit details for
 * `StartTransientUnit`) a rule granting "start" on `<prefix>*.service` therefore granted
 * `systemd-run --unit=<prefix>x.service --uid=root …` — or no `--uid` at all, which is root
 * — to the service user: the daemon was root-equivalent, and the confinement it was meant
 * to authorize was the least of what it authorized. (On 252–256 the details are NULL, the
 * rule never matched a transient start, and every confined run was simply denied.) No
 * rule can bind the run-as uid, so no rule may grant the start. A confined run needs a
 * unit whose `User=` is fixed by ROOT — the per-site identities of LEAD-1b, rendered unit
 * files the daemon may only connect to — and until that lands the daemon refuses confined
 * runs up front (`drivers/confinement.ts`, derived from `AGENT_UNIT_VERBS` below).
 *
 * The renderer law of ./types.ts applies here as everywhere: pure, zero-dep, stamped, and
 * carrying no credential. The stamp is a `//` comment, because polkit rules are JavaScript.
 */

import type { InstanceLayout } from '../layout';
import { UNIX_NAME_PATTERN } from '../layout';
import type { Renderer } from './types';
import { artifact } from './types';

/** The polkit action every unit verb (start, stop, kill…) is checked against. */
export const MANAGE_UNITS_ACTION = 'org.freedesktop.systemd1.manage-units';

/**
 * The complete set of verbs this rule will ever answer YES to: cleanup of a running unit.
 *
 * NEVER "start" — polkit sees no run-as uid for a transient start, so granting it is granting
 * root (header, F2). `drivers/confinement.ts` reads this list: while it holds no "start",
 * the daemon refuses every confined run rather than asking PID 1 for one it cannot bound.
 */
export const AGENT_UNIT_VERBS: readonly string[] = Object.freeze(['stop', 'kill']);

/** Whether this rule authorizes the daemon to START a transient agent unit at all. */
export const TRANSIENT_START_AUTHORIZED: boolean = AGENT_UNIT_VERBS.includes('start');

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

  render(layout: InstanceLayout) {
    const user = ruleLiteral('identity.user', layout.identity.user, UNIX_NAME_PATTERN);
    const agentUser = ruleLiteral('identity.agentUser', layout.identity.agentUser, UNIX_NAME_PATTERN);
    const prefix = ruleLiteral('agentUnitPrefix', layout.agentUnitPrefix, UNIT_PREFIX_PATTERN);
    const verbs = AGENT_UNIT_VERBS.map(verb => `"${verb}"`).join(', ');

    const body = [
      `// GENERATED by publication/site_builder/src/provision/render/agent_authorization.ts`,
      `// — do NOT edit. A hand edit is reported as drift and re-rendered away.`,
      `//`,
      `// Instance: ${layout.instance}`,
      `//`,
      `// WHAT THIS AUTHORIZES, AND NOTHING ELSE: the service user '${user}' may STOP and`,
      `// KILL units named '${prefix}<id>.service' — cleanup of an agent run already going.`,
      `// It may NOT start one: polkit is shown a transient unit's name and verb but never`,
      `// the uid it would run as, so a start grant here would let '${user}' start that`,
      `// name as root. Agent runs as '${agentUser}' need root-rendered units (LEAD-1b).`,
      `// It authorizes no other unit, no other verb and no other user; every other`,
      `// question falls through to whatever else this host decided.`,
      `polkit.addRule(function (action, subject) {`,
      `  if (action.id !== "${MANAGE_UNITS_ACTION}") {`,
      `    return polkit.Result.NOT_HANDLED;`,
      `  }`,
      `  if (subject.user !== "${user}") {`,
      `    return polkit.Result.NOT_HANDLED;`,
      `  }`,
      `  var unit = action.lookup("unit");`,
      `  if (typeof unit !== "string") {`,
      `    return polkit.Result.NOT_HANDLED;`,
      `  }`,
      `  // Anchored at BOTH ends: a prefix test alone would authorize`,
      `  // '${prefix}x.service.wanted' style names and anything a future systemd spells`,
      `  // with this stem, and this grant must cover agent services only.`,
      `  if (unit.indexOf("${prefix}") !== 0) {`,
      `    return polkit.Result.NOT_HANDLED;`,
      `  }`,
      `  if (unit.substr(unit.length - 8) !== ".service") {`,
      `    return polkit.Result.NOT_HANDLED;`,
      `  }`,
      `  var verb = action.lookup("verb");`,
      `  var allowed = [${verbs}];`,
      `  if (allowed.indexOf(verb) === -1) {`,
      `    return polkit.Result.NOT_HANDLED;`,
      `  }`,
      `  return polkit.Result.YES;`,
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

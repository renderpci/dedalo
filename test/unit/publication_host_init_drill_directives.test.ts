/**
 * THE EL DRILL'S DIRECTIVE MEASUREMENT HAS SOMETHING TO MEASURE (review 2026-10-21,
 * cross-diffusion r1: scripts/publication_host_init_drill.ts, leg `systemd-analyze`).
 *
 * THE FINDING. The leg recorded `supported_directives` from the units' `# omitted` comments —
 * and no renderer emits one any more (every directive is dated within the systemd floor:
 * provision_render_units / provision_host_map_renderer assert it), so the record always held
 * `{<version>: []}`: a measurement that could not measure anything, accepted as a fact.
 *
 * WHAT IS ASSERTED here, on the REAL rendered units of this checkout (the provisioner's own
 * renderers over the package's unit-gate fixtures) and the leg's pure helpers:
 *   1. the forms the leg probes are the rendered directives: one per (section, key), first
 *      rendering kept, comments and blank lines never forms — and the real units yield MANY
 *      (the leg's `nothing to measure` check would fire on none);
 *   2. each probe unit is a parseable oneshot scaffold carrying exactly the probed line in its
 *      own section, never a key twice;
 *   3. the refusal pattern is systemd-analyze's own wording for an unknown or unparseable key.
 * The VM half (each form accepted by a real EL systemd) is the drill's, recorded per host.
 */

import { describe, expect, test } from 'bun:test';
import { derive } from '../../publication/host_agent/src/provision/layout.ts';
import { hostMapUnitRenderer } from '../../publication/host_agent/src/provision/render/host_map_unit.ts';
import { agentUnitRenderer } from '../../publication/host_agent/src/provision/render/unit_agent.ts';
import { v2UnitRenderer } from '../../publication/host_agent/src/provision/render/unit_v2.ts';
import {
	tlsDeclaration,
	unixDeclaration,
} from '../../publication/host_agent/tests/fixtures/provision_declaration.ts';
import { FIXTURE_FACTS } from '../../publication/host_agent/tests/fixtures/provision_facts.ts';
import {
	DIRECTIVE_REFUSED,
	directiveProbeUnit,
	renderedDirectiveForms,
} from '../../scripts/publication_host_init_drill.ts';

/** The units the provisioner renders today (the fixtures the package's own unit gates use). */
function realUnitBodies(): string[] {
	const unix = derive(unixDeclaration());
	const map = derive({
		...tlsDeclaration(),
		web: { server: 'nginx', unit: 'nginx', nginx_map: 'conf_d' },
	});
	return [
		agentUnitRenderer.render(unix, FIXTURE_FACTS)[0]?.body ?? '',
		v2UnitRenderer.render(unix, FIXTURE_FACTS)[0]?.body ?? '',
		hostMapUnitRenderer.render(map, FIXTURE_FACTS)[0]?.body ?? '',
	];
}

const UNIT = `# rendered by the provisioner
[Unit]
Description=Dédalo publication agent
After=network-online.target

[Service]
Type=notify
ExecStart=/opt/dedalo/bun /opt/dedalo/agent/src/index.ts
ProtectSystem=strict
; a comment
ProtectSystem=full

[Install]
WantedBy=multi-user.target
`;

describe('renderedDirectiveForms', () => {
	test('the REAL rendered units give the leg many forms: every directive line of theirs is one', () => {
		const bodies = realUnitBodies();
		const forms = renderedDirectiveForms(bodies);
		expect(forms.length, 'the leg would measure nothing').toBeGreaterThan(10);
		const keys = new Set(forms.map((f) => f.key));
		for (const body of bodies) {
			for (const line of body.split('\n')) {
				const directive = /^([A-Za-z][A-Za-z0-9]*)=/.exec(line);
				if (directive !== null) expect(keys.has(directive[1] as string), line).toBe(true);
			}
		}
		// The old measurement's source: no renderer omits anything any more.
		for (const body of bodies) expect(body).not.toContain('# omitted');
	});

	test('one form per (section, key), first rendering kept, in first-seen order', () => {
		expect(renderedDirectiveForms([UNIT])).toEqual([
			{ section: 'Unit', key: 'Description', line: 'Description=Dédalo publication agent' },
			{ section: 'Unit', key: 'After', line: 'After=network-online.target' },
			{ section: 'Service', key: 'Type', line: 'Type=notify' },
			{
				section: 'Service',
				key: 'ExecStart',
				line: 'ExecStart=/opt/dedalo/bun /opt/dedalo/agent/src/index.ts',
			},
			{ section: 'Service', key: 'ProtectSystem', line: 'ProtectSystem=strict' },
			{ section: 'Install', key: 'WantedBy', line: 'WantedBy=multi-user.target' },
		]);
	});

	test('a key in two units counts once; the same key in two sections counts twice', () => {
		const other = '[Service]\nProtectSystem=strict\n[Unit]\nType=x\n';
		const forms = renderedDirectiveForms([UNIT, other]);
		expect(forms.filter((f) => f.key === 'ProtectSystem').length).toBe(1);
		expect(forms.filter((f) => f.key === 'Type').map((f) => f.section)).toEqual([
			'Service',
			'Unit',
		]);
	});

	test('comments, blank lines and lines before any section are never forms', () => {
		expect(renderedDirectiveForms(['# omitted (systemd 250): Foo=yes\nBar=1\n\n; x\n'])).toEqual(
			[],
		);
	});
});

describe('directiveProbeUnit', () => {
	test('a [Service] directive: the oneshot scaffold plus the line, in [Service]', () => {
		const unit = directiveProbeUnit({
			section: 'Service',
			key: 'ProtectSystem',
			line: 'ProtectSystem=strict',
		});
		expect(unit).toBe(
			'[Unit]\nDescription=dd floor probe\n[Service]\nType=oneshot\nExecStart=/bin/true\nProtectSystem=strict\n',
		);
	});

	test('a scaffold key is REPLACED by the rendered line, never doubled', () => {
		const unit = directiveProbeUnit({ section: 'Service', key: 'Type', line: 'Type=notify' });
		expect(unit.match(/^Type=/gm)?.length).toBe(1);
		expect(unit).toContain('Type=notify');
		expect(unit).not.toContain('Type=oneshot');
	});

	test('a directive of another section gets its own section', () => {
		const unit = directiveProbeUnit({
			section: 'Install',
			key: 'WantedBy',
			line: 'WantedBy=multi-user.target',
		});
		expect(unit.endsWith('[Install]\nWantedBy=multi-user.target\n')).toBe(true);
	});
});

describe('DIRECTIVE_REFUSED', () => {
	test("matches systemd-analyze's unknown/unparseable wording, not a clean or unrelated line", () => {
		for (const refused of [
			"/run/systemd/system/dd-floor-probe.service:4: Unknown key name 'Foo' in section 'Service', ignoring.",
			"/run/x.service:3: Unknown lvalue 'Foo' in section 'Service', ignoring",
			'/run/x.service:2: Failed to parse protect system value, ignoring: bogus',
			"/run/x.service:5: Unknown section 'Bogus'. Ignoring.",
		]) {
			expect(DIRECTIVE_REFUSED.test(refused), refused).toBe(true);
		}
		expect(DIRECTIVE_REFUSED.test('')).toBe(false);
		expect(
			DIRECTIVE_REFUSED.test('dd-floor-probe.service: Command /bin/true is not executable'),
		).toBe(false);
	});
});

/**
 * `provision init`'s command line (spec §1.2). INIT_FLAGS is THE flag set: the guide's flag
 * table (test/unit/publication_host_operator_doc.test.ts) and the trampoline's hand-over subset
 * (init/constants.ts INIT_FLAGS_HANDOVER, tests/init_install_sh.test.ts) are held to it.
 *
 * PURE, ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts).
 */
import { PAIR_NAME_PATTERN } from '../exec_contract';
import { ABSOLUTE_PATH_PATTERN, INSTANCE_PATTERN } from '../layout';
import type { InitArgs } from './types';
import { ITEM_ID_PATTERN } from './types';

export interface InitFlag {
  readonly flag: string;
  /** The value's placeholder, or null for a boolean flag. */
  readonly value: string | null;
  readonly repeatable: boolean;
  readonly help: string;
}

export const INIT_FLAGS: readonly InitFlag[] = Object.freeze([
  { flag: '--draft', value: '<file>', repeatable: false, help: 'the draft declaration (optional once the final declaration exists)' },
  { flag: '--source', value: '<dir>', repeatable: false, help: 'the staged source (install.sh passes it); needs --source-digest-confirmed' },
  { flag: '--source-digest-confirmed', value: '<sha256>', repeatable: false, help: 'the source digest the operator confirmed' },
  { flag: '--bun-archive', value: '<zip>', repeatable: false, help: 'the verified Bun archive (install.sh passes it)' },
  { flag: '--bun-sums', value: '<file>', repeatable: false, help: "Bun's SHASUMS256.txt, a cross-check (optional)" },
  { flag: '--kit-file', value: '<file>', repeatable: false, help: 'the kit install.sh was given (install.sh passes it): offered for removal once the install converged' },
  { flag: '--kit-digest-confirmed', value: '<sha256>', repeatable: false, help: "the kit's verified sha256 (install.sh passes it); needs --kit-file" },
  { flag: '--yes', value: null, repeatable: false, help: "apply every 'will change' item; never resolves a decision" },
  { flag: '--decide', value: '<item-id>=<option>', repeatable: true, help: 'answer one decision (repeatable)' },
  { flag: '--resume', value: null, repeatable: false, help: 'continue a run the journal shows unfinished' },
  { flag: '--dry-run', value: null, repeatable: false, help: 'discover and compare only; write nothing' },
  { flag: '--pair-name', value: '<name>', repeatable: false, help: "the engine's name for this agent (default: the instance)" },
  { flag: '--no-pair', value: null, repeatable: false, help: 'print the pairing instructions instead of pairing' },
].map(flag => Object.freeze(flag)));

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function initUsageLines(): string[] {
  const valued = INIT_FLAGS.map(f => (f.value === null ? `[${f.flag}]` : `[${f.flag} ${f.value}]${f.repeatable ? '...' : ''}`));
  return [`usage: provision init <instance> ${valued.join(' ')}`, ...INIT_FLAGS.map(f => `  ${f.flag.padEnd(26)} ${f.help}`)];
}

function pathValue(flag: string, value: string): string | null {
  return ABSOLUTE_PATH_PATTERN.test(value) && !value.split('/').includes('..') ? null : `${flag} needs a clean absolute path`;
}

/** argv after `init`. `{error}` is USAGE; the message never echoes a value that could be a secret. */
export function parseInitArgs(argv: readonly string[]): InitArgs | { readonly error: string } {
  const positional: string[] = [];
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  const decide = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--declaration') return { error: 'init writes the declaration; give the draft with --draft' };
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }
    const known = INIT_FLAGS.find(f => f.flag === arg);
    if (known === undefined) return { error: `unknown flag '${arg}'` };
    if (known.value === null) {
      if (booleans.has(arg)) return { error: `${arg} given twice` };
      booleans.add(arg);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) return { error: `${arg} needs ${known.value}` };
    index += 1;
    if (arg === '--decide') {
      const at = value.indexOf('=');
      const id = at > 0 ? value.slice(0, at) : '';
      const option = at > 0 ? value.slice(at + 1) : '';
      if (!ITEM_ID_PATTERN.test(id) || !/^[a-z0-9_-]+$/.test(option)) {
        return { error: `--decide needs <item-id>=<option> (ids match ${ITEM_ID_PATTERN.source})` };
      }
      if (decide.has(id)) return { error: `--decide ${id} given twice` };
      decide.set(id, option);
      continue;
    }
    if (values.has(arg)) return { error: `${arg} given twice` };
    values.set(arg, value);
  }
  const [instance, ...rest] = positional;
  if (instance === undefined) return { error: 'no instance' };
  if (!INSTANCE_PATTERN.test(instance)) return { error: `instance '${instance}' must match ${INSTANCE_PATTERN.source}` };
  if (rest.length > 0) return { error: `unexpected argument '${rest[0]}'` };
  for (const flag of ['--draft', '--source', '--bun-archive', '--bun-sums', '--kit-file']) {
    const value = values.get(flag);
    const problem = value === undefined ? null : pathValue(flag, value);
    if (problem !== null) return { error: problem };
  }
  const source = values.get('--source') ?? null;
  const confirmed = values.get('--source-digest-confirmed') ?? null;
  if ((source === null) !== (confirmed === null)) return { error: '--source and --source-digest-confirmed go together' };
  if (confirmed !== null && !SHA256_PATTERN.test(confirmed)) return { error: '--source-digest-confirmed needs a sha256 (64 hex)' };
  const kitFile = values.get('--kit-file') ?? null;
  const kitDigest = values.get('--kit-digest-confirmed') ?? null;
  if ((kitFile === null) !== (kitDigest === null)) return { error: '--kit-file and --kit-digest-confirmed go together' };
  if (kitDigest !== null && !SHA256_PATTERN.test(kitDigest)) return { error: '--kit-digest-confirmed needs a sha256 (64 hex)' };
  const bunArchive = values.get('--bun-archive') ?? null;
  const bunSums = values.get('--bun-sums') ?? null;
  if (bunSums !== null && bunArchive === null) return { error: '--bun-sums needs --bun-archive' };
  const pairName = values.get('--pair-name') ?? instance;
  if (!PAIR_NAME_PATTERN.test(pairName)) return { error: `--pair-name must match ${PAIR_NAME_PATTERN.source}` };
  const noPair = booleans.has('--no-pair');
  if (noPair && values.has('--pair-name')) return { error: '--pair-name and --no-pair exclude each other' };
  const dryRun = booleans.has('--dry-run');
  if (dryRun && booleans.has('--resume')) return { error: '--dry-run writes nothing; it cannot --resume' };
  return Object.freeze({
    instance,
    draft: values.get('--draft') ?? null,
    source,
    sourceDigestConfirmed: confirmed,
    bunArchive,
    bunSums,
    kitFile,
    kitDigestConfirmed: kitDigest,
    yes: booleans.has('--yes'),
    decide,
    resume: booleans.has('--resume'),
    dryRun,
    pairName,
    noPair,
  });
}

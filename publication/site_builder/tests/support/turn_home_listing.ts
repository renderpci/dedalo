/**
 * THE TURN-HOME LISTINGS OF A SIMULATED HOST — what `observeHost` (`turnHomeListings`) would list
 * after a simulated apply, derived from the simulated entries: a HOME or its `.config` that the
 * simulation holds as a real directory is listed with the names of its simulated children.
 *
 * Since the plan treats a real turn-HOME directory with NO listing as a problem (never as a HOME
 * judged on its rows alone), a simulator must list as the observer does — or every settled host
 * would plan a rebuild. A listing the host already carried (a gate's planted stray) is kept for a
 * HOME this apply did not rebuild: a simulation must not tidy away what only a rebuild removes.
 */
import { basename, dirname } from 'node:path';
import type { HostState, PathObservation } from '../../src/provision/plan';

export function simulatedTurnHomeListings(
  agentStateRoot: string,
  entries: Readonly<Record<string, PathObservation>>,
  prior: HostState['turnHomeEntries'],
  rebuilt: ReadonlySet<string> = new Set(),
): Record<string, readonly string[]> {
  const escaped = agentStateRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const turnDir = new RegExp(`^${escaped}/s[1-9][0-9]*/turn(/\\.config)?$`);
  const out: Record<string, readonly string[]> = {};
  for (const [path, observation] of Object.entries(entries)) {
    if (observation.type !== 'dir' || !turnDir.test(path)) continue;
    const home = path.endsWith('/.config') ? dirname(path) : path;
    const kept = prior?.[path];
    if (kept !== undefined && !rebuilt.has(home)) {
      out[path] = kept;
      continue;
    }
    out[path] = Object.keys(entries)
      .filter(other => dirname(other) === path)
      .map(other => basename(other))
      .sort();
  }
  return out;
}

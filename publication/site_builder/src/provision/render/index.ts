/**
 * THE RENDERER REGISTRY — every artifact this subsystem generates, in one list, and the one
 * function that produces all of them.
 *
 * `renderAll(layout, manifest)` is the whole of the RENDER move: hand it a derived layout
 * and it returns the complete set of files the host must hold for that museum, each with
 * its bytes, its path, its owner and its mode. The provisioner's `apply` and `check` both
 * consume exactly this list, which is the property that matters — a `check` that walked a
 * different set from the one `apply` writes would report a host as clean while an artifact
 * nobody rendered sat on it, and that is the shape of the defect this subsystem exists to
 * end (an installer, a unit and a vhost each stating the same facts, none of them able to
 * notice the others).
 *
 * ONE LINE PER RENDERER, AND NOTHING ELSE. The six modules are written independently and
 * must stay that way: each is imported from its own file and named once below. There is no
 * shared base class, no per-kind branch in this file, and no second list of kinds — a
 * renderer that applies only to some hosts says so itself (`appliesTo`, which is how the
 * two vhost renderers divide nginx from Apache without this file having an opinion about
 * web servers).
 *
 * ZERO-DEP, like everything else on this path: `node:` builtins and package-local siblings.
 * A repo-side tripwire renders all of this WITHOUT the daemon's node_modules.
 */

import type { InstanceLayout, InstanceManifest } from '../layout';
import { hasDrifted, parseStamp } from '../hash';
import type { Artifact, ArtifactKind, Renderer } from './types';
import { ARTIFACT_KINDS } from './types';

import { unitRenderer } from './unit';
import { envRenderer } from './env';
import { nginxRenderer } from './nginx';
import { apacheRenderer } from './apache';
import { engineFragmentRenderer } from './engine_fragment';
import { sitesRenderer } from './sites';

export type { Artifact, ArtifactInput, ArtifactKind, ModeKey, Renderer } from './types';
export { ARTIFACT_KINDS, artifact } from './types';

/** THE REGISTRY. Order is irrelevant — `renderAll` sorts by path — so add lines, not care. */
export const RENDERERS: readonly Renderer[] = Object.freeze([
  unitRenderer,
  envRenderer,
  sitesRenderer,
  nginxRenderer,
  apacheRenderer,
  engineFragmentRenderer,
]);

/**
 * kind → renderer, built from the list above rather than written beside it.
 *
 * `check` needs it: a stamped file found on the host names its kind, and the question
 * "what would we render for this today?" has to resolve to a module. Built and not
 * declared, because a hand-written map is the second census of the same six modules — and
 * the one that gets a new renderer added to it a release late.
 */
export const RENDERER_BY_KIND: ReadonlyMap<ArtifactKind, Renderer> = (() => {
  const byKind = new Map<ArtifactKind, Renderer>();
  for (const renderer of RENDERERS) {
    const first = byKind.get(renderer.kind);
    if (first) {
      throw new Error(
        `render: two renderers claim the kind '${renderer.kind}'. One kind is one module and ` +
          `one file on the host; two would race for the same path, and the winner would be ` +
          `whichever ran last.`,
      );
    }
    byKind.set(renderer.kind, renderer);
  }
  // THE CENSUS, BOTH WAYS. A kind with no renderer is an artifact the provisioner believes
  // in and never writes — the museum's unit or vhost simply absent from the host, with
  // nothing red anywhere. (The other direction is impossible: `kind` is typed.)
  for (const kind of ARTIFACT_KINDS) {
    if (!byKind.has(kind)) {
      throw new Error(
        `render: no renderer is registered for the artifact kind '${kind}'. Add its module to ` +
          `RENDERERS, or remove the kind from ARTIFACT_KINDS — a kind nothing renders is a ` +
          `file the host will silently not have.`,
      );
    }
  }
  return byKind;
})();

/**
 * RENDER EVERY ARTIFACT THIS MUSEUM'S HOST MUST HOLD.
 *
 * Pure, and a pure function of the LAYOUT: same declaration, same bytes, forever. That is
 * not tidiness — the provisioner writes only on drift, so any instability here (an
 * unsorted set, a timestamp, a hostname read off the machine) rewrites a museum's live unit
 * and vhosts on every run and buries a real change in the noise.
 *
 * Sorted by path, so the RESULT does not depend on the order of the registry above nor on
 * the order the sites happen to appear in instance.json. Callers may therefore compare two
 * renderings element by element, and adding a renderer cannot reshuffle a report.
 *
 * The checks below run on every call rather than in a test. They cost a hash over bytes we
 * just built, and they close the failure mode this directory is most exposed to: five
 * modules, written in parallel, each free to emit any path it likes. A duplicate path is
 * two artifacts writing one file — the last one wins, silently, and the museum gets the
 * wrong unit or a vhost for the wrong surface. Since `apply` runs as root against a live
 * host, "nothing was rendered" is the only acceptable answer to an incoherent set.
 */
export function renderAll(layout: InstanceLayout, manifest: InstanceManifest): Artifact[] {
  const artifacts: Artifact[] = [];

  for (const renderer of RENDERERS) {
    if (renderer.appliesTo && !renderer.appliesTo(layout)) continue;
    for (const produced of renderer.render(layout, manifest)) {
      if (produced.kind !== renderer.kind) {
        throw new Error(
          `render: the '${renderer.kind}' renderer produced an artifact of kind ` +
            `'${produced.kind}' at '${produced.path}'. The kind is how a stamped file on the ` +
            `host is traced back to the module that wrote it; a wrong one makes that trace lie.`,
        );
      }
      artifacts.push(produced);
    }
  }

  assertOnePathOneArtifact(artifacts, layout);
  assertEveryArtifactIsStamped(artifacts, layout);

  return artifacts.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * ONE PATH, ONE ARTIFACT. Two renderings of one file is not a merge — it is the second one
 * overwriting the first, on a host, as root, with no message anywhere. The likeliest cause
 * is a layout collision the derivation could not see (a `paths.unit_dir` pointed at the
 * vhost directory, say), which is exactly the class of declaration mistake that must fail
 * before anything is written rather than after.
 */
function assertOnePathOneArtifact(artifacts: readonly Artifact[], layout: InstanceLayout): void {
  const byPath = new Map<string, Artifact>();
  for (const produced of artifacts) {
    const first = byPath.get(produced.path);
    if (first) {
      throw new Error(
        `render: instance '${layout.instance}' would write '${produced.path}' twice — once as ` +
          `${first.kind}, once as ${produced.kind}. One path is one artifact; the second write ` +
          `would silently replace the first. Nothing was rendered.`,
      );
    }
    byPath.set(produced.path, produced);
  }
}

/**
 * EVERY ARTIFACT CARRIES A STAMP THAT READS BACK.
 *
 * `artifact()` is the only constructor and it stamps, so this cannot fail by omission — it
 * fails when a renderer builds a record by hand, or when a stamp is unparseable in a way
 * only a round trip catches. It is checked here because the stamp is the whole basis on
 * which a later run tells our bytes from an operator's: an artifact whose stamp does not
 * read back is one the provisioner would refuse to overwrite forever after, treating its
 * own file as a hand edit.
 */
function assertEveryArtifactIsStamped(artifacts: readonly Artifact[], layout: InstanceLayout): void {
  for (const produced of artifacts) {
    const parsed = parseStamp(produced.body);
    if (!parsed || parsed.kind !== produced.kind || parsed.instance !== layout.instance) {
      throw new Error(
        `render: the ${produced.kind} artifact for '${produced.path}' does not carry a readable ` +
          `'${layout.instance} ${produced.kind}' stamp on its first line. Build every artifact ` +
          `with artifact() — a file the provisioner cannot recognise as its own is a file it ` +
          `will never update again.`,
      );
    }
    if (hasDrifted(produced.body)) {
      throw new Error(
        `render: the ${produced.kind} artifact for '${produced.path}' disagrees with its own ` +
          `stamp — its body was changed after it was stamped. Every run would report it as a ` +
          `hand edit.`,
      );
    }
  }
}

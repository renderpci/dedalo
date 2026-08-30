/**
 * THE SERVING CHECK — the proof that a museum's live site is still a museum's live site.
 *
 * A migration is not done when the files are in place. It is done when the pages a museum
 * publishes still come off the same bytes they came off an hour earlier. Everything else
 * about adoption — the declaration, the credentials, the unit, the vhosts — is machinery in
 * service of that one sentence, and machinery reports success far too easily: every write
 * can succeed, every stamp can match, `systemctl is-active` can answer yes, and a museum's
 * front page can still be a 404 because one symlink now points at a directory that no longer
 * exists.
 *
 * So this module asks the only question that cannot be faked by the migration succeeding:
 * FOR EVERY SLUG AND EVERY SURFACE, does the served link still resolve, does what it
 * resolves to still hold bytes, and is it still the release this site claims to be serving.
 *
 * ── ONE FUNCTION, RUN TWICE ─────────────────────────────────────────────────────────────
 *
 * `verifyServing()` is run BEFORE the migration and again AFTER it, against the same
 * expectations. That is deliberate and it is what makes the answer mean anything:
 *
 *   - BEFORE, it decides whether this install can be proved at all. An install whose
 *     production link already disagrees with its own manifest is not something adoption may
 *     touch, because after the migration there would be no way to tell whether the
 *     disagreement was pre-existing or freshly caused. It refuses, names the slug, and
 *     nothing is written.
 *   - AFTER, the identical check is the assertion that NOTHING MOVED. Not "the provisioner
 *     believes it did not move anything" — the same three questions, asked of the same
 *     links, answered by the filesystem.
 *
 * ── WHERE AN EXPECTATION COMES FROM ─────────────────────────────────────────────────────
 *
 * Production's expectation is the SITE'S OWN CLAIM: `site.json`'s `published.release`, which
 * the daemon writes when it publishes and rewrites when it rolls back. Preprod has no such
 * record — a draft is whatever was last built — so its expectation is what the link pointed
 * at when adoption first looked. Both are captured before anything is written, which is the
 * only moment at which "what this host was serving" is a fact rather than an opinion.
 *
 * A site that has never been published expects NULL, and null is a real expectation rather
 * than a skipped check: the provisioner creates the served link pointing at the release
 * STORE as a placeholder, so "this link must still be a placeholder" is exactly as
 * checkable as "this link must still serve release 20260830-01". The one check that is
 * conditional is emptiness — a placeholder's target is legitimately empty, and a released
 * one that has become empty is a museum serving a blank directory.
 *
 * ── WHY IT DOES NOT IMPORT THE DAEMON'S OWN READER ──────────────────────────────────────
 *
 * `src/build/promote.ts::currentRelease()` asks the same question of the same links. It
 * cannot be imported here: it reaches `src/config.ts`, which resolves a daemon's whole
 * configuration at import time and exits the process when it cannot — and the provisioner
 * runs on hosts where no instance is configured yet. What is shared instead is the thing
 * that actually matters, the RULE: `layout.ts` owns `releaseNameFromLinkTarget()` and both
 * the daemon and this module read a link through it. The io differs; the sentence does not.
 */

import { dirname, isAbsolute, resolve } from 'node:path';

import type { PathFacts } from './apply';
import {
  SURFACES,
  releaseNameFromLinkTarget,
  surfacePaths,
  type InstanceLayout,
  type Surface,
  type SurfacePaths,
} from './layout';

/**
 * WHAT THIS CHECK MAY DO TO A HOST: three reads and nothing else.
 *
 * Stated as its own interface rather than taking the adopter's: this runs against a museum's
 * live serving tree, and the narrowest possible seam is the honest way to say that it cannot
 * write. `AdoptIo` satisfies it structurally, so the caller passes the one it already has.
 */
export interface ServingIo {
  stat(path: string): PathFacts | null;
  readLink(path: string): string | null;
  readDir(path: string): string[] | null;
}

/** What one surface of one site must still be serving, and where that claim came from. */
export interface SurfaceExpectation {
  readonly slug: string;
  readonly surface: Surface;
  readonly paths: SurfacePaths;
  /** The release that must still be served, or null for a link that must stay a placeholder. */
  readonly expected: string | null;
  /**
   * MUST THERE BE A SERVED LINK HERE AT ALL?
   *
   * False for exactly one situation, and it is the ordinary one on a pre-instance host: a
   * site that exists and has never been published or previewed. The daemon that shipped
   * created a surface's link on its FIRST promote, so a museum with a drafted-but-unbuilt
   * site simply has no `<root>/<slug>` — and reading that as "this surface is broken"
   * refused adoption for a healthy install, before writing anything, over a site nobody had
   * finished. An unpublished site is a normal state, not a fault.
   *
   * It is never false when a release IS expected: a site whose own manifest claims a
   * published release and has no link is a real disagreement and the reason this check
   * exists. And `relocateExpectations()` sets it TRUE for the after-measurement, because by
   * then the provisioner has created the placeholder for every declared surface.
   */
  readonly mustBeServed: boolean;
  /** Quoted in every failure, so an operator knows which claim is being held against them. */
  readonly source: string;
}

/** One surface's answer. `failures` is empty exactly when `ok` is true. */
export interface SurfaceVerdict {
  readonly expectation: SurfaceExpectation;
  readonly ok: boolean;
  /** What was found instead, one sentence each. Never a byte of anyone's content. */
  readonly failures: readonly string[];
}

export interface ServingReport {
  readonly ok: boolean;
  readonly verdicts: readonly SurfaceVerdict[];
  /** The failing verdicts alone — what a caller prints. */
  readonly failed: readonly SurfaceVerdict[];
}

/** A site as the check needs it: its slug, its webspace, and what it claims to publish. */
export interface ServedSite {
  readonly slug: string;
  readonly webspace: string;
  /** `site.json`'s `published.release`, or null when the site was never published. */
  readonly publishedRelease: string | null;
  /**
   * WHERE THIS SITE'S SURFACES ARE RIGHT NOW, when that is not yet the webspace pair.
   *
   * A pre-instance install keeps every site's surfaces under two SHARED roots
   * (`<PROD_ROOT>/.releases/<slug>` and the link `<PROD_ROOT>/<slug>`), which is a place the
   * webspace derivation cannot name — so adoption states it, per surface, for as long as the
   * bytes are still there. Absent means "at the webspace pair", which is every already-
   * migrated surface and every host this subsystem provisioned itself.
   */
  readonly surfaces?: Readonly<Partial<Record<Surface, SurfacePaths>>>;
}

/**
 * CAPTURE WHAT THIS HOST IS SERVING RIGHT NOW.
 *
 * Called once, before anything is written. Production's expectation comes from the site's
 * own manifest and preprod's from the link itself, for the reason given in the header — and
 * the production one is deliberately NOT read off the link: an expectation taken from the
 * thing being checked cannot fail, which is how a verifier becomes decoration.
 */
export function expectationsFor(layout: InstanceLayout, sites: readonly ServedSite[], io: ServingIo): SurfaceExpectation[] {
  const expectations: SurfaceExpectation[] = [];

  for (const site of sites) {
    for (const surface of SURFACES) {
      const paths = site.surfaces?.[surface] ?? surfacePaths(site.webspace, surface);
      const expected = surface === 'prod' ? site.publishedRelease : servedRelease(paths, io);
      expectations.push({
        slug: site.slug,
        surface,
        paths,
        expected,
        // A surface with no link and no claimed release has never been served, and there is
        // nothing to hold this install to. Anything else — a link that is there, or a
        // release the site says it published — must still be exactly what it was.
        mustBeServed: expected !== null || io.stat(paths.linkPath) !== null,
        source:
          surface === 'prod'
            ? `site.json's published.release for '${site.slug}'`
            : `the release '${site.slug}' was serving on preprod when adoption looked`,
      });
    }
  }

  // The layout is taken rather than ignored so a caller cannot pass a site set from one
  // instance and a layout from another: every webspace named must be one this instance owns.
  const owned = new Set(layout.sites.map(site => site.webspace));
  for (const site of sites) {
    if (!owned.has(site.webspace)) {
      throw new Error(
        `verify: site '${site.slug}' places its webspace at '${site.webspace}', which is not ` +
          `one of instance '${layout.instance}'s. Checking another instance's serving tree ` +
          `would report a museum as healthy on the strength of a different museum's pages. ` +
          `Nothing was checked.`,
      );
    }
  }

  return expectations;
}

/**
 * THE SAME EXPECTATIONS, AT THE ADDRESS THE MIGRATION MOVED THEM TO.
 *
 * Adoption is "one function run twice against the same expectations", and for a host this
 * subsystem provisioned itself that is literally one list. For a PRE-INSTANCE host it is
 * one list at two addresses: the surfaces begin under the shared `PREPROD_ROOT`/`PROD_ROOT`
 * and end inside each site's own webspace, because the new layout has no way to express the
 * old one (§6). What must not change is the CLAIM — this slug, this surface, this release,
 * from this source — so the claim is carried over verbatim and only the pair of paths is
 * re-derived. Rebuilding the expectations from the layout after the move would ask the
 * question the other way round ("does it serve what it serves"), which cannot fail.
 */
export function relocateExpectations(
  expectations: readonly SurfaceExpectation[],
  layout: InstanceLayout,
): SurfaceExpectation[] {
  return expectations.map(expectation => {
    const site = layout.sites.find(candidate => candidate.slug === expectation.slug);
    if (!site) {
      throw new Error(
        `verify: instance '${layout.instance}' declares no site '${expectation.slug}', so ` +
          `there is nowhere to check what it was serving. Nothing was checked.`,
      );
    }
    return Object.freeze({
      ...expectation,
      paths: surfacePaths(site.webspace, expectation.surface),
      // AFTER the migration every declared surface has a link, placeholder or not: `plan()`
      // creates one for each so a fresh site's vhost has a document root. So the second
      // measurement holds the host to that, whatever the first one found.
      mustBeServed: true,
    });
  });
}

/**
 * ASK THE FILESYSTEM. Four questions per surface, in the order a failure is easiest to act
 * on, and every one of them named in its own sentence rather than summed into a boolean.
 */
export function verifyServing(expectations: readonly SurfaceExpectation[], io: ServingIo): ServingReport {
  const verdicts = expectations.map(expectation => {
    const failures = failuresOf(expectation, io);
    return Object.freeze({ expectation, ok: failures.length === 0, failures: Object.freeze(failures) });
  });

  const failed = verdicts.filter(verdict => !verdict.ok);
  return Object.freeze({ ok: failed.length === 0, verdicts: Object.freeze(verdicts), failed: Object.freeze(failed) });
}

/**
 * EVERYTHING WRONG WITH ONE SURFACE, each in its own sentence.
 *
 * Not a boolean and not the first failure: an operator reading a report has to be told that
 * the link resolves AND serves the wrong release, because those are two different repairs.
 * The order is the order they can be acted on — is there a link, does it resolve, does what
 * it resolves to hold anything, is it the release this site claims.
 */
function failuresOf(expectation: SurfaceExpectation, io: ServingIo): string[] {
  const { paths, expected } = expectation;

  const link = io.stat(paths.linkPath);
  if (link === null) {
    // NOTHING WAS EVER SERVED HERE, and nothing claims otherwise — an ordinary
    // drafted-but-never-published site. See `mustBeServed`.
    if (!expectation.mustBeServed) return [];
    return [
      `the served link '${paths.linkPath}' does not exist — this surface has no document ` +
        `root at all, and its vhost answers nothing`,
    ];
  }
  if (link.type !== 'symlink') {
    return [
      `'${paths.linkPath}' is a ${link.type}, not a symlink. A surface is published by ` +
        `swapping a link; a directory there is a tree nothing can roll back`,
    ];
  }

  const target = io.readLink(paths.linkPath);
  if (target === null) {
    return [`'${paths.linkPath}' is a symlink whose target could not be read`];
  }

  const failures = targetFailures(expectation, target, io);

  const served = releaseNameFromLinkTarget(paths, target);
  if (served !== expected) {
    failures.push(
      `'${paths.linkPath}' serves ${served === null ? 'no release (it points at the placeholder)' : `release '${served}'`}, ` +
        `but ${expectation.source} says ${expected === null ? 'this site has never been published' : `'${expected}'`}`,
    );
  }

  return failures;
}

/**
 * What is wrong with what the link POINTS AT.
 *
 * The emptiness check is conditional on this surface expecting a release, and that is the
 * whole reason it is a separate question from the others: a site that has never been
 * published serves the release STORE as a placeholder, and a store with nothing in it is
 * exactly right. A released surface pointing at an empty directory is a museum serving a
 * blank page — the failure a link check alone reports as healthy.
 */
function targetFailures(expectation: SurfaceExpectation, target: string, io: ServingIo): string[] {
  const { paths, expected } = expectation;
  const resolved = resolveTarget(paths.linkPath, target);

  const facts = io.stat(resolved);
  if (facts === null) {
    return [
      `'${paths.linkPath}' points at '${target}', which does not exist — the link dangles ` +
        `and every request for this site is a 404`,
    ];
  }
  if (facts.type !== 'dir') {
    return [`'${paths.linkPath}' points at '${target}', which is a ${facts.type} and not a directory`];
  }
  if (expected !== null && (io.readDir(resolved) ?? []).length === 0) {
    return [
      `'${paths.linkPath}' points at '${target}', which is EMPTY. The link resolves and the ` +
        `site serves nothing, which is the failure a link check alone reports as healthy`,
    ];
  }
  return [];
}

/** One surface's verdict, in the words a report prints. */
export function describeVerdict(verdict: SurfaceVerdict): string[] {
  const head = `${verdict.expectation.slug} (${verdict.expectation.surface})`;
  return verdict.failures.map(failure => `${head}: ${failure}`);
}

/**
 * The release a surface is serving right now, or null. The same reading the daemon does —
 * `layout.ts` owns the rule; this is the provisioner's io wrapped around it.
 */
function servedRelease(paths: SurfacePaths, io: ServingIo): string | null {
  const target = io.readLink(paths.linkPath);
  return target === null ? null : releaseNameFromLinkTarget(paths, target);
}

/**
 * A link target as an absolute path. Targets are RELATIVE by design (`build/promote.ts`
 * keeps them so, "so the surface tree stays relocatable"), so they resolve against the
 * link's own directory and never against the process's cwd.
 */
function resolveTarget(linkPath: string, target: string): string {
  return isAbsolute(target) ? target : resolve(dirname(linkPath), target);
}

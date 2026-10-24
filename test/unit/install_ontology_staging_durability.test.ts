/**
 * GATE — what stage_ontologies STAGED survives a POWER CUT (cross-ops:r2 S3).
 *
 * stage_ontologies is checkpointed `done` by the executor the moment it returns;
 * install_ontologies runs after the seed restore. Its staged files were copied /
 * downloaded and `staged.json` written with no fsync, into a directory created with
 * no parent fsync: a cut after the checkpoint brought the install back with a `done`
 * step whose verify (stagedMatches) no longer matched — refused as DRIFT, an install
 * the operator could only recreate.
 *
 * OUTCOME, through the power-cut model (test/helpers/power_loss_model.ts —
 * conservative: bytes or a directory entry it did not see made durable are never
 * proven): at the instant stageOntologies returns, `staged.json` and every staged
 * file survive a cut with their bytes. Hermetic: local-origin files in a mkdtemp
 * dir, no database.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { MATRIX_COPY_COLUMNS } from '../../src/core/db/matrix_write.ts';
import type { OntologyInstallRequest } from '../../src/core/install/ontology_choice.ts';
import { stageOntologies } from '../../src/core/install/ontology_install.ts';
import { DEDALO_VERSION_MAJOR_MINOR } from '../../src/core/update/version.ts';
import { startPowerLossModel } from '../helpers/power_loss_model.ts';

const scratch = mkdtempSync(join(tmpdir(), 'dd-ontology-staging-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A one-row COPY package of `tld` (MATRIX_COPY_COLUMNS arity), gzipped, at `path`. */
function writePackage(path: string, tld: string): void {
	const fields = MATRIX_COPY_COLUMNS.map((column) => {
		if (column === 'section_id') return '1';
		if (column === 'section_tipo') return `${tld}0`;
		return '\\N';
	});
	writeFileSync(path, gzipSync(Buffer.from(`${fields.join('\t')}\n`)));
}

describe('stage_ontologies: the staged set is durable when the step returns', () => {
	test('staged.json and every staged file survive a cut at the instant stageOntologies returns', async () => {
		const sourceDir = mkdtempSync(join(scratch, 'source-'));
		const items = ['zzsda', 'zzsdb'].map((tld) => {
			const file = join(sourceDir, `${tld}.copy.gz`);
			writePackage(file, tld);
			return {
				tld,
				origin: 'local' as const,
				file,
				typology_id: null,
				name_data: null,
				dependencies: null,
			};
		});
		const matrixDdFile = join(sourceDir, 'matrix_dd.copy.gz');
		writePackage(matrixDdFile, 'dd');
		const request: OntologyInstallRequest = {
			source: { kind: 'local', path: sourceDir },
			items,
			matrixDd: { origin: 'local', file: matrixDdFile },
		};
		// The staging dir does not exist yet: its creation must be made durable too.
		const root = mkdtempSync(join(scratch, 'root-'));
		const stagingDir = join(root, 'ontology_staging');
		const model = startPowerLossModel(root);
		try {
			await stageOntologies(request, { stagingDir });
			const versionDir = join(stagingDir, DEDALO_VERSION_MAJOR_MINOR);
			const expected = [
				join(stagingDir, 'staged.json'),
				join(versionDir, 'zzsda.copy.gz'),
				join(versionDir, 'zzsdb.copy.gz'),
				join(versionDir, 'matrix_dd.copy.gz'),
			];
			for (const path of expected) expect(model.survives(path), model.explain(path)).toBe(true);
			// Non-vacuity: the model saw the writer make them durable.
			expect(model.seen.fsyncs).toBeGreaterThanOrEqual(expected.length);
		} finally {
			model.restore();
		}
	});
});

/**
 * INGEST COMPANION WRITES — the ontology-declared fields an upload fills on the
 * record beside the media itself (PHP component_image::process_uploaded_file
 * :802-830, component_av :1188-1236, component_pdf :382-399).
 *
 * Two properties, both naming a SIBLING component on the same record:
 *
 *   • `properties.target_filename` — the human file name the curator uploaded,
 *     written into a visible field (`rsc398` "Original filename"). It is the only
 *     place the archive keeps `IMG_3007.jpg` / `María Piñón entrevista.mp4`; the
 *     file on disk is renamed to the deterministic media identifier, so without
 *     this write the provenance of the byte stream is simply lost.
 *   • `properties.target_duration` — the AV duration as a Dédalo time code
 *     (`rsc54`). The oral-history media-icons widget reads it directly; unwritten,
 *     every TS-ingested interview showed `00:00:00.000` forever.
 *
 * GENERIC BY PROPERTY, NOT BY MODEL. PHP implemented these three times (image,
 * av, pdf — and pdf's copy carries a set_data() shape bug), and never at all for
 * svg/3d, which is an accident of where somebody stopped copying rather than a
 * rule: the PROPERTY is the declaration of intent, so any media component that
 * declares one gets it honoured here. That is capability restored, not invented —
 * an ontology may already carry `target_filename` on an svg component and PHP
 * would silently have ignored it.
 *
 * NON-FATAL BY CONSTRUCTION. Every function here returns messages instead of
 * throwing: it runs AFTER `addFile` has irreversibly moved the staged upload, and
 * the ordering law of the ingest (see IngestResult.derivativeErrors) is that
 * nothing past the move may abort the ingest and leave a file on disk that no
 * record knows about. The messages are surfaced by the calling tool.
 */

import { getModelByTipo, getNode } from '../../ontology/resolver.ts';
import { secondsToTc } from '../../resolve/tr_marks.ts';
import { saveComponentData } from '../../section/record/save_component.ts';
import { probeFormat } from '../engine/ffmpeg.ts';

/** The sibling components an upload writes to, or null where none is declared. */
export interface MediaCompanionTargets {
	/** properties.target_filename — receives the human upload name. */
	filenameTipo: string | null;
	/** properties.target_duration — receives the media duration as a time code. */
	durationTipo: string | null;
}

/**
 * Extract the companion targets from a component's ontology `properties`. PURE,
 * so the property contract is gateable without a database.
 *
 * A non-string (or empty) value is NOT a target: the property must name a tipo,
 * and a truthy-but-unusable value would otherwise become a save addressed to
 * `undefined`.
 */
export function readCompanionTargets(
	properties: Record<string, unknown> | null | undefined,
): MediaCompanionTargets {
	const read = (key: string): string | null => {
		const value = properties?.[key];
		return typeof value === 'string' && value !== '' ? value : null;
	};
	return { filenameTipo: read('target_filename'), durationTipo: read('target_duration') };
}

/** The companion targets declared by a media component's ontology node. */
export async function resolveMediaCompanionTargets(
	componentTipo: string,
): Promise<MediaCompanionTargets> {
	const node = await getNode(componentTipo);
	return readCompanionTargets((node?.properties ?? null) as Record<string, unknown> | null);
}

export interface CompanionWriteInput {
	/** The media component whose properties declare the targets. */
	componentTipo: string;
	sectionTipo: string;
	sectionId: number;
	/** The acting user (the saves are TM-audited like any other write). */
	userId: number;
	/** The human file name as uploaded, e.g. 'María Piñón entrevista.mp4'. */
	originalFileName: string;
	/** Absolute path of the file just stored — the duration is measured from IT. */
	mediaFilePath: string;
}

/**
 * Perform the declared companion writes for one ingest. Returns one message per
 * problem; an empty array means everything the ontology asked for was written (or
 * nothing was asked for).
 */
export async function writeMediaCompanions(input: CompanionWriteInput): Promise<string[]> {
	const targets = await resolveMediaCompanionTargets(input.componentTipo);
	const messages: string[] = [];
	if (targets.filenameTipo !== null) {
		messages.push(...(await writeFilename(input, targets.filenameTipo)));
	}
	if (targets.durationTipo !== null) {
		messages.push(...(await writeDuration(input, targets.durationTipo)));
	}
	return messages;
}

/**
 * Write the human upload name into the target_filename component.
 *
 * OVERWRITES on purpose (PHP set_data + save, unconditional): the field states
 * which file the record's media came from, so a re-upload must restate it. That
 * is the opposite of tool_import_files' `target_filename` role, which fills only
 * when EMPTY — there the value is matching input the operator may have curated,
 * here it is provenance of the byte stream that has just been replaced.
 *
 * lg-nolan, because PHP instantiates the target with DEDALO_DATA_NOLAN whatever
 * the component's own translatable flag says (component_image :812, component_av
 * :1198). Every target in the shipped ontology is non-translatable, so the two
 * readings coincide; the oracle's choice is kept rather than improved on.
 */
async function writeFilename(input: CompanionWriteInput, targetTipo: string): Promise<string[]> {
	const value = input.originalFileName.trim();
	if (value === '') {
		return [
			`target_filename '${targetTipo}': the upload carried no file name, nothing was written`,
		];
	}
	return await saveCompanionValue(input, targetTipo, value, 'target_filename');
}

/**
 * Write the media duration as a Dédalo time code into the target_duration
 * component (PHP get_duration → OptimizeTC::seg2tc, e.g. '00:05:20.125').
 *
 * The duration is read from the file that was just stored — PHP measures
 * `get_duration($quality)` on the uploaded tier, not on a derivative that does
 * not exist yet at this point in the ingest.
 *
 * A file with no readable duration still writes PHP's value (`get_duration`
 * returns 0.0 → '00:00:00.000') AND reports it: the stored bytes stay oracle-
 * identical, and the curator is told that a zero-length reading was recorded
 * instead of it looking like a successful measurement.
 */
async function writeDuration(input: CompanionWriteInput, targetTipo: string): Promise<string[]> {
	let seconds = 0;
	let probeFailure: string | null = null;
	try {
		const format = (await probeFormat(input.mediaFilePath)) as {
			format?: { duration?: unknown };
		} | null;
		const raw = Number(format?.format?.duration ?? 0);
		seconds = Number.isFinite(raw) && raw > 0 ? raw : 0;
	} catch (error) {
		probeFailure = (error as Error).message;
	}
	const messages: string[] = [];
	if (probeFailure !== null) {
		messages.push(
			`target_duration '${targetTipo}': the duration of ${input.mediaFilePath} could not be probed (${probeFailure}) — 00:00:00.000 recorded`,
		);
	} else if (seconds === 0) {
		messages.push(
			`target_duration '${targetTipo}': ${input.mediaFilePath} reports no duration — 00:00:00.000 recorded`,
		);
	}
	messages.push(
		...(await saveCompanionValue(input, targetTipo, secondsToTc(seconds), 'target_duration')),
	);
	return messages;
}

/**
 * The ONE write door of this module: a flat single-value save through
 * `saveComponentData` (transaction + Time Machine audit), refusing loudly-in-a-
 * message when the target is not a component that can hold one.
 */
async function saveCompanionValue(
	input: CompanionWriteInput,
	targetTipo: string,
	value: string,
	role: string,
): Promise<string[]> {
	const model = await getModelByTipo(targetTipo);
	if (model === null) {
		return [`${role} '${targetTipo}': no such ontology node — nothing was written`];
	}
	try {
		const result = await saveComponentData({
			componentTipo: targetTipo,
			sectionTipo: input.sectionTipo,
			sectionId: input.sectionId,
			lang: 'lg-nolan',
			changedData: [{ action: 'set_data', id: null, value: [{ value, lang: 'lg-nolan' }] }],
			userId: input.userId,
		});
		return result.ok ? [] : [`${role} '${targetTipo}' save failed: ${result.message}`];
	} catch (error) {
		return [`${role} '${targetTipo}' save failed: ${(error as Error).message}`];
	}
}

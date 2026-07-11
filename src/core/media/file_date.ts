/**
 * MEDIA CAPTURE-DATE READER — PHP tool_import_files::get_media_file_date (:421)
 * + ImageMagick::get_date_time_original (:964) + Ffmpeg::get_date_time_original
 * (:1611) + the pdfinfo CreationDate branch.
 *
 * Extracts the capture/creation date of a media file into the sparse dd_date
 * shape component_date stores ({year, month, day, …} — only present fields,
 * PHP dd_date::jsonSerialize filters nulls):
 *
 *   component_image → `identify -format "%[EXIF:DateTimeOriginal]"`, falling
 *                     back to `%[date:modify]` (file metadata/mtime) when the
 *                     EXIF tag is absent — PHP resolution order preserved.
 *   component_av    → `ffprobe -show_format` format.tags.creation_time parsed
 *                     with dd_date::get_dd_date_from_timestamp's regex. NOTE
 *                     the PHP regex only allows a SPACE between date and time,
 *                     so the usual ISO 'T' separator yields year/month/day
 *                     only — parity-pinned, do not "fix".
 *   component_pdf   → `pdfinfo -rawdates` CreationDate line, PDF date format
 *                     D:YYYYMMDD… — PHP stores year/month/day only.
 *
 * FAIL-SOFT CONTRACT (PHP skip-when-empty): a missing file, a missing binary,
 * a spawn failure or an unparseable date all return null — the import's
 * target_date role write is skipped, never a junk date. This is deliberately
 * STRICTER than PHP in one corner: on unparseable tool output PHP builds an
 * all-null dd_date object that set_components_data then persists as
 * `{start:{time:0}}`; the TS reader returns null instead (documented on the
 * ledger row closure — a junk write, not a behavior anyone relies on).
 *
 * `withDedaloTime` is the PHP component_date::save → add_time twin: the
 * PERSISTED start object always carries the freshly server-computed virtual
 * 'time' seconds (never trusted from input).
 */

import { existsSync } from 'node:fs';
import { config } from '../../config/config.ts';
import { probeFormat } from './engine/ffmpeg.ts';
import { resolveIdentify } from './engine/imagemagick.ts';
import { runBinary } from './engine/spawn.ts';

/** Sparse dd_date fields (PHP core/common/class.dd_date.php — nulls omitted). */
export interface DdDate {
	year?: number;
	month?: number;
	day?: number;
	hour?: number;
	minute?: number;
	second?: number;
	ms?: number;
	/** Virtual-calendar sort seconds — injected by {@link withDedaloTime} on save. */
	time?: number;
}

/**
 * PHP dd_date::convert_date_to_seconds (:1027): virtual 372-day years and
 * 31-day months (31*12, symmetric partial-date arithmetic; NOT Unix time).
 * Twins: search/builders/builder_date.ts convertDateToSeconds (search ranges),
 * section/record/create_record.ts virtualDateNow (audit dates).
 */
export function ddDateToSeconds(date: DdDate): number {
	const year = date.year ?? 0;
	let month = date.month ?? 0;
	let day = date.day ?? 0;
	// PHP "Rectified 25-11-2017": month/day are 1-based when present.
	if (month !== 0) month -= 1;
	if (day !== 0) day -= 1;
	month = month >= 0 ? month : 0;
	day = day >= 0 ? day : 0;
	const hour = Math.max(date.hour ?? 0, 0);
	const minute = Math.max(date.minute ?? 0, 0);
	const second = Math.max(date.second ?? 0, 0);
	return year * 372 * 86400 + month * 31 * 86400 + day * 86400 + hour * 3600 + minute * 60 + second;
}

/**
 * The persisted-shape stamp (PHP component_date::save → add_time →
 * build_dd_date_with_time): recompute 'time' server-side and attach it. The
 * TS write path has no per-model date save hook, so date-writing callers
 * stamp explicitly before saveComponentData.
 */
export function withDedaloTime(date: DdDate): DdDate {
	return { ...date, time: ddDateToSeconds(date) };
}

/** Build a DdDate from ordered field values, dropping undefined/NaN slots. */
function sparseDate(
	fields: Partial<Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'ms', string>>,
	constrain: boolean,
): DdDate | null {
	// PHP setter constrain ranges (class.dd_date.php): out-of-range values are
	// IGNORED with constrain=true (ffprobe path), SET anyway without (identify
	// and pdfinfo paths — PHP logs a warning and stores the value verbatim).
	const ranges: Record<string, [number, number]> = {
		month: [1, 12],
		day: [1, 31],
		hour: [0, 23],
		minute: [0, 59],
		second: [0, 59],
		ms: [0, 999],
	};
	const date: DdDate = {};
	for (const [name, raw] of Object.entries(fields)) {
		if (raw === undefined) continue;
		const value = Number.parseInt(raw, 10);
		if (!Number.isFinite(value)) continue;
		const range = ranges[name];
		if (constrain && range !== undefined && (value < range[0] || value > range[1])) continue;
		date[name as keyof DdDate] = value;
	}
	// PHP returns an all-null dd_date here (persisted as {start:{time:0}} junk);
	// the TS reader refuses the write instead — see the header contract.
	return date.year === undefined ? null : date;
}

/**
 * PHP ImageMagick::get_date_time_original EXIF regex (:968) over the
 * `%[EXIF:DateTimeOriginal]` output ('2011:05:12 10:30:00').
 */
export function parseIdentifyDateTimeOriginal(raw: string): DdDate | null {
	const match =
		/^(-?[0-9]+)[-:/.]?([0-9]+)?[-:/.]?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?$/.exec(
			raw.trim(),
		);
	if (match === null) return null;
	return sparseDate(
		{
			year: match[1],
			month: match[2],
			day: match[3],
			hour: match[4],
			minute: match[5],
			second: match[6],
		},
		false,
	);
}

/**
 * PHP ImageMagick::get_date_time_original fallback regex (:973) over the
 * `%[date:modify]` output ('2026-07-10T08:29:05+00:00'). Group 7 is the
 * fractional-seconds run PHP stores via set_ms.
 */
export function parseIdentifyDateModify(raw: string): DdDate | null {
	const match =
		/^(\d{4})[-:/.]?(\d{2})[-:/.]?(\d{2})T?(\d{2}):(\d{2}):(\d{2})\.?(\d+)?\+?(\d{2})?[-:/.]?(\d{2})?/.exec(
			raw.trim(),
		);
	if (match === null) return null;
	return sparseDate(
		{
			year: match[1],
			month: match[2],
			day: match[3],
			hour: match[4],
			minute: match[5],
			second: match[6],
			ms: match[7],
		},
		false,
	);
}

/**
 * PHP dd_date::get_dd_date_from_timestamp (:841) — the ffprobe creation_time
 * parser. Constrained: out-of-range fields are dropped, and the regex only
 * crosses from date into time over a SPACE, so ISO 'T' timestamps keep
 * year/month/day only (PHP parity — pinned in the gate).
 */
export function parseTimestampDdDate(raw: string): DdDate | null {
	const match = /^(-?[0-9]+)-?([0-9]+)?-?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?/.exec(
		raw.trim(),
	);
	if (match === null) return null;
	return sparseDate(
		{
			year: match[1],
			month: match[2],
			day: match[3],
			hour: match[4],
			minute: match[5],
			second: match[6],
		},
		true,
	);
}

/**
 * PHP pdf branch regex (:474) over the LAST `pdfinfo -rawdates` CreationDate
 * line ("CreationDate:    D:20110816234339-04'00'"). Only year/month/day are
 * read (groups 2-4) — time and timezone are ignored for component storage.
 */
export function parsePdfCreationDate(line: string): DdDate | null {
	const match =
		/(D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(-|\+|Z)?(\d{2})?('?)(\d{2})?('?)/.exec(
			line,
		);
	if (match === null) return null;
	return sparseDate({ year: match[2], month: match[3], day: match[4] }, false);
}

/** component_image: identify EXIF DateTimeOriginal, falling back to date:modify. */
async function imageDate(filePath: string): Promise<DdDate | null> {
	const identify = resolveIdentify();
	if (!existsSync(identify[0] as string)) return null; // no binary → skip-when-empty
	const exif = (
		await runBinary([...identify, '-quiet', '-format', '%[EXIF:DateTimeOriginal]', filePath], {
			nice: false,
		})
	).stdout.trim();
	if (exif !== '') return parseIdentifyDateTimeOriginal(exif);
	const modify = (
		await runBinary([...identify, '-quiet', '-format', '%[date:modify]', filePath], {
			nice: false,
		})
	).stdout.trim();
	if (modify !== '') return parseIdentifyDateModify(modify);
	return null;
}

/** component_av: ffprobe container creation_time (PHP Ffmpeg::get_date_time_original). */
async function avDate(filePath: string): Promise<DdDate | null> {
	if (!existsSync(config.media.binaries.ffprobe)) return null;
	const attributes = (await probeFormat(filePath)) as {
		format?: { tags?: { creation_time?: unknown } };
	} | null;
	const creationTime = attributes?.format?.tags?.creation_time;
	if (typeof creationTime !== 'string' || creationTime === '') return null;
	return parseTimestampDdDate(creationTime);
}

/** component_pdf: pdfinfo -rawdates CreationDate (PHP get_media_file_date pdf case). */
async function pdfDate(filePath: string): Promise<DdDate | null> {
	const pdfinfo = config.media.binaries.pdfinfo;
	if (!existsSync(pdfinfo)) return null;
	const result = await runBinary([pdfinfo, '-rawdates', filePath], { nice: false });
	// PHP merges stderr into stdout (2>&1) and aborts on a failed exec whose
	// output carries 'ERROR:' (stripos); otherwise it parses whatever came back.
	if (result.exitCode !== 0 && /error:/i.test(`${result.stdout}\n${result.stderr}`)) {
		return null;
	}
	// PHP pipes through `grep -i CreationDate` and exec() returns the LAST line.
	const lines = result.stdout.split('\n').filter((line) => /creationdate/i.test(line));
	const lastLine = lines[lines.length - 1];
	if (lastLine === undefined) return null;
	return parsePdfCreationDate(lastLine);
}

/**
 * PHP tool_import_files::get_media_file_date (:421): the capture date of a
 * media file, dispatched by the media component MODEL. Returns null (skip the
 * target_date write) for unknown models, missing files/binaries, tool
 * failures and unparseable dates — the PHP skip-when-empty path.
 */
export async function getMediaFileDate(filePath: string, model: string): Promise<DdDate | null> {
	// A consumed/moved staged file reads as empty tool output in PHP → null.
	if (filePath === '' || !existsSync(filePath)) return null;
	try {
		switch (model) {
			case 'component_image':
				return await imageDate(filePath);
			case 'component_av':
				return await avDate(filePath);
			case 'component_pdf':
				return await pdfDate(filePath);
			default:
				// PHP logs 'Model is not defined' and returns null.
				return null;
		}
	} catch {
		// Spawn/binary failure — PHP's empty shell_exec output path.
		return null;
	}
}

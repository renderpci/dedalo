import { dbExecute } from '../db/pool';
import { config } from '../config';
import { NotFoundError } from '../errors';
import { COLUMNS } from '../constants';
import { parseJsonStrings } from '../utils/parse-json';
import type { Locator, AvIndexationFragment, Speaker } from '../db/types';
import type { RowDataPacket } from 'mysql2/promise';

export async function getAvIndexationFragment(db: string, locator: Locator): Promise<AvIndexationFragment> {
  const { section_id, section_tipo, component_tipo, tag_id, tc_in = 0, tc_out = 0 } = locator;

  const sql = `
    SELECT
      i.${COLUMNS.SECTION_ID},
      i.${COLUMNS.CODE},
      i.${COLUMNS.TITLE},
      i.rsc36 as transcription,
      a.${COLUMNS.VIDEO} as video,
      a.${COLUMNS.IMAGE},
      inf.${COLUMNS.NAME},
      inf.${COLUMNS.SURNAME}
    FROM interview i
    LEFT JOIN audiovisual a ON i.${COLUMNS.SECTION_ID} = a.${COLUMNS.SECTION_ID}
    LEFT JOIN informant inf ON i.${COLUMNS.SECTION_ID} = inf.${COLUMNS.SECTION_ID}
    WHERE i.${COLUMNS.SECTION_ID} = ?
  `;

  const rows = await dbExecute<RowDataPacket[]>(db, sql, [section_id]);

  if (rows.length === 0) {
    throw new NotFoundError(`Record not found for section_id: ${section_id}`);
  }

  const row = parseJsonStrings((rows as Record<string, unknown>[])[0]);
  const transcription = (row.transcription as string) || '';

  const fragmentText = extractTranscriptionFragment(transcription, tc_in, tc_out);

  const videoUrl = row.video
    ? `${config.MEDIA_BASE_URL}/${row.video}?vbegin=${tc_in}&vend=${tc_out}`
    : '';

  const imageUrl = row.image
    ? `${config.MEDIA_BASE_URL}/posterframe/${row.image}`
    : '';

  const speakers: Speaker[] = (row.name || row.surname)
    ? [{ name: `${row.name || ''} ${row.surname || ''}`.trim(), role: 'informant' }]
    : [];

  const terms = await getTermsForLocator(db, section_id, component_tipo, tag_id);

  return {
    locator: { section_id, section_tipo, component_tipo, tag_id, tc_in, tc_out },
    transcription: fragmentText,
    media: { video_url: videoUrl, image_url: imageUrl, tc_in, tc_out },
    speakers,
    terms,
  };
}

function extractTranscriptionFragment(transcription: string, tcIn: number, tcOut: number): string {
  if (!transcription) return '';

  const tcPattern = /\[tc-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\]/g;
  let match: RegExpExecArray | null;
  let fragmentStart = 0;
  let fragmentEnd = transcription.length;

  while ((match = tcPattern.exec(transcription)) !== null) {
    const currentTcIn = parseFloat(match[1]);
    const currentTcOut = parseFloat(match[2]);

    if (currentTcIn <= tcIn && currentTcOut >= tcIn) {
      fragmentStart = match.index;
    }

    if (currentTcOut >= tcOut && fragmentStart > 0) {
      fragmentEnd = match.index + match[0].length;
      break;
    }
  }

  let fragment = transcription.slice(fragmentStart, fragmentEnd);
  fragment = fragment.replace(/\[tc-[^\]]+\]/g, '');
  fragment = fragment.replace(/\[page-n-\d+\]/g, '');
  fragment = fragment.replace(/\s+/g, ' ').trim();

  return fragment;
}

async function getTermsForLocator(
  db: string,
  sectionId: number,
  componentTipo?: string,
  tagId?: number,
): Promise<Array<{ term_id: string; term: string }>> {
  if (!componentTipo || !tagId) return [];

  try {
    const sql = `
      SELECT DISTINCT t.term_id, t.term
      FROM (
        SELECT term_id, term FROM ts_themes
        UNION ALL
        SELECT term_id, term FROM ts_onomastic
        UNION ALL
        SELECT term_id, term FROM ts_chronological
      ) t
      WHERE t.indexation LIKE ?
      LIMIT 10
    `;

    // The pattern is a bound LIKE parameter, not SQL interpolation
    const pattern = `%"section_id":"${sectionId}"%"tag_id":"${tagId}"%`;
    const rows = await dbExecute<RowDataPacket[]>(db, sql, [pattern]);

    return (rows as Array<{ term_id: string; term: string }>).map(row => ({
      term_id: row.term_id,
      term: row.term,
    }));
  } catch {
    return [];
  }
}

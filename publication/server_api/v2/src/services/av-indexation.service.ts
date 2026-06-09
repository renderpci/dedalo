import { getPool } from '../db/pool';
import { config } from '../config';
import type { Locator, AvIndexationFragment } from '../db/types';

export async function getAvIndexationFragment(locator: Locator): Promise<AvIndexationFragment> {
  const { section_id, section_tipo, component_tipo, tag_id, tc_in = 0, tc_out = 0 } = locator;

  const pool = getPool();

  const sql = `
    SELECT
      i.section_id,
      i.code,
      i.title,
      i.rsc36 as transcription,
      a.rsc35 as video,
      a.image,
      inf.name,
      inf.surname
    FROM interview i
    LEFT JOIN audiovisual a ON i.section_id = a.section_id
    LEFT JOIN informant inf ON i.section_id = inf.section_id
    WHERE i.section_id = ?
  `;

  const [rows] = await pool.execute(sql, [section_id]);

  if ((rows as any[]).length === 0) {
    throw new Error(`Record not found for section_id: ${section_id}`);
  }

  const row = (rows as any[])[0];
  const transcription = row.transcription || '';

  const fragmentText = extractTranscriptionFragment(transcription, tc_in, tc_out);

  const videoUrl = row.video
    ? `${config.MEDIA_BASE_URL}/${row.video}?vbegin=${tc_in}&vend=${tc_out}`
    : '';

  const imageUrl = row.image
    ? `${config.MEDIA_BASE_URL}/posterframe/${row.image}`
    : '';

  const speakers = row.name || row.surname
    ? [{ name: `${row.name || ''} ${row.surname || ''}`.trim(), role: 'informant' }]
    : [];

  const terms = await getTermsForLocator(section_id, component_tipo, tag_id);

  return {
    locator: {
      section_id,
      section_tipo,
      component_tipo,
      tag_id,
      tc_in,
      tc_out,
    },
    transcription: fragmentText,
    media: {
      video_url: videoUrl,
      image_url: imageUrl,
      tc_in,
      tc_out,
    },
    speakers,
    terms,
  };
}

function extractTranscriptionFragment(transcription: string, tcIn: number, tcOut: number): string {
  if (!transcription) return '';

  const tcPattern = /\[tc-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\]/g;
  let match;
  let lastTcIn = 0;
  let fragmentStart = 0;
  let fragmentEnd = transcription.length;

  while ((match = tcPattern.exec(transcription)) !== null) {
    const currentTcIn = parseFloat(match[1]);
    const currentTcOut = parseFloat(match[2]);

    if (currentTcIn <= tcIn && currentTcOut >= tcIn) {
      fragmentStart = match.index;
      lastTcIn = currentTcIn;
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
  sectionId: number,
  componentTipo?: string,
  tagId?: number
): Promise<Array<{ term_id: string; term: string }>> {
  if (!componentTipo || !tagId) {
    return [];
  }

  const pool = getPool();

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

    const pattern = `%"section_id":"${sectionId}"%"tag_id":"${tagId}"%`;
    const [rows] = await pool.execute(sql, [pattern]);

    return (rows as any[]).map(row => ({
      term_id: row.term_id,
      term: row.term,
    }));
  } catch (error) {
    console.warn('Failed to fetch terms for locator:', error);
    return [];
  }
}

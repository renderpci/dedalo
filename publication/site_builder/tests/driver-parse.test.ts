import { describe, test, expect } from 'bun:test';
import { parseStreamJsonLine } from '../src/drivers/claude_code';

describe('claude_code stream-json parser', () => {
  test('maps assistant text and tool_use blocks to events', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Building the map page.' },
          { type: 'tool_use', name: 'Write', input: { file_path: 'src/pages/map.ts' } },
        ],
      },
    });
    const events = parseStreamJsonLine(line);
    expect(events).toEqual([
      { type: 'text', text: 'Building the map page.' },
      { type: 'tool', name: 'Write', summary: 'Write: src/pages/map.ts' },
    ]);
  });

  test('maps the result message to a terminal result carrying the resume token', () => {
    const line = JSON.stringify({
      type: 'result',
      session_id: 'sess-123',
      total_cost_usd: 0.04,
      duration_ms: 8200,
    });
    expect(parseStreamJsonLine(line)).toEqual([
      { type: 'result', ok: true, resumeToken: 'sess-123', costUsd: 0.04, durationMs: 8200 },
    ]);
  });

  test('ignores blank lines, unparseable lines and unrelated frames', () => {
    expect(parseStreamJsonLine('')).toEqual([]);
    expect(parseStreamJsonLine('not json')).toEqual([]);
    expect(parseStreamJsonLine(JSON.stringify({ type: 'system', subtype: 'init' }))).toEqual([]);
  });
});

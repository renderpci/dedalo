import { describe, expect, test } from 'bun:test';
import { parseEnvFile } from '../src/env_file';

describe('the env-file grammar', () => {
  test('KEY=VALUE, quotes, export, comments and blank lines', () => {
    const parsed = parseEnvFile(
      ['# comment', '', 'A=plain', 'B="dq \\"x\\" \\\\ y"', "C='sq \\n'", 'export D=exported', '  E = spaced  '].join('\n'),
      '/x/env',
    );
    expect(parsed).toEqual({ A: 'plain', B: 'dq "x" \\ y', C: 'sq \\n', D: 'exported', E: 'spaced' });
  });

  test('an unreadable line names the file and the line, never the value', () => {
    let message = '';
    try {
      parseEnvFile('A=1\nSECRET value-that-must-not-leak\n', '/x/env');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("'/x/env'");
    expect(message).toContain('(line 2)');
    expect(message).not.toContain('value-that-must-not-leak');
  });
});

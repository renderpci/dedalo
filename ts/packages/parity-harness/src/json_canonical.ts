/**
 * Order-preserving JSON parser.
 *
 * Standard `JSON.parse` reorders integer-like object keys (`{"2":..,"1":..}`
 * iterates as 1,2) and collapses number tokens to floats. Both lose information
 * that is byte-significant for PHP↔TS parity: PHP associative arrays preserve
 * insertion order, and number formatting must match exactly. This parser keeps
 * object entries in source order and preserves number tokens verbatim, producing
 * a canonical tree the differ can compare order-sensitively.
 */

export type CNode =
  | { t: 'obj'; e: Array<[string, CNode]> }
  | { t: 'arr'; e: CNode[] }
  | { t: 'str'; v: string }
  | { t: 'num'; raw: string }
  | { t: 'bool'; v: boolean }
  | { t: 'null' };

export class JsonParseError extends Error {
  override name = 'JsonParseError';
}

export function parseCanonical(input: string): CNode {
  const p = new Parser(input);
  p.skipWs();
  const node = p.parseValue();
  p.skipWs();
  if (!p.atEnd()) p.fail('Trailing content after JSON value');
  return node;
}

class Parser {
  private i = 0;
  constructor(private readonly s: string) {}

  atEnd(): boolean {
    return this.i >= this.s.length;
  }

  fail(msg: string): never {
    throw new JsonParseError(`${msg} at offset ${this.i}`);
  }

  skipWs(): void {
    while (this.i < this.s.length) {
      const c = this.s.charCodeAt(this.i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.i++;
      else break;
    }
  }

  private peek(): string {
    return this.s[this.i] ?? '';
  }

  parseValue(): CNode {
    this.skipWs();
    const c = this.peek();
    switch (c) {
      case '{': return this.parseObject();
      case '[': return this.parseArray();
      case '"': return { t: 'str', v: this.parseString() };
      case 't': return this.parseLiteral('true', { t: 'bool', v: true });
      case 'f': return this.parseLiteral('false', { t: 'bool', v: false });
      case 'n': return this.parseLiteral('null', { t: 'null' });
      default:
        if (c === '-' || (c >= '0' && c <= '9')) return { t: 'num', raw: this.parseNumber() };
        return this.fail(`Unexpected character ${JSON.stringify(c)}`);
    }
  }

  private parseLiteral(word: string, node: CNode): CNode {
    if (this.s.startsWith(word, this.i)) {
      this.i += word.length;
      return node;
    }
    return this.fail(`Invalid literal, expected ${word}`);
  }

  private parseObject(): CNode {
    this.i++; // {
    const e: Array<[string, CNode]> = [];
    this.skipWs();
    if (this.peek() === '}') {
      this.i++;
      return { t: 'obj', e };
    }
    for (;;) {
      this.skipWs();
      if (this.peek() !== '"') this.fail('Expected object key string');
      const key = this.parseString();
      this.skipWs();
      if (this.peek() !== ':') this.fail('Expected ":" after object key');
      this.i++;
      const value = this.parseValue();
      e.push([key, value]);
      this.skipWs();
      const sep = this.peek();
      if (sep === ',') {
        this.i++;
        continue;
      }
      if (sep === '}') {
        this.i++;
        return { t: 'obj', e };
      }
      this.fail('Expected "," or "}" in object');
    }
  }

  private parseArray(): CNode {
    this.i++; // [
    const e: CNode[] = [];
    this.skipWs();
    if (this.peek() === ']') {
      this.i++;
      return { t: 'arr', e };
    }
    for (;;) {
      e.push(this.parseValue());
      this.skipWs();
      const sep = this.peek();
      if (sep === ',') {
        this.i++;
        continue;
      }
      if (sep === ']') {
        this.i++;
        return { t: 'arr', e };
      }
      this.fail('Expected "," or "]" in array');
    }
  }

  private parseString(): string {
    this.i++; // opening "
    let out = '';
    for (;;) {
      if (this.i >= this.s.length) this.fail('Unterminated string');
      const ch = this.s[this.i++]!;
      if (ch === '"') return out;
      if (ch === '\\') {
        const esc = this.s[this.i++]!;
        switch (esc) {
          case '"': out += '"'; break;
          case '\\': out += '\\'; break;
          case '/': out += '/'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'u': {
            const hex = this.s.slice(this.i, this.i + 4);
            if (hex.length !== 4) this.fail('Invalid \\u escape');
            this.i += 4;
            out += String.fromCharCode(parseInt(hex, 16));
            break;
          }
          default:
            this.fail(`Invalid escape \\${esc}`);
        }
      } else {
        out += ch;
      }
    }
  }

  private parseNumber(): string {
    const start = this.i;
    if (this.peek() === '-') this.i++;
    while (this.i < this.s.length) {
      const c = this.s[this.i]!;
      if ((c >= '0' && c <= '9') || c === '.' || c === 'e' || c === 'E' || c === '+' || c === '-') {
        this.i++;
      } else break;
    }
    const raw = this.s.slice(start, this.i);
    if (raw === '' || raw === '-') this.fail('Invalid number');
    return raw;
  }
}

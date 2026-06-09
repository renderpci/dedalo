import { ValidationError } from '../errors';

const VALID_OPERATORS = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'like', 'in', 'not_in', 'is_null', 'is_not_null']);
const VALID_DIRECTIONS = new Set(['ASC', 'DESC']);
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface FilterCondition {
  field: string;
  operator: string;
  values: (string | number | null)[];
}

export interface OrderClause {
  field: string;
  direction: 'ASC' | 'DESC';
}

export interface ParsedFilter {
  sql: string;
  params: (string | number | null)[];
}

function validateIdentifier(name: string, label: string): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw new ValidationError(`Invalid ${label}: ${name}`);
  }
}

export function parseFilters(filterStr: string): ParsedFilter {
  if (!filterStr.trim()) {
    return { sql: '', params: [] };
  }

  const conditions = filterStr.split(',').map(c => c.trim()).filter(Boolean);
  const clauses: string[] = [];
  const params: (string | number | null)[] = [];

  for (const condition of conditions) {
    const parts = condition.split(':');

    if (parts.length < 2) {
      throw new ValidationError(`Invalid filter format: "${condition}". Expected "field:operator:value"`);
    }

    const field = parts[0].trim();
    const operator = parts[1].trim().toLowerCase();
    const rawValue = parts.slice(2).join(':').trim();

    validateIdentifier(field, 'field name');

    if (!VALID_OPERATORS.has(operator)) {
      throw new ValidationError(`Invalid operator: "${operator}". Valid: ${[...VALID_OPERATORS].join(', ')}`);
    }

    const quoted = `\`${field}\``;

    switch (operator) {
      case 'eq':
        clauses.push(`${quoted} = ?`);
        params.push(rawValue);
        break;
      case 'ne':
        clauses.push(`${quoted} != ?`);
        params.push(rawValue);
        break;
      case 'gt':
        clauses.push(`${quoted} > ?`);
        params.push(rawValue);
        break;
      case 'gte':
        clauses.push(`${quoted} >= ?`);
        params.push(rawValue);
        break;
      case 'lt':
        clauses.push(`${quoted} < ?`);
        params.push(rawValue);
        break;
      case 'lte':
        clauses.push(`${quoted} <= ?`);
        params.push(rawValue);
        break;
      case 'like':
        clauses.push(`${quoted} LIKE ?`);
        params.push(rawValue);
        break;
      case 'in': {
        const values = rawValue.split('|').map(v => v.trim());
        clauses.push(`${quoted} IN (${values.map(() => '?').join(',')})`);
        params.push(...values);
        break;
      }
      case 'not_in': {
        const values = rawValue.split('|').map(v => v.trim());
        clauses.push(`${quoted} NOT IN (${values.map(() => '?').join(',')})`);
        params.push(...values);
        break;
      }
      case 'is_null':
        clauses.push(`${quoted} IS NULL`);
        break;
      case 'is_not_null':
        clauses.push(`${quoted} IS NOT NULL`);
        break;
    }
  }

  return {
    sql: clauses.join(' AND '),
    params,
  };
}

export function parseOrder(orderStr: string): string {
  if (!orderStr.trim()) {
    return '';
  }

  const parts = orderStr.split(',').map(p => p.trim()).filter(Boolean);
  const clauses: string[] = [];

  for (const part of parts) {
    const tokens = part.split(':').map(t => t.trim());
    const field = tokens[0];
    const direction = (tokens[1] || 'ASC').toUpperCase();

    validateIdentifier(field, 'field name');

    if (!VALID_DIRECTIONS.has(direction)) {
      throw new ValidationError(`Invalid order direction: "${direction}". Use "asc" or "desc"`);
    }

    clauses.push(`\`${field}\` ${direction}`);
  }

  return clauses.join(', ');
}

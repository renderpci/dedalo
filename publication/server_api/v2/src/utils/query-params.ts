import { ValidationError } from '../errors';

export const VALID_OPERATORS = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'like', 'in', 'not_in', 'is_null', 'is_not_null']);

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FILTER_KEY_RE = /^filter\[([^\]]+)\](?:\[([^\]]+)\])?$/;

export interface FilterCondition {
  field: string;
  operator: string;
  values: (string | number | null)[];
}

export interface OrderClause {
  field: string;
  direction: 'ASC' | 'DESC';
}

function validateIdentifier(name: string, label: string): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw new ValidationError(`Invalid ${label}: ${name}`);
  }
}

export function condition(field: string, operator: string, values: (string | number | null)[]): FilterCondition {
  return { field, operator, values };
}

// Parses filter[field]=value and filter[field][op]=value query parameters.
// Repeated keys each produce one condition; all conditions are ANDed.
export function parseFilterParams(searchParams: URLSearchParams): FilterCondition[] {
  const conditions: FilterCondition[] = [];

  for (const [key, value] of searchParams.entries()) {
    if (key !== 'filter' && !key.startsWith('filter[')) continue;

    const match = FILTER_KEY_RE.exec(key);
    if (!match) {
      throw new ValidationError(`Malformed filter parameter: "${key}". Expected filter[field]=value or filter[field][op]=value`);
    }

    const field = match[1].trim();
    const operator = (match[2] ?? 'eq').trim().toLowerCase();

    validateIdentifier(field, 'filter field');

    if (!VALID_OPERATORS.has(operator)) {
      throw new ValidationError(`Invalid filter operator: "${operator}". Valid: ${[...VALID_OPERATORS].join(', ')}`);
    }

    if (operator === 'is_null' || operator === 'is_not_null') {
      conditions.push({ field, operator, values: [] });
      continue;
    }

    if (operator === 'in' || operator === 'not_in') {
      const values = value.split('|').map(v => v.trim()).filter(v => v !== '');
      if (values.length === 0) {
        throw new ValidationError(`Filter "${key}" requires at least one pipe-separated value`);
      }
      conditions.push({ field, operator, values });
      continue;
    }

    conditions.push({ field, operator, values: [value] });
  }

  return conditions;
}

// Parses sort=title,-date into ORDER BY clauses (leading "-" = descending).
export function parseSort(sort: string): OrderClause[] {
  const clauses: OrderClause[] = [];

  for (const part of sort.split(',').map(p => p.trim()).filter(Boolean)) {
    const direction = part.startsWith('-') ? 'DESC' : 'ASC';
    const field = part.startsWith('-') ? part.slice(1).trim() : part;

    validateIdentifier(field, 'sort field');
    clauses.push({ field, direction });
  }

  return clauses;
}

export function buildWhere(conditions: FilterCondition[]): { sql: string; params: (string | number | null)[] } {
  const clauses: string[] = [];
  const params: (string | number | null)[] = [];

  for (const { field, operator, values } of conditions) {
    validateIdentifier(field, 'filter field');
    const quoted = `\`${field}\``;

    switch (operator) {
      case 'eq':
        clauses.push(`${quoted} = ?`);
        params.push(values[0]);
        break;
      case 'ne':
        clauses.push(`${quoted} != ?`);
        params.push(values[0]);
        break;
      case 'gt':
        clauses.push(`${quoted} > ?`);
        params.push(values[0]);
        break;
      case 'gte':
        clauses.push(`${quoted} >= ?`);
        params.push(values[0]);
        break;
      case 'lt':
        clauses.push(`${quoted} < ?`);
        params.push(values[0]);
        break;
      case 'lte':
        clauses.push(`${quoted} <= ?`);
        params.push(values[0]);
        break;
      case 'like':
        clauses.push(`${quoted} LIKE ?`);
        params.push(values[0]);
        break;
      case 'in':
        clauses.push(`${quoted} IN (${values.map(() => '?').join(',')})`);
        params.push(...values);
        break;
      case 'not_in':
        clauses.push(`${quoted} NOT IN (${values.map(() => '?').join(',')})`);
        params.push(...values);
        break;
      case 'is_null':
        clauses.push(`${quoted} IS NULL`);
        break;
      case 'is_not_null':
        clauses.push(`${quoted} IS NOT NULL`);
        break;
      default:
        throw new ValidationError(`Invalid filter operator: "${operator}"`);
    }
  }

  return { sql: clauses.join(' AND '), params };
}

export function buildOrder(clauses: OrderClause[]): string {
  return clauses.map(({ field, direction }) => {
    validateIdentifier(field, 'sort field');
    return `\`${field}\` ${direction}`;
  }).join(', ');
}

import { text_format } from '../../api/v1/lib/parsers/parser_text.ts';

const data = [
  { id: 'a', value: ["1155", "1", "3"], tipo: 'rsc91' },
  { id: 'b', value: ["es1", "ad1", "fr1"], tipo: 'rsc91' }
];

const res = text_format(data, { pattern: "${b}_${a}" });
console.log(JSON.stringify(res, null, 2));

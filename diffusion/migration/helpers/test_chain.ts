import { apply_parser } from '../../api/v1/lib/parsers/index.ts';
import { get_section_id, get_section_tipo } from '../../api/v1/lib/parsers/parser_locator.ts';

function apply_parser_chain(
        parsers: any | any[],
        data: any[]
): any {

        if (!parsers || (typeof parsers === 'object' && Object.keys(parsers).length === 0)) {
                return null;
        }

        const chain = Array.isArray(parsers) ? parsers : [parsers];

        let current_data: any = data;
        let accumulated_data: any[] = [];
        let has_accumulated = false;

        for (const parser_def of chain) {
                if (!parser_def.fn) continue;

                let input_data: any[];
                if (parser_def.id) {
                        input_data = data; 
                } else {
                        input_data = has_accumulated ? accumulated_data : current_data;
                        has_accumulated = false;
                }

                let valid_data: any[] | null;
                if (Array.isArray(input_data)) {
                        valid_data = input_data;
                } else if (input_data !== null && input_data !== undefined) {
                        const meta = (Array.isArray(data) && data.length > 0) ? data[0] : {};
                        valid_data = [{
                                id:    null,
                                value: input_data,
                                tipo:  meta.tipo,
                                lang:  meta.lang
                        }];
                } else {
                        valid_data = null;
                }

                let result = apply_parser(parser_def.fn, valid_data, parser_def.options ?? {});

                if (result === null) {
                        if (!parser_def.id) return null; 
                        continue; 
                }

                if (parser_def.id) {
                        let tagged_items: any[] = [];
                        if (Array.isArray(result)) {
                                for (const item of result) {
                                        if (typeof item === 'object' && item !== null) {
                                                item.id = parser_def.id;
                                                tagged_items.push(item);
                                        }
                                }
                        } else {
                                const meta = (Array.isArray(valid_data) && valid_data.length > 0) ? valid_data[0] : {};
                                tagged_items.push({
                                        id:    parser_def.id,
                                        value: result,
                                        tipo:  meta.tipo,
                                        lang:  meta.lang
                                });
                        }
                        accumulated_data.push(...tagged_items);
                        has_accumulated = true;
                } else {
                        current_data = result;
                }
        }

        return has_accumulated ? accumulated_data : current_data;
}

const data = [{"tipo":"rsc91","lang":null,"value":[{"id":5,"type":"dd151","section_id":"1155","section_tipo":"es1","from_component_tipo":"rsc91"}],"id":null}];

const parsers = [
  {"fn": "parser_locator::get_section_id", "id": "a"},
  {"fn": "parser_locator::get_section_tipo", "id": "b"},
  {"fn": "parser_text::text_format", "options": {"pattern": "${b}_${a}"}}
];

console.log(JSON.stringify(apply_parser_chain(parsers, data), null, 2));


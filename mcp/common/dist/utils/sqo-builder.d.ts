import type { Sqo, FilterRule, Locator } from '../types/index.js';
export declare class SqoBuilder {
    private sqo;
    constructor(section_tipo: string | string[]);
    limit(n: number): this;
    offset(n: number): this;
    filter(operator: "AND" | "OR" | undefined, rules: FilterRule[]): this;
    filterByLocators(locators: Locator[]): this;
    select(fields: string[]): this;
    order(path: string, direction?: 'ASC' | 'DESC'): this;
    fullCount(enabled?: boolean): this;
    skipProjectsFilter(skip?: boolean): this;
    allowDataset(allow?: boolean): this;
    childrenRecursive(recursive?: boolean): this;
    fixedMode(mode: string): this;
    type(t: string): this;
    build(): Sqo;
}
//# sourceMappingURL=sqo-builder.d.ts.map
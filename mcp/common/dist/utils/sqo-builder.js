export class SqoBuilder {
    sqo = {};
    constructor(section_tipo) {
        this.sqo.section_tipo = section_tipo;
    }
    limit(n) {
        this.sqo.limit = n;
        return this;
    }
    offset(n) {
        this.sqo.offset = n;
        return this;
    }
    filter(operator = 'AND', rules) {
        this.sqo.filter = { operator, rules };
        return this;
    }
    filterByLocators(locators) {
        this.sqo.filter_by_locators = locators;
        return this;
    }
    select(fields) {
        this.sqo.select = fields;
        return this;
    }
    order(path, direction = 'ASC') {
        if (!this.sqo.order) {
            this.sqo.order = [];
        }
        this.sqo.order.push({ path, direction });
        return this;
    }
    fullCount(enabled = true) {
        this.sqo.full_count = enabled;
        return this;
    }
    skipProjectsFilter(skip = true) {
        this.sqo.skip_projects_filter = skip;
        return this;
    }
    allowDataset(allow = true) {
        this.sqo.allow_dataset = allow;
        return this;
    }
    childrenRecursive(recursive = true) {
        this.sqo.children_recursive = recursive;
        return this;
    }
    fixedMode(mode) {
        this.sqo.fixed_mode = mode;
        return this;
    }
    type(t) {
        this.sqo.type = t;
        return this;
    }
    build() {
        return this.sqo;
    }
}
//# sourceMappingURL=sqo-builder.js.map
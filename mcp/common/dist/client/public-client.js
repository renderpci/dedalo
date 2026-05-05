import { mapDedaloError } from '../utils/errors.js';
import { redactResponse } from '../utils/redact.js';
export class PublicClient {
    baseUrl;
    code;
    defaultLang;
    defaultDbName;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/$/, '') + '/publication/server_api/v1/json/';
        this.code = config.code;
        this.defaultLang = config.defaultLang ?? 'lg-eng';
        this.defaultDbName = config.defaultDbName;
    }
    async call(options) {
        const body = {
            code: this.code,
            lang: options.lang ?? this.defaultLang,
            options,
        };
        if (this.defaultDbName && !options.db_name) {
            body.db_name = this.defaultDbName;
        }
        const res = await fetch(this.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const json = (await res.json());
        if (json.result === false) {
            throw mapDedaloError(json);
        }
        return redactResponse(json);
    }
}
//# sourceMappingURL=public-client.js.map
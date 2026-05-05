import { mapDedaloError, DedaloError } from '../utils/errors.js';
import { redactResponse } from '../utils/redact.js';
export class WorkClient {
    baseUrl;
    username;
    password;
    autoLogin;
    cookie = '';
    csrfToken = '';
    loggedIn = false;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/$/, '') + '/core/api/v1/json/';
        this.username = config.username;
        this.password = config.password;
        this.autoLogin = config.autoLogin ?? false;
    }
    async fetchJson(body) {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.cookie) {
            headers['Cookie'] = this.cookie;
        }
        if (this.csrfToken) {
            headers['X-Dedalo-Csrf-Token'] = this.csrfToken;
        }
        const res = await fetch(this.baseUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        // Update cookies if present
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) {
            this.cookie = setCookie.split(';')[0];
        }
        const json = (await res.json());
        if (typeof json.csrf_token === 'string') {
            this.csrfToken = json.csrf_token;
        }
        return json;
    }
    async bootstrapCsrf() {
        const res = await this.fetchJson({ action: 'get_environment', dd_api: 'dd_core_api' });
        if (typeof res.csrf_token === 'string') {
            this.csrfToken = res.csrf_token;
        }
    }
    async login(username, password) {
        const u = username ?? this.username;
        const p = password ?? this.password;
        if (!u || !p) {
            throw new DedaloError('WorkClient: username and password required for login', 'not_logged');
        }
        await this.bootstrapCsrf();
        const res = await this.fetchJson({
            action: 'login',
            dd_api: 'dd_utils_api',
            source: { username: u, password: p },
        });
        if (res.result !== true) {
            throw mapDedaloError(res);
        }
        this.loggedIn = true;
    }
    async call(rqo) {
        if (!this.loggedIn && this.autoLogin && this.username && this.password) {
            await this.login();
        }
        const body = { ...rqo, prevent_lock: true };
        if (this.csrfToken && !body.csrf_token) {
            body.csrf_token = this.csrfToken;
        }
        let json = await this.fetchJson(body);
        if (json.result === false) {
            const errors = Array.isArray(json.errors) ? json.errors.map(String) : [];
            if (errors.includes('not_logged') && this.autoLogin && this.username && this.password) {
                await this.login();
                body.csrf_token = this.csrfToken;
                json = await this.fetchJson(body);
            }
            if (json.result === false) {
                throw mapDedaloError(json);
            }
        }
        return redactResponse(json);
    }
    getCookie() {
        return this.cookie;
    }
    getCsrfToken() {
        return this.csrfToken;
    }
    isLoggedIn() {
        return this.loggedIn;
    }
}
//# sourceMappingURL=work-client.js.map
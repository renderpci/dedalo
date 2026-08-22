/**
 * THE CLIENT RUN'S DIFFUSION DOMAIN NAME — one constant, two consumers, and a
 * file with NO IMPORTS so it can be read before the engine is configured.
 *
 * `scripts/client_test_server.ts` sets `DEDALO_DIFFUSION_DOMAIN` to this value
 * for the run's own server AND for the runner process, and
 * `./client_diffusion.ts` names its domain node after it. That has to happen
 * BEFORE anything imports `src/config/config.ts` (which freezes the database
 * connection at import), so the constant cannot live in a module that reaches
 * the config — hence this leaf.
 *
 * Why not the installation's own domain name: the engine resolves the domain BY
 * NAME, so a fixture that borrows it competes with the real node and shadows the
 * install's diffusion map while it wins. See client_diffusion.ts for the full
 * reasoning.
 */

/** A name no installation carries. */
export const CLIENT_DIFFUSION_DOMAIN = 'zzcd_client_domain';

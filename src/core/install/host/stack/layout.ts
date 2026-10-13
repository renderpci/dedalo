/**
 * THE COMPOSE STACK'S PLACES AND NAMES (terminal installer phase 4,
 * 2026-10-12) — every file, volume and image the docker/trial host steps
 * write, run or remove, derived in ONE module from the answers:
 *
 *   <checkout>/.dedalo.env                 the stack's environment (0600 — the database
 *                                          password); the CONTRACT of deploy/dedalo-image-lib.sh
 *   <checkout>/compose.override.yaml       the installer's override (the Let's Encrypt
 *                                          renewal service and volumes); the host library
 *                                          adds it to every compose call when it exists
 *   <checkout>/deploy/nginx.docker.generated.conf   the full stack's site (media gate on)
 *   <checkout>/deploy/certs/               the certificate nginx mounts (local CA / own files)
 *   volumes dedalo_<name>                  compose project `dedalo`
 *
 * The routes: docker = the FULL stack (docker-compose.yml: the engine-enforced
 * media gate, a certificate); trial = the SIMPLE stack (docker-compose.simple.yml,
 * plain HTTP, NO media access control — its own route, so it says so).
 *
 * The image: official (a registry of engineering/image_registries.json —
 * verified with cosign against the signing identity of THAT list, never one
 * from the environment), custom (a registry of the operator's: trusted as
 * pulled, said so) or build (here, from this checkout). Its version is this
 * installer's (owner question Q7: the delegated engine steps and their request
 * format must be the installer's own).
 *
 * PURE.
 */

import {
	loadImageRegistries,
	normalizeRepository,
	provisionedRegistries,
} from '../../../update/image_registries.ts';
import { DEDALO_VERSION } from '../../../update/version.ts';
import type { InstallAnswers } from '../../install_plan.ts';

/** The compose project name both stack files declare (`name: dedalo`). */
export const STACK_PROJECT = 'dedalo';

/** NOT `.env`: the engine's own loader reads that from a working directory. */
export const ENV_FILE = '.dedalo.env';
export const OVERRIDE_FILE = 'compose.override.yaml';
export const BUILD_OVERRIDE = 'deploy/compose.build.yml';
export const CERT_DIR = 'deploy/certs';
/** Where nginx sees deploy/certs (DEDALO_CERT_MOUNT in both stack files). */
export const CERT_MOUNT = '/etc/dedalo/certs';
/** The full stack's generated site (deploy/ is the stack files' nginx config directory). */
export const GENERATED_CONF = 'nginx.docker.generated.conf';
/** The trial stack's plain-HTTP site (shipped). */
export const TRIAL_CONF = 'nginx.simple.conf';
/** The Let's Encrypt certificate name (live/<name>/ in the dedalo_letsencrypt volume). */
export const LE_CERT_NAME = 'dedalo';
export const LE_VOLUME = `${STACK_PROJECT}_letsencrypt`;
export const LE_WEBROOT_VOLUME = `${STACK_PROJECT}_certbot_www`;
/** The image certbot runs from (the simple stack's renewal service uses the same). */
export const CERTBOT_IMAGE = 'certbot/certbot';
/** The local build's repository (deploy/compose.build.yml tags the build with it). */
export const LOCAL_REPOSITORY = 'localhost/dedalo';
/** The label the release workflow stamps with the version it publishes under. */
export const VERSION_LABEL = 'org.opencontainers.image.version';

/** Inside the containers (the stack files' constants). */
export const CONTAINER = Object.freeze({
	socket: '/run/dedalo/dedalo_ts.sock',
	media: '/srv/dedalo/media',
	webRoot: '/srv',
	mediaDir: 'media',
	/** Where nginx mounts the engine's published client volume. */
	client: '/opt/dedalo/master_dedalo/client',
	acmeWebroot: '/var/www/certbot',
	letsencrypt: '/etc/letsencrypt',
});

/** The volumes the engine's services use (created by `compose run`/`up`). */
export const ENGINE_VOLUMES: readonly string[] = Object.freeze(
	['private', 'media', 'socket', 'client', 'backups'].map((name) => `${STACK_PROJECT}_${name}`),
);
export const DATABASE_VOLUME = `${STACK_PROJECT}_pgdata`;
/** The volume whose presence means "an instance exists here". */
export const PRIVATE_VOLUME = `${STACK_PROJECT}_private`;

/** The stack file of a route. */
export function stackFileOf(answers: InstallAnswers): string {
	return answers.route === 'trial' ? 'docker-compose.simple.yml' : 'docker-compose.yml';
}

/** The nginx config the stack mounts (deploy/<name>). */
export function nginxConfOf(answers: InstallAnswers): string {
	return answers.route === 'trial' ? TRIAL_CONF : GENERATED_CONF;
}

/** The image version: the installer's own (the plan may only repeat it, or its -dev tag). */
export function imageVersionOf(answers: InstallAnswers): string {
	return answers.image_version === '' ? DEDALO_VERSION : answers.image_version;
}

/** The versions an image of this installer may carry. */
export function acceptedImageVersions(): string[] {
	return [DEDALO_VERSION, `${DEDALO_VERSION}-dev`];
}

/** The official repositories, primary first (the ONE list — never an environment value). */
export function officialRepositories(): string[] {
	return provisionedRegistries(loadImageRegistries()).map((entry) => entry.repository as string);
}

/** Is `repository` one of the official ones? */
export function isOfficialRepository(repository: string): boolean {
	const wanted = normalizeRepository(repository);
	return officialRepositories().some((entry) => normalizeRepository(entry) === wanted);
}

/** The repository the image comes from (official: the answer, else the first provisioned registry). */
export function imageRepositoryOf(answers: InstallAnswers): string {
	if (answers.image_source === 'build') return LOCAL_REPOSITORY;
	if (answers.image_repository !== '') return answers.image_repository;
	return officialRepositories()[0] ?? '';
}

/** `<repository>:<version>`. */
export function imageRefOf(answers: InstallAnswers): string {
	return `${imageRepositoryOf(answers)}:${imageVersionOf(answers)}`;
}

/** The .dedalo.env image mode: pull | build. */
export function imageModeOf(answers: InstallAnswers): 'pull' | 'build' {
	return answers.image_source === 'build' ? 'build' : 'pull';
}

/**
 * The .dedalo.env verification: an image from an OFFICIAL repository is always
 * cosign-verified, whichever source named it (preflight refuses one without
 * cosign); a registry of the operator's own has no Dédalo signature to check.
 */
export function imageVerifyOf(answers: InstallAnswers): 'cosign' | 'none' {
	const pulled = answers.image_source !== 'build';
	return pulled && isOfficialRepository(imageRepositoryOf(answers)) ? 'cosign' : 'none';
}

/** Does this install carry a certificate (docker), or serve plain HTTP (trial)? */
export function servesTls(answers: InstallAnswers): boolean {
	return answers.route === 'docker' && answers.tls_mode !== 'none';
}

/** The certificate files nginx reads (inside its container). */
export function certPathsOf(answers: InstallAnswers): { fullchain: string; key: string } {
	const dir =
		answers.tls_mode === 'letsencrypt'
			? `${CONTAINER.letsencrypt}/live/${LE_CERT_NAME}`
			: CERT_MOUNT;
	return { fullchain: `${dir}/fullchain.pem`, key: `${dir}/privkey.pem` };
}

/** The local CA file the operator installs on every workstation (local_ca). */
export const LOCAL_CA_FILE = `${CERT_DIR}/dedalo-local-ca.pem`;

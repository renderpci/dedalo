/**
 * THE INSTANCE'S NAMING CONVENTIONS — import-free.
 *
 * The marker filename, its content and the state root's subdirectories have three readers:
 * the boot preflight (this module, Task 3), the provisioner that plants them, and the
 * suite's fixture (tests/fixtures/instance.ts). All three import these exports; none
 * restates the literal. Zero imports so the provisioner and any root-repo gate may import
 * it without pulling the daemon's configuration (and zod) in with it.
 */

/** A root that belongs to an agent instance holds this file. */
export const INSTANCE_MARKER = '.dedalo_host_agent_instance';

/** The marker's ENTIRE content: the instance name and a newline (a string compare, never a parse). */
export function markerContent(instance: string): string {
  return `${instance}\n`;
}

/** The state root's fixed children: `<STATE_ROOT>/{publication_api,rules,audit}`. */
export const STATE_SUBDIRS = ['publication_api', 'rules', 'audit'] as const;

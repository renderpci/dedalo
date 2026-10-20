/**
 * The entity name: a letter, then letters/digits/underscore. It becomes a
 * directory, a key prefix and the developer route's socket name
 * (dev_listener.ts devSocketDefault); the retired browser wizard enforced it
 * client-side only and the CLI not at all — now the plan does
 * (install_validation.ts). A LEAF module: the plan's validator and the
 * developer listener both read it, and the listener may not import the
 * validator (the validator imports the listener).
 */
export const ENTITY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

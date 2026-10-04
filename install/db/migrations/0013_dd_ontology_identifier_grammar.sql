-- 0013 — dd_ontology identifier grammar: six CHECK constraints (SURF-1, 2026-09-30).
--
-- SHARED-SCHEMA ADDITIVE COLUMN: no column is added; six CHECK constraints are
-- added NOT VALID to dd_ontology, the shared runtime ontology table. The
-- identifier columns are read back as IDENTIFIERS (the search engine
-- interpolates tipos into JSONB paths and SQL, tree walks follow parent,
-- model lookups join model_tipo), so the database itself refuses a value that
-- is not one. A door that forgets to validate, a hand SQL fix, a raw restore:
-- none can land such a row from now on.
--
-- WHAT THE CONSTRAINTS MEAN (src/core/db/dd_ontology.ts — the TS predicate
-- ddOntologyIdentifierViolations states the SAME grammar, and every write door
-- runs it before any SQL; concepts/ontology.ts owns TIPO_PATTERN/TLD_PATTERN):
--   dd_ontology_tipo_grammar        tipo = letters+digits, at most 32 chars
--   dd_ontology_parent_grammar      parent NULL, or the same grammar (<= 32)
--   dd_ontology_model_tipo_grammar  model_tipo NULL, or the same grammar (<= 8)
--   dd_ontology_tld_grammar         tld NULL, or two-or-more letters (<= 32)
--   dd_ontology_tipo_in_tld         tld NULL, or the tipo's letter prefix IS the tld
--   dd_ontology_alias_of_grammar    properties.alias_of, when the key is present
--                                   on an object, is a string tipo (<= 32)
--
-- WHY NOT VALID (owner decision 2026-09-30): an INSTALLED database may already
-- hold violating rows. A validating ADD CONSTRAINT would fail this boot
-- migration on them and brick the update. NOT VALID skips the validation scan
-- and never touches an existing row, and binds every row written from now on
-- (an UPDATE of a legacy violating row is re-checked, so that write is refused
-- and converted to a typed ontology.invalid_node by the dd_ontology.ts doors).
-- The violating rows are REPORTED and REPAIRED by the reconcile
-- `ontology_identifiers` (src/core/ontology/identifier_grammar.ts), which then
-- VALIDATEs each constraint whose column is clean. This migration never runs
-- VALIDATE.
--
-- Lock: ADD CONSTRAINT … NOT VALID takes ACCESS EXCLUSIVE for an instant and
-- queues behind a long reader; the wait is bounded here and a timeout is
-- retried by the runner (install/db/migrate.ts, SQLSTATE 55P03).
--
-- IDEMPOTENT: each constraint is added only when its name is not already on
-- the table.

SET LOCAL lock_timeout = '5s';

DO $tipo_grammar$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		 WHERE conname = 'dd_ontology_tipo_grammar' AND conrelid = 'dd_ontology'::regclass
	) THEN
		ALTER TABLE dd_ontology ADD CONSTRAINT dd_ontology_tipo_grammar CHECK (tipo ~ '^[a-z]+[0-9]+$' AND char_length(tipo) <= 32) NOT VALID;
	END IF;
END
$tipo_grammar$;

DO $parent_grammar$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		 WHERE conname = 'dd_ontology_parent_grammar' AND conrelid = 'dd_ontology'::regclass
	) THEN
		ALTER TABLE dd_ontology ADD CONSTRAINT dd_ontology_parent_grammar CHECK (parent IS NULL OR (parent ~ '^[a-z]+[0-9]+$' AND char_length(parent) <= 32)) NOT VALID;
	END IF;
END
$parent_grammar$;

DO $model_tipo_grammar$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		 WHERE conname = 'dd_ontology_model_tipo_grammar' AND conrelid = 'dd_ontology'::regclass
	) THEN
		ALTER TABLE dd_ontology ADD CONSTRAINT dd_ontology_model_tipo_grammar CHECK (model_tipo IS NULL OR (model_tipo ~ '^[a-z]+[0-9]+$' AND char_length(model_tipo) <= 8)) NOT VALID;
	END IF;
END
$model_tipo_grammar$;

DO $tld_grammar$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		 WHERE conname = 'dd_ontology_tld_grammar' AND conrelid = 'dd_ontology'::regclass
	) THEN
		ALTER TABLE dd_ontology ADD CONSTRAINT dd_ontology_tld_grammar CHECK (tld IS NULL OR (tld ~ '^[a-z]{2,}$' AND char_length(tld) <= 32)) NOT VALID;
	END IF;
END
$tld_grammar$;

DO $tipo_in_tld$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		 WHERE conname = 'dd_ontology_tipo_in_tld' AND conrelid = 'dd_ontology'::regclass
	) THEN
		ALTER TABLE dd_ontology ADD CONSTRAINT dd_ontology_tipo_in_tld CHECK (tld IS NULL OR substring(tipo from '^[a-z]+') IS NOT DISTINCT FROM tld) NOT VALID;
	END IF;
END
$tipo_in_tld$;

DO $alias_of_grammar$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		 WHERE conname = 'dd_ontology_alias_of_grammar' AND conrelid = 'dd_ontology'::regclass
	) THEN
		ALTER TABLE dd_ontology ADD CONSTRAINT dd_ontology_alias_of_grammar CHECK (properties IS NULL OR jsonb_typeof(properties) <> 'object' OR NOT (properties ? 'alias_of') OR (jsonb_typeof(properties->'alias_of') = 'string' AND properties->>'alias_of' ~ '^[a-z]+[0-9]+$' AND char_length(properties->>'alias_of') <= 32)) NOT VALID;
	END IF;
END
$alias_of_grammar$;

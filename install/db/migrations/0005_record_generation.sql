-- P0-14 (second half) — the RECORD GENERATION store.
--
-- WHY. A record's address is (section_tipo, section_id), and
-- matrix_time_machine keys its history by that address ALONE. Where an id was
-- re-minted — before the counter half landed, or by a route it cannot fence —
-- the reborn record INHERITS the dead record's snapshots: the Time Machine
-- panel lists them as its own, and a restore writes the dead record's values
-- into the living one with ok:true.
--
-- WHAT IS STORED. Not a generation COUNT, but the point in the history log
-- where the current record's own history begins: `epoch_tm_id`, a
-- matrix_time_machine.id. That column is a monotonic serial and is already the
-- engine's own ordering for a record's history, so "the rows that belong to
-- THIS record" is exactly `matrix_time_machine.id >= epoch_tm_id`, served by
-- the existing (section_tipo, section_id DESC, id DESC) index.
--
-- WHY NOT A COLUMN ON matrix_time_machine. That table is the largest object on
-- a heritage install (a measured 50.5M rows / 46 GB on one). This design needs
-- NO schema change there and NO backfill: an address with no row here has
-- epoch 0, which means "all of it" — every existing record keeps its entire
-- history, unchanged, for free.
--
-- GRANDFATHERING IS DELIBERATE, not an omission. A re-minted rebirth and a
-- legitimate same-id UNDELETE leave byte-identical data (verified: the v6->v7
-- upgrade's remove_tm_created_sections purges birth markers, so a surviving
-- marker is a delete — but nothing distinguishes what happened at the address
-- afterwards). Seeding generations from the log would sever real curators from
-- real history on a guess. This fences the future; the past stays merged.
--
-- SPARSE BY CONSTRUCTION: a row is written only when a record is born at an
-- address that ALREADY has history — i.e. only for an actual rebirth.

CREATE TABLE IF NOT EXISTS dedalo_ts_record_generation (
	section_tipo varchar NOT NULL,
	section_id   integer NOT NULL,
	-- The lowest matrix_time_machine.id that belongs to the CURRENT record at
	-- this address. Rows below it are a dead record's history.
	epoch_tm_id  integer NOT NULL,
	-- When the epoch was opened (operational forensics only; never compared —
	-- the TM clock is wall-clock local time and is not orderable across a DST
	-- fold, which is why the discriminator is an id and not a timestamp).
	opened_at    timestamp NOT NULL DEFAULT now(),
	PRIMARY KEY (section_tipo, section_id)
);

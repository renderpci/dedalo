# matrix_time_machine Performance Improvement Plan

Partition `matrix_time_machine` by year on the `timestamp` column and implement complementary query optimizations to improve maintenance windows, parallel query execution, and time-based access patterns.

## Context

- **Size**: ~50M rows, growing ~5M/year
- **PostgreSQL**: v18+ (minimum supported by Dédalo v7)
- **Primary query pattern**: `section_id, section_tipo, tipo, lang, timestamp DESC` — scans full component/section history with no natural time bound
- **Current PK**: `matrix_time_machine_id` on `id` alone
- **FK references**: None found in schema
- **Table name hardcoding**: `matrix_time_machine` is used in ~637 references across 38 files, primarily via `tm_db_manager::$table` and `tm_record::search()` dynamic SQL

## Honest Assessment: Will Partitioning Help the Primary Queries?

**No — partition pruning will not apply to the dominant access pattern.**

Because users query by `section_id, section_tipo, tipo, lang` without filtering on `timestamp`, PostgreSQL must scan all yearly partitions and merge results. The planner cannot prune partitions.

**However, partitioning still provides real benefits:**
- Smaller indexes per partition → faster index scans and reduced bloat
- Parallel execution across partitions for large scans
- Partition-level VACUUM/REINDEX (minutes per year vs. hours for 50M rows)
- Faster bulk operations that DO use time bounds (BRIN date queries, activity stats, future retention)
- Ability to place older partitions on cheaper tablespaces

## Implementation Strategy

### Phase 1: Pre-migration Preparation
1. Run `pg_dump --schema-only` and document all current constraints, indexes, and sequence ownership
2. Verify no application code assumes `id` is the sole unique constraint (all CRUD in `tm_db_manager` uses `WHERE id = $1`, which works with a composite PK)
3. Clone production to staging for migration rehearsal

### Phase 2: Schema Changes (Shadow Table)

Create a new partitioned table alongside the existing one to avoid a long lock on the live table.

```sql
-- 1. Create new partitioned table
CREATE TABLE matrix_time_machine_new (
    id integer NOT NULL,
    section_id integer,
    section_tipo character varying(128),
    tipo character varying(128),
    lang character varying(8),
    timestamp timestamp without time zone,
    user_id character varying(8),
    bulk_process_id integer,
    data jsonb
) PARTITION BY RANGE (timestamp);

-- 2. New PK must include partition key
ALTER TABLE matrix_time_machine_new
    ADD CONSTRAINT matrix_time_machine_new_pkey PRIMARY KEY (id, timestamp);

-- 3. Attach sequence
ALTER TABLE matrix_time_machine_new
    ALTER COLUMN id SET DEFAULT nextval('matrix_time_machine_id_seq');

-- 4. Create yearly partitions (example: 2018 through current+1)
CREATE TABLE matrix_time_machine_y2023 PARTITION OF matrix_time_machine_new
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');
-- ... repeat for all years ...
CREATE TABLE matrix_time_machine_y2027 PARTITION OF matrix_time_machine_new
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

-- 5. Default partition catches edge cases
CREATE TABLE matrix_time_machine_default PARTITION OF matrix_time_machine_new DEFAULT;
```

### Phase 3: Data Migration

Migrate in batches to avoid long transactions and table bloat.

```sql
-- Batch insert by year (repeat per year)
INSERT INTO matrix_time_machine_new
SELECT * FROM matrix_time_machine
WHERE timestamp >= '2023-01-01' AND timestamp < '2024-01-01';
```

- Target: 1-2 million rows per batch
- Run `ANALYZE` on each partition after loading
- Monitor `pg_stat_progress_copy` or `pg_stat_user_tables`

### Phase 4: Index Creation

Create indexes on the partitioned parent table. PostgreSQL propagates them to all partitions.

```sql
-- Search default (primary access pattern)
CREATE INDEX matrix_time_machine_search_default_idx
    ON matrix_time_machine_new (section_id, section_tipo, tipo, lang, timestamp DESC);

-- Covering index for index-only scans (complementary optimization)
CREATE INDEX matrix_time_machine_covering_idx
    ON matrix_time_machine_new (section_id, section_tipo, tipo, lang, timestamp DESC)
    INCLUDE (id, user_id, bulk_process_id, data);

-- Existing indexes from db_pg_definitions.php
CREATE INDEX matrix_time_machine_timestamp_date_idx
    ON matrix_time_machine_new USING brin (DATE(timestamp));

CREATE INDEX matrix_time_machine_tipo_idx
    ON matrix_time_machine_new (tipo, id DESC);

CREATE INDEX matrix_time_machine_section_tipo_idx
    ON matrix_time_machine_new (section_tipo, id DESC);

CREATE INDEX matrix_time_machine_lang_idx
    ON matrix_time_machine_new (lang COLLATE pg_catalog.default ASC NULLS LAST);

CREATE INDEX matrix_time_machine_bulk_process_id_idx
    ON matrix_time_machine_new (bulk_process_id ASC NULLS LAST);

CREATE INDEX matrix_time_machine_user_id_idx
    ON matrix_time_machine_new ("user_id" ASC NULLS LAST);

CREATE INDEX matrix_time_machine_si_bulk_st_tipo_lang_idx
    ON matrix_time_machine_new (section_id ASC NULLS LAST, bulk_process_id ASC NULLS LAST,
        section_tipo COLLATE pg_catalog.default ASC NULLS LAST,
        tipo COLLATE pg_catalog.default ASC NULLS LAST,
        lang COLLATE pg_catalog.default ASC NULLS LAST);
```

### Phase 5: Cutover

```sql
-- Brief maintenance window
BEGIN;
    ALTER TABLE matrix_time_machine RENAME TO matrix_time_machine_old;
    ALTER TABLE matrix_time_machine_new RENAME TO matrix_time_machine;
COMMIT;
```

Update the sequence ownership:
```sql
ALTER SEQUENCE matrix_time_machine_id_seq OWNED BY matrix_time_machine.id;
```

## Partition Maintenance (Ongoing)

Future partitions are **not created automatically**. A scheduled cron job runs yearly to pre-create partitions.

### Cron Job Schedule

- **Frequency**: Once per year (e.g., December 1st)
- **Creates**: Next year + buffer year (e.g., on Dec 1 2026, create 2027 and 2028 partitions)
- **Safety net**: DEFAULT partition catches any insert if the job fails

### Maintenance Function

```sql
CREATE OR REPLACE FUNCTION create_matrix_time_machine_partitions(
    p_years_ahead integer DEFAULT 2
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_year integer;
    v_end_year integer;
    v_year integer;
    v_partition_name text;
    v_start_date date;
    v_end_date date;
    v_result text := '';
BEGIN
    v_start_year := EXTRACT(YEAR FROM CURRENT_DATE);
    v_end_year := v_start_year + p_years_ahead;

    FOR v_year IN v_start_year..v_end_year LOOP
        v_partition_name := 'matrix_time_machine_y' || v_year;
        v_start_date := (v_year || '-01-01')::date;
        v_end_date := ((v_year + 1) || '-01-01')::date;

        -- Skip if partition already exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_class
            WHERE relname = v_partition_name
            AND relkind = 'r'
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF matrix_time_machine
                 FOR VALUES FROM (%L) TO (%L)',
                v_partition_name, v_start_date, v_end_date
            );
            v_result := v_result || 'Created ' || v_partition_name || '; ';
        END IF;
    END LOOP;

    RETURN v_result;
END;
$$;
```

### Cron Job Examples

**Using pg_cron** (if extension available):
```sql
SELECT cron.schedule(
    'create-tm-partitions',
    '0 2 1 12 *',
    'SELECT create_matrix_time_machine_partitions(2);'
);
```

**Using OS cron**:
```bash
# /etc/cron.d/dedalo-tm-partitions
0 2 1 12 * postgres psql -d dedalo -c "SELECT create_matrix_time_machine_partitions(2);"
```

### DEFAULT Partition Safety Net

The DEFAULT partition catches inserts for which no specific partition exists. Monitor it periodically:

```sql
-- Check if DEFAULT partition has any rows (unexpected if cron job is working)
SELECT COUNT(*) FROM matrix_time_machine_default;

-- If rows exist, create the missing year partition and move data
-- (See PostgreSQL docs for DETACH PARTITION / ATTACH PARTITION)
```

### Monitoring

```sql
-- List all partitions and their sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE tablename LIKE 'matrix_time_machine_y%'
ORDER BY tablename;
```

## Code Changes Required

| File | Change |
|---|---|
| `core/db/db_pg_definitions.php` | Add partitioned table index definitions; update `TABLES_MATRIX_PLUS_TM` comment if needed; add `create_matrix_time_machine_partitions` function definition |
| `core/base/update/updates.php` | Add a new update block with the migration SQL/script for existing installations |
| `core/base/upgrade/class.v6_to_v7.php` | Add helper method for in-place migration (batched copy) |
| `core/db/class.tm_db_manager.php` | **No changes expected** — prepared statements on partitioned tables work transparently in PG 11+ |
| `core/tm_record/class.tm_record.php` | **No changes expected** — dynamic SQL on `matrix_time_machine` works transparently |
| `install/db/*.pgsql` | Update install schema to create `matrix_time_machine` as partitioned table with yearly partitions and the maintenance function |

### Phase 6: Application Verification

Test these critical paths before dropping the old table:
- `tm_db_manager::create()` — INSERT with prepared statement
- `tm_db_manager::read()` — SELECT by `id`
- `tm_db_manager::update()` — UPDATE by `id`
- `tm_db_manager::delete()` — DELETE by `id`
- `tm_record::search()` — dynamic SQL with multiple filters
- `tool_time_machine::bulk_revert_process()` — complex subqueries
- Time-machine UI (client-side)

### Phase 7: Cleanup

After a validation period (e.g., 1 week):
```sql
DROP TABLE matrix_time_machine_old;
```

## Complementary Optimizations (High Impact)

Since partitioning alone will not speed up the primary query pattern, implement these alongside:

1. **Covering index for index-only scans**: The `INCLUDE` index above lets PostgreSQL satisfy time-machine list queries without visiting heap pages, dramatically reducing I/O for the dominant pattern.

2. **Vacuum tuning for high-write table**:
   ```sql
   ALTER TABLE matrix_time_machine SET (
       autovacuum_vacuum_scale_factor = 0.02,
       autovacuum_analyze_scale_factor = 0.01
   );
   ```

3. **Pre-warm search_default_idx after migration**:
   ```sql
   SELECT pg_prewarm('matrix_time_machine_search_default_idx');
   ```

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| PK change `(id, timestamp)` breaks assumptions | Low | Verified: all lookups are `WHERE id = $1`, compatible with composite PK |
| Increased planning time from 10+ partitions | Medium | PG 18 handles large partition counts well; test with `EXPLAIN (ANALYZE, BUFFERS, TIMING)` |
| Migration takes hours and bloats WAL | Medium | Use batched per-year inserts; run during low-activity window |
| Prepared statement plan invalidation | Low | PG 11+ supports generic plans for partitioned tables; test `tm_db_manager::create()` |
| Index bloat on current-year partition | Medium | Lower `autovacuum_vacuum_scale_factor` on the active partition |

## Testing Strategy

1. **Staging clone**: Restore a recent production backup to staging
2. **Migration rehearsal**: Run the full migration script and measure duration
3. **Performance baseline**: Capture `EXPLAIN (ANALYZE, BUFFERS)` for:
   - `tm_record::search()` with `(section_id, section_tipo, tipo, lang)`
   - `bulk_revert_process()` query patterns
   - Time-machine UI list queries
4. **Regression test**: Run `vendor/bin/phpunit --testsuite "unit components"` and time-machine specific tests
5. **Bloat monitoring**: Check `pg_stat_user_tables` and `pgstattuple` after 48 hours of writes

## Estimated Timeline

| Phase | Duration |
|---|---|
| Staging rehearsal | 1 day |
| Schema + index prep | 2-4 hours |
| Data migration (50M rows) | 2-6 hours (depends on I/O) |
| Cutover + verification | 1-2 hours |
| Monitoring period | 1 week |

## Decision Gate

Before proceeding to implementation, confirm:
1. Staging environment is available with a production-sized clone
2. A maintenance window of at least 4 hours is acceptable for cutover
3. The covering index and vacuum tuning are approved as complementary work

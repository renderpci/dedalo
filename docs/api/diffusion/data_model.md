# Data Model: Diffusion Records

The Diffusion Engine resolves records from the Dédalo Matrix into a relational, table-like structure stored in MariaDB.

## 1. Response Objects (Progress)

Progress chunks follow the PHP SSE format to maintain compatibility with legacy client readers.

### `progress_data` (SSE Chunk)
```typescript
interface progress_data {
    process_id:  string;   // UUID
    is_running:  boolean;  // false on completion
    started_at:  number;   // timestamp
    data: {
        msg:            string;  // display message
        counter:        number;  // records processed
        total:          number;  // total target records
        section_label?: string;  // current table being inserted
        current?: { 
            section_id?: string | number; 
            time?: number 
        };
        total_ms?:      number;  // elapsed time
    };
    total_time:  string;   // human-readable (e.g. "3.2 sec")
    errors:      string[];
    result?:     engine_response; // only in final chunk
}
```

## 2. Table Structure

The diffusion process generates tables based on the ontology configuration.

- **Main Section**: Typically maps to one main table.
- **Relations / Cross-Sections**: Can map to separate tables or be flattened into the main table depending on the DDO map.

### Record Mapping
- Every record has a `section_id` (PostgreSQL Matrix ID).
- Column names correspond to the `tipo` or `label` defined in the ontology.

## 3. Record Deletion Handling

When a record is no longer "publishable" (e.g., deleted in the Matrix or visibility changed), the PHP Resolution Engine returns a special deletion marker instead of the record data.

### Deletion Format (PHP → Bun)
```json
{
  "section_id": "12345",
  "entries": "delete"
}
```

### Deletion Logic
When Bun encounters `entries: "delete"`, it stops parsing for that record and prepares a `DELETE` statement:
- **Scope**: Deletes **all language rows** for that `section_id` from the target table.
- **Transaction**: Deletions are executed within the same transaction as record upserts per chunk.
- **Impact**: Ensures that stale data is removed from the MariaDB diffusion tables in real-time.

## 4. Parsers

Bun applies a series of parsers to the raw data received from PHP before inserting it into MariaDB:

1.  **parser_text**: Normalizes character encoding and formats strings.
2.  **parser_date**: Standardizes dates to ISO format.
3.  **pattern_replacer**: Performs regex-based transformations.
4.  **locator_resolver**: Resolves section/record references.

The final parsed values are coerced into the appropriate SQL types (VARCHAR, TEXT, INT, etc.) during insertion.

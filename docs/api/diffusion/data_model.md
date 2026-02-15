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

## 3. Parsers

Bun applies a series of parsers to the raw data received from PHP before inserting it into MariaDB:

1.  **parser_text**: Normalizes character encoding and formats strings.
2.  **parser_date**: Standardizes dates to ISO format.
3.  **pattern_replacer**: Performs regex-based transformations.
4.  **locator_resolver**: Resolves section/record references.

The final parsed values are coerced into the appropriate SQL types (VARCHAR, TEXT, INT, etc.) during insertion.

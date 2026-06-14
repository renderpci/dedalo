<?php declare(strict_types=1);
/**
* CLASS LOCATORS_RESULT
* In-memory drop-in replacement for db_result when the result set is a PHP
* array of locator objects rather than a live PostgreSQL cursor.
*
* Dédalo's data-retrieval layer is built around db_result, which wraps a
* \PgSql\Result handle and exposes a uniform interface: iterate rows,
* fetch one at a time, count rows, seek to a position, and free resources.
* When a caller already holds the matching locators in memory (e.g. after
* resolving relations from a cached context, or building a synthetic list
* for unit / integration purposes) spinning up a real SQL query just to
* satisfy the db_result protocol is wasteful.
*
* locators_result wraps any plain PHP array of locator objects (or
* associative arrays) and exposes the same duck-typed interface as
* db_result, so any consumer that iterates, counts, seeks, or maps over a
* db_result handle can accept a locators_result without modification.
*
* Key behavioural differences from db_result:
*   - No database connection or PostgreSQL resource — no JSON-decode step.
*   - affected_rows() always returns 0 (not meaningful for a read-only list).
*   - seek() allows seeking TO count($items) (past-the-end), which means the
*     next fetch_one() / getIterator() call returns false immediately — this
*     matches tool_export's two-pass pattern (discover, seek(0), stream).
*   - __destruct() calls free() like db_result, but there is no underlying
*     resource to release; it merely empties the in-memory array.
*
* Implements IteratorAggregate so instances can be consumed in foreach loops
* exactly like db_result.
*
* @package Dédalo
* @subpackage Core
*/

class locators_result implements IteratorAggregate
{
    /**
    * items
    * Re-indexed array of locator objects or associative arrays supplied at
    * construction time. Re-indexing via array_values() ensures that
    * current_index can be used as a direct offset regardless of the keys
    * present in the caller's source array.
    * @var array $items
    */
    private array $items;

    /**
    * as_array
    * Controls the shape returned by fetch_one() / getIterator():
    *   - false (default): items are cast to stdClass objects (object mode).
    *   - true           : items are cast to associative arrays (array mode).
    * Mirrors the matching flag in db_result so callers that pass as_array
    * to their result factory get a consistent shape from both implementations.
    * @var bool $as_array
    */
    private bool $as_array;

    /**
    * current_index
    * Zero-based cursor position within $items. Advances by one each time
    * fetch_one() successfully returns an item, and can be reset arbitrarily
    * by seek(). When current_index >= count($items) the result set is
    * exhausted.
    * @var int $current_index
    */
    private int $current_index = 0;

    /**
    * __CONSTRUCT
    * Wraps an array of locator objects (or associative arrays) in the
    * db_result-compatible interface.
    *
    * The source array is re-keyed with array_values() so that sparse or
    * associatively-keyed arrays can be addressed by sequential integer
    * offset through current_index.
    *
    * @param array $locators      - Array of locator objects or associative arrays to wrap.
    * @param bool  $as_array = false - When true, items are returned as associative
    *                                  arrays; when false (default), as stdClass objects.
    * @return void
    */
    public function __construct(array $locators, bool $as_array = false)
    {
        $this->items    = array_values($locators);
        $this->as_array = $as_array;
    }

    /**
    * GETITERATOR
    * Yields each item in sequence from the current cursor position, advancing
    * current_index on every step via fetch_one().
    *
    * Because getIterator() delegates to fetch_one() rather than resetting
    * current_index to 0, a partial traversal followed by seek(0) and a
    * second foreach will work correctly — the same two-pass pattern used by
    * tool_export on db_result (discover columns on pass 1, stream rows on
    * pass 2).
    *
    * Satisfies the IteratorAggregate contract; PHP's foreach calls this
    * method automatically.
    *
    * @return Traversable - Generator that yields processed items one at a time.
    */
    public function getIterator(): Traversable
    {
        while ($this->current_index < count($this->items)) {
            yield $this->fetch_one();
        }
    }

    /**
    * FETCH_ALL
    * Returns every remaining item from the current cursor position as a
    * plain PHP array.
    *
    * Delegates to getIterator() and collects the generator output via
    * iterator_to_array(), so each item passes through process_item() and
    * the as_array flag is respected. Note that the returned array is keyed
    * by the generator's yield-keys (sequential integers starting at 0 from
    * the iterator's perspective, not from the original array).
    *
    * Callers that need all items from the beginning should call seek(0) first
    * when fetch_all() is called after a prior partial traversal.
    *
    * @return array - Array of processed items (objects or associative arrays).
    */
    public function fetch_all(): array
    {
        return iterator_to_array($this->getIterator());
    }

    /**
    * FETCH_ONE
    * Returns the item at the current cursor position and advances the cursor
    * by one, or returns false when the cursor is at or past the end of the
    * item list.
    *
    * This is the primitive that both getIterator() and fetch_all() build on.
    * Each call moves current_index forward, so repeated calls walk the list
    * sequentially. Use seek() to reposition the cursor.
    *
    * The raw item is passed through process_item() before being returned, so
    * the caller always receives either a stdClass or an associative array
    * depending on the as_array flag — never the original mixed-type value.
    *
    * @return object|array|false - Next item as an object or array, or false when exhausted.
    */
    public function fetch_one(): object|array|false
    {
        if ($this->current_index >= count($this->items)) {
            return false;
        }

        $item = $this->items[$this->current_index];
        $this->current_index++;

        return $this->process_item($item);
    }

    /**
    * ROW_COUNT
    * Returns the total number of items in the wrapped array, regardless of
    * the current cursor position.
    *
    * Mirrors db_result::row_count(), which calls pg_num_rows() on the live
    * PostgreSQL result. Callers can rely on this to decide how many iterations
    * to perform or to build progress-tracking metadata without consuming the
    * iterator.
    *
    * @return int - Total item count.
    */
    public function row_count(): int
    {
        return count($this->items);
    }

    /**
    * AFFECTED_ROWS
    * Stub that always returns 0 to satisfy the db_result interface contract.
    *
    * In db_result this delegates to pg_affected_rows(), which reports the
    * number of rows modified by an INSERT/UPDATE/DELETE. locators_result is
    * read-only (it wraps an already-resolved list), so no rows were ever
    * affected. Returns 0 unconditionally.
    *
    * @return int - Always 0.
    */
    public function affected_rows(): int
    {
        return 0;
    }

    /**
    * MAP_ITERATOR
    * Lazily transforms each item with a callback, yielding the mapped values
    * as a Generator keyed by the original iteration key.
    *
    * Useful when the consumer wants to reshape items on the fly without
    * materialising the full result set — for example, applying a formatting
    * function or projecting only certain fields during export streaming.
    *
    * The callback signature is: function(object|array $value, int $key): mixed
    *
    * @param callable $callback - Transformation applied to each item.
    *                             Receives ($value, $key) and should return the mapped value.
    * @return Generator - Lazy generator of ($key => $callback($value, $key)) pairs.
    */
    public function map_iterator(callable $callback): Generator
    {
        foreach ($this->getIterator() as $key => $value) {
            yield $key => $callback($value, $key);
        }
    }

    /**
    * SEEK
    * Repositions the internal cursor to the given zero-based row number,
    * allowing callers to re-traverse the result or jump ahead.
    *
    * Valid range: 0 to count($items) inclusive. Seeking to count($items)
    * (past-the-end) is allowed and causes the next fetch to return false
    * immediately, mirroring how tool_export uses seek() on db_result for
    * its two-pass column-discovery / row-streaming pattern.
    *
    * Returns false for any out-of-range value (negative, or > count).
    *
    * (!) The upper bound check uses `>` (strict greater-than), so seeking to
    * exactly count($items) is permitted. This differs from a typical
    * half-open-interval guard and is intentional to support the past-the-end
    * case described above.
    *
    * @param int $row_number - Target cursor position (0-based).
    * @return bool - true on success, false if $row_number is out of range.
    */
    public function seek(int $row_number): bool
    {
        if ($row_number < 0 || $row_number > count($this->items)) {
            return false;
        }
        $this->current_index = $row_number;
        return true;
    }

    /**
    * FREE
    * Releases the in-memory item list and resets the cursor.
    *
    * Mirrors db_result::free(), which calls pg_free_result() to release the
    * PostgreSQL resource. Here there is no external resource, so this method
    * simply empties the $items array and sets current_index to 0 to release
    * any referenced objects for garbage collection.
    *
    * Called automatically from __destruct().
    *
    * @return void
    */
    public function free(): void
    {
        $this->items = [];
        $this->current_index = 0;
    }

    /**
    * PROCESS_ITEM
    * Converts a raw item to the output shape dictated by the as_array flag.
    *
    * Items in the source array may be of mixed types (stdClass objects,
    * plain arrays, locator instances). This method normalises them to either
    * a stdClass (default, object mode) or an associative array (array mode)
    * by casting — (object) and (array) are both idempotent for the two common
    * input types, so no branching on input type is required.
    *
    * Note: unlike db_result's process_row_* methods, this method does NOT
    * JSON-decode any fields. Locators are already decoded PHP structures;
    * there is nothing to parse.
    *
    * @param mixed $item - Raw item from the $items array.
    * @return object|array - Normalised item as a stdClass or associative array.
    */
    private function process_item(mixed $item): object|array
    {
        if ($this->as_array) {
            return (array)$item;
        }
        return (object)$item;
    }

    /**
    * __DESTRUCT
    * Ensures $items is cleared when the instance goes out of scope, releasing
    * any locator objects held in the array for garbage collection.
    *
    * Delegates to free() so the cleanup logic is defined in one place.
    *
    * @return void
    */
    public function __destruct()
    {
        $this->free();
    }
}

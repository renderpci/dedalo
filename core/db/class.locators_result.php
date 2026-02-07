<?php declare(strict_types=1);
/**
 * LOCATORS_RESULT
 * Mimics db_result for an array of locators.
 * Iterable class to fetch locators as objects or associative arrays.
 * @implements IteratorAggregate
 */

class locators_result implements IteratorAggregate
{
    private array $items;
    private bool $as_array;
    private int $current_index = 0;

    /**
     * @param array $locators - Array of locator objects or arrays
     * @param bool $as_array - Whether to return rows as associative arrays
     */
    public function __construct(array $locators, bool $as_array = false)
    {
        $this->items    = array_values($locators);
        $this->as_array = $as_array;
    }

    /**
     * getIterator
     * @return Traversable
     */
    public function getIterator(): Traversable
    {
        while ($this->current_index < count($this->items)) {
            yield $this->fetch_one();
        }
    }

    /**
     * fetch_all
     * @return array
     */
    public function fetch_all(): array
    {
        return iterator_to_array($this->getIterator());
    }

    /**
     * fetch_one
     * @return object|array|false
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
     * row_count
     * @return int
     */
    public function row_count(): int
    {
        return count($this->items);
    }

    /**
     * affected_rows
     * @return int
     */
    public function affected_rows(): int
    {
        return 0;
    }

    /**
     * map_iterator
     * @param callable $callback
     * @return Generator
     */
    public function map_iterator(callable $callback): Generator
    {
        foreach ($this->getIterator() as $key => $value) {
            yield $key => $callback($value, $key);
        }
    }

    /**
     * seek
     * @param int $row_number
     * @return bool
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
     * free
     * @return void
     */
    public function free(): void
    {
        $this->items = [];
        $this->current_index = 0;
    }

    /**
     * process_item
     * @param mixed $item
     * @return object|array
     */
    private function process_item(mixed $item): object|array
    {
        if ($this->as_array) {
            return (array)$item;
        }
        return (object)$item;
    }

    public function __destruct()
    {
        $this->free();
    }
}

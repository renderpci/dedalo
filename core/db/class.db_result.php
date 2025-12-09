<?php declare(strict_types=1);
/**
* DB_RESULT
* Manages database results from PostgreSQL queries.
* Iterable class to fetch results as objects or associative arrays.
* @implements IteratorAggregate
* Usage:
* $result = pg_query($connection, "SELECT * FROM matrix_users");
* $db_result = new db_result($result);
* 
* foreach ($db_result as $row) {
*	echo $row->name;
* }
*/

class db_result implements IteratorAggregate
{
	private \PgSql\Result $result;
	private bool $as_array;
	private array $json_columns;
	
	public function __construct(\PgSql\Result $result, ?array $json_columns=null, bool $as_array = false)
	{
		$this->result 		= $result;
		$this->as_array 	= $as_array;
		$this->json_columns = $json_columns ?? matrix_db_manager::$json_columns;
	}
	
	public function getIterator(): Traversable
	{
		if ($this->as_array) {
			while ($row = pg_fetch_assoc($this->result)) {
				yield $this->process_row_array($row);
			}
		} else {
			while ($row = pg_fetch_object($this->result)) {
				yield $this->process_row_object($row);
			}
		}
	}
	
	public function fetch_all(): array
	{
		return iterator_to_array($this->getIterator());
	}
	
	public function fetch_one()
	{
		if ($this->as_array) {
			return pg_fetch_assoc($this->result);
		}
		return pg_fetch_object($this->result);
	}
	
	public function row_count(): int
	{
		return pg_num_rows($this->result);
	}
	
	public function affected_rows(): int
	{
		return pg_affected_rows($this->result);
	}

	private function process_row_array(array $row): array
	{
		foreach ( $row as $column => $value ) {
			if ( $value !== null && isset($this->json_columns[$column])  ) {
				$row[$column] = json_decode($value, true);
			}
		}
		return $row;
	}

	private function process_row_object(object $row): object
	{
		foreach ( $row as $column => $value ) {	
			if ( $value !== null && isset($this->json_columns[$column])  ) {
				$row->$column = json_decode($value);
			}
		}
		return $row;
	}

	/**
	 * Map iterator
	 * @param callable $callback
	 * @return Generator
	 * @usage
	 *  $mapped = $this->map_iterator(fn($n) => $n * 2);
	 */
	public function map_iterator(callable $callback): Generator
	{
		foreach ($this->getIterator() as $key => $value) {
			yield $key => $callback($value, $key);
		}
	}
	
	public function free(): void
	{
		pg_free_result($this->result);
	}
	
	public function __destruct()
	{
		if (isset($this->result)) {
			$this->free();
		}
	}
}
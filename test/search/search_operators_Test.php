<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* SEARCH_OPERATORS_TEST
* Differential test of every search operator advertised by the string components
* (search_operators_info) for component_input_text and component_text_area.
*
* For every operator it resolves the real query_object, renders it to SQL the same way
* search::get_sql_where() does, runs it against a fixed list of synthetic records and
* compares the matched records with an expectation calculated here from the same records.
* The expectation is built from the VALUES of the record, never from a regex, so it's
* independent of how the component builds his WHERE.
*/
final class search_operators_test extends TestCase {

	public static $section_tipo	= 'test3';
	public static $tipo_string	= 'test52';	// component_input_text
	public static $tipo_text	= 'test17';	// component_text_area

	private static $L1 = null;	// first project lang
	private static $L2 = null;	// second project lang (or the first one when only one exists)



	/**
	* SET_UP_BEFORE_CLASS
	* @return void
	*/
	public static function setUpBeforeClass() : void {

		$ar_langs = array_values(common::get_ar_all_langs());
		self::$L1 = $ar_langs[0];
		self::$L2 = $ar_langs[1] ?? $ar_langs[0];

		if (login::is_logged()===false) {
			login_test::force_login(TEST_USER_ID);
		}
	}//end setUpBeforeClass



	/**
	* FIXTURES
	* Synthetic records. null means the component is not present in the record at all
	* @return array
	*/
	private static function fixtures() : array {

		$l1 = self::$L1;
		$l2 = self::$L2;

		return [
			 1 => [$l1=>['Pepe Garcia']],
			 2 => [$l1=>['Pepe']],
			 3 => [$l1=>['pepe garcia']],						// case variant
			 4 => [$l1=>['Pépe Garcia']],						// accent variant
			 5 => [$l1=>['Antonio Pepe Garcia Lopez']],			// contains, not equal
			 6 => [$l1=>['Garcia Pepe']],
			 7 => [$l1=>['Alpha','Pepe Garcia']],				// multi value, 2nd matches
			 8 => [$l1=>['Pepe Garcia','Zeta']],				// multi value, 1st matches
			 9 => [$l2=>['Pepe Garcia']],						// only in the 2nd lang
			10 => [$l1=>['Nada'], $l2=>['Pepe Garcia']],		// one value per lang
			11 => [$l1=>[]],									// empty array
			12 => [$l1=>null],									// legacy null
			13 => null,											// component absent
			14 => [$l1=>['<p>Pepe Garcia</p>']],				// rich text shape
			15 => [$l1=>['<p></p>']],
			16 => [$l1=>['Pepe (Garcia)']],						// regex parenthesis
			17 => [$l1=>['Pepe.Garcia']],						// regex dot
			18 => [$l1=>['PepeXGarcia']],						// would match 'Pepe.Garcia' as a regex
			19 => [$l1=>['']],
			20 => [$l1=>['2000-2010']],
			21 => [$l1=>['Pepe[1]']],							// regex brackets
			22 => [$l1=>['PepeX1]']],
			23 => [$l1=>['Pepe+Garcia']],						// regex quantifier
			24 => [$l1=>['PepeeGarcia']],
			25 => [$l1=>['Pepe|Garcia']],						// regex alternation
			26 => [$l1=>['Pepe']],
			27 => [$l1=>['Pepe?']],
			28 => [$l1=>['<p>Pepe Garcia dice algo</p>']],
			29 => [$l1=>['<p>algo dice Pepe Garcia</p>']]
		];
	}


	private static function fold(string $s, bool $ci=true) : string {
		$s = strtr($s, ['á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ñ'=>'n','Á'=>'A','É'=>'E','Í'=>'I','Ó'=>'O','Ú'=>'U','Ñ'=>'N']);
		return $ci ? mb_strtolower($s) : $s;
	}
	private static function values($fx) : array {
		if ($fx===null) return [];
		$ar_values = [];
		foreach ($fx as $ar_lang_values) {
			if (!is_array($ar_lang_values)) continue;
			foreach ($ar_lang_values as $current_value) $ar_values[] = $current_value;
		}
		return $ar_values;
	}
	private static function has_content($fx) : bool {
		if ($fx===null) return false;
		foreach ($fx as $ar_lang_values) {
			if (is_array($ar_lang_values) && count($ar_lang_values)>0) return true;
		}
		return false;
	}


	/**
	* RENDER_LEAF
	* Mirror of search::get_sql_where() 'direct' format, against the jsonb column b.j
	* @param object $query_object
	* @return string
	*/
	private function render_leaf(object $query_object) : string {

		$component_path = $query_object->component_path;
		$lang			= $query_object->lang ?? 'all';
		if ($lang!=='all') {
			$last = (string)end($component_path);
			if (substr($last,0,3)!=='lg-') $component_path[] = $lang;
		}
		$path		= '{'.implode(',', array_slice($component_path, 3)).'}';
		$type		= $query_object->type ?? 'string';
		$unaccent	= ($query_object->unaccent ?? false)===true;

		$left = ($unaccent ? 'f_unaccent(' : '')
			. "b.j #>" . ($type==='string' ? '>' : '') . " '".$path."'"
			. ($unaccent ? ')' : '');

		$sql		= $left.' '.$query_object->operator.' ';
		$q_parsed	= (string)($query_object->q_parsed ?? '');
		if ($type==='string') {
			$q_parsed = str_replace(['(',')'], ['\(','\)'], $q_parsed);
		}
		if ($q_parsed==='') return $sql;	// IS NULL / IS NOT NULL

		return $sql . ($unaccent ? 'f_unaccent('.$q_parsed.')' : $q_parsed);
	}

	private function render(object $node) : string {
		if (property_exists($node, 'path')) return '('.$this->render_leaf($node).')';
		$operator	= array_key_first(get_object_vars($node));
		$glue		= strtoupper(substr($operator,1));
		$ar_part	= [];
		foreach ($node->{$operator} as $current_node) $ar_part[] = $this->render($current_node);
		return '('.implode(' '.$glue.' ', $ar_part).')';
	}

	private function build_query_object(string $tipo, string $q) : object {
		$query_object = new stdClass();
			$query_object->q				= [$q];
			$query_object->q_operator		= null;
			$query_object->q_split			= true;
			$query_object->type				= 'jsonb';
			$query_object->lang				= 'all';
			$query_object->component_path	= ['components',$tipo,'dato'];
			$path_item = new stdClass();
				$path_item->section_tipo	= self::$section_tipo;
				$path_item->component_tipo	= $tipo;
			$query_object->path = [$path_item];
		return $query_object;
	}

	private function matched(string $where) : array {
		$ar_row = [];
		foreach (self::fixtures() as $id => $fx) {
			$json = ($fx===null)
				? 'NULL'
				: "'".pg_escape_string(DBi::_getConnection(), json_encode($fx, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES))."'::jsonb";
			$ar_row[] = '('.$id.','.$json.')';
		}
		$sql = 'SELECT b.id FROM (VALUES '.implode(',',$ar_row).') AS b(id,j) WHERE '.$where.' ORDER BY b.id';
		$result = pg_query(DBi::_getConnection(), $sql);
		$this->assertNotFalse($result, 'Invalid generated SQL: '.$sql);
		$ar_id = [];
		while ($row = pg_fetch_row($result)) $ar_id[] = (int)$row[0];
		return $ar_id;
	}


	/**
	* TEST_OPERATORS
	* @return void
	*/
	public function test_operators() : void {

		$ar_needle = [
			'Pepe Garcia',		// multi word
			'Pepe',				// single word
			'Pepe.Garcia',		// regex dot
			'Pepe (Garcia)',	// regex parenthesis
			'Pepe[1]',			// regex brackets
			'Pepe+Garcia',		// regex quantifier
			'Pepe|Garcia',		// regex alternation
			'Pepe?'				// regex quantifier
		];

		foreach ($ar_needle as $needle) {
			$this->check(self::$tipo_string, 'component_input_text', $needle);
			$this->check(self::$tipo_text,   'component_text_area',  $needle);
		}
	}


	/**
	* TEST_LANG_KEYS_ARE_NOT_SEARCHABLE
	* A regex must run against the values of one lang and never against the whole
	* multi-language blob, else searching a lang code returns unrelated records
	* @return void
	*/
	public function test_lang_keys_are_not_searchable() : void {

		$lang_fragment = substr(self::$L1, 3);	// as 'spa' from 'lg-spa'

		foreach ([[self::$tipo_string,'component_input_text'], [self::$tipo_text,'component_text_area']] as [$tipo,$class]) {
			foreach ([$lang_fragment, 'lg-'] as $needle) {
				$tree	= $class::resolve_query_object_sql( $this->build_query_object($tipo, $needle) );
				$got	= $this->matched( $this->render($tree) );
				$this->assertSame(
					[],
					$got,
					$class.': searching "'.$needle.'" must not match the lang keys of the stored json'
				);
			}
		}
	}


	/**
	* CHECK
	* @param string $tipo
	* @param string $class
	* @param string $needle
	* @return void
	*/
	private function check(string $tipo, string $class, string $needle) : void {

		$fixtures		= self::fixtures();
		$is_text_area	= ($class==='component_text_area');

		$any = fn(callable $predicate) => fn($fx) => (bool)array_filter(self::values($fx), $predicate);

		$contains_ci	= $any(fn($v)=> mb_strpos(self::fold($v), self::fold($needle))!==false);
		$contains_raw	= $any(fn($v)=> mb_strpos($v, $needle)!==false);
		$equal_ci		= $any(fn($v)=> self::fold($v)===self::fold($needle));
		$equal_cs		= $any(fn($v)=> self::fold($v,false)===self::fold($needle,false));
		$identical		= $any(fn($v)=> $v===$needle);
		$identical_p	= $any(fn($v)=> $v==='<p>'.$needle.'</p>');

		// rich text begins/ends after or before an html tag
		$begins = $any(function($v) use ($needle,$is_text_area) {
			$ar_candidate = [self::fold($v)];
			if ($is_text_area) foreach (preg_split('/>/', self::fold($v)) as $segment) $ar_candidate[] = $segment;
			foreach ($ar_candidate as $candidate) if (mb_strpos($candidate, self::fold($needle))===0) return true;
			return false;
		});
		$ends = $any(function($v) use ($needle,$is_text_area) {
			$folded_needle = self::fold($needle);
			if ($folded_needle==='') return false;
			$ar_candidate = [self::fold($v)];
			if ($is_text_area) foreach (preg_split('/</', self::fold($v)) as $segment) $ar_candidate[] = $segment;
			foreach ($ar_candidate as $candidate) {
				if ($candidate!=='' && mb_substr($candidate, -mb_strlen($folded_needle))===$folded_needle) return true;
			}
			return false;
		});
		// the default case splits the phrase in words and requires all of them
		$split_contains = function($fx) use ($needle) {
			foreach (preg_split('/\s+/', $needle) as $word) {
				$found = (bool)array_filter(self::values($fx), fn($v)=> mb_strpos(self::fold($v), self::fold($word))!==false);
				if (!$found) return false;
			}
			return true;
		};

		$ar_case = [
			['default contains',	$needle,				$split_contains],
			['*text* contains',		'*'.$needle.'*',		$contains_ci],
			['text* begins_with',	$needle.'*',			$begins],
			['*text end_with',		'*'.$needle,			$ends],
			['= similar_to',		'='.$needle,			$equal_ci],
			['!= different_from',	'!='.$needle,			fn($fx)=>!$equal_ci($fx)],
			['- does_not_contain',	'-'.$needle,			fn($fx)=>!$contains_ci($fx)],
			["'text' literal",		"'".$needle."'",		$is_text_area ? $contains_raw : $equal_cs],
			['== exactly_equal',	'=='.$needle,			fn($fx)=>$identical($fx) || ($is_text_area && $identical_p($fx))],
			['* no_empty',			'*',					fn($fx)=>self::has_content($fx)],
			['!* empty',			'!*',					fn($fx)=>!self::has_content($fx)]
		];

		foreach ($ar_case as [$label,$q,$predicate]) {

			$tree	= $class::resolve_query_object_sql( $this->build_query_object($tipo, $q) );
			$got	= $this->matched( $this->render($tree) );

			$expected = [];
			foreach ($fixtures as $id => $fx) if ($predicate($fx)) $expected[] = $id;

			$this->assertSame(
				$expected,
				$got,
				$class.' | operator '.$label.' | needle "'.$needle.'"' . PHP_EOL
					.' expected records: ['.implode(',',$expected).']' . PHP_EOL
					.' matched records : ['.implode(',',$got).']'
			);
		}
	}
}

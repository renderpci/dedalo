<?php declare(strict_types=1);
/**
* CLASS RAG_CHARACTERIZER
* "Characterize an object by its relatives" — the proposal engine behind
* "propose this coin's typology" and "tell me this object's period". It is NOT a
* generative guess: it retrieves the visually-(and metadata-)nearest objects and
* AGGREGATES their structured ontology metadata into a proposal, with a confidence
* and the cited supporting records. Verifiable, grounded, no hallucination.
*
* Roles to aggregate (typology / period / material / …) are declared per section
* in properties.rag.context.metadata. Crucially, each NEIGHBOUR's value is read
* through the NEIGHBOUR's own section context (cross-section comparison respects
* each section's ontology mapping).
*
* Aggregation:
* - categorical (typology / material / thesaurus term) → similarity-weighted vote.
* - date / period (component_date) → an earliest…latest range with a weighted
*   central estimate, using dd_date::convert_date_to_seconds() for ordering.
*
* The aggregation primitives are pure static functions (unit-testable without a DB).
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_characterizer {



	/**
	* CHARACTERIZE
	* @param string $section_tipo
	* @param int $section_id
	* @param array<int,string>|null $fields  roles to propose (default: all declared)
	* @param array $opts { top_k?, user_id? }
	* @return object { proposals: { role => {proposal, confidence, kind, evidence[]} }, neighbours_considered }
	*/
	public static function characterize( string $section_tipo, int $section_id, ?array $fields=null, array $opts=[] ) : object {

		$out = new stdClass();
			$out->proposals = new stdClass();
			$out->neighbours_considered = 0;

		$top_k = (int)($opts['top_k'] ?? (defined('DEDALO_RAG_CHARACTERIZE_TOP_K') ? DEDALO_RAG_CHARACTERIZE_TOP_K : 20));

		$neighbours = retrieval::find_similar_objects($section_tipo, $section_id, [
			'mode'		=> 'hybrid',
			'top_k'		=> $top_k,
			'user_id'	=> $opts['user_id'] ?? null
		]);
		$out->neighbours_considered = count($neighbours);
		if (empty($neighbours)) {
			return $out;
		}

		$roles = $fields ?? array_keys(rag_config::get_context_metadata($section_tipo));
		foreach ($roles as $role) {

			$cat_items	= []; // {value, weight, record, thumb}
			$date_items	= []; // {from, to, label, weight, record, thumb}

			foreach ($neighbours as $n) {
				$n_st	= (string)$n['section_tipo'];
				$n_sid	= (int)$n['section_id'];
				$weight	= (float)($n['rrf_score'] ?? ($n['score'] ?? 0.0));
				$thumb	= $n['chunk_meta']['thumb_url'] ?? null;

				$n_meta = rag_config::get_context_metadata($n_st);
				$tipo = $n_meta[$role] ?? null;
				if (empty($tipo)) {
					continue;
				}

				$date = self::read_date($tipo, $n_sid, $n_st);
				if ($date !== null) {
					$date_items[] = $date + ['weight'=>$weight, 'record'=>[$n_st,$n_sid], 'thumb'=>$thumb];
					continue;
				}
				$label = self::read_label($tipo, $n_sid, $n_st);
				if ($label !== null && $label !== '') {
					$cat_items[] = ['value'=>$label, 'weight'=>$weight, 'record'=>[$n_st,$n_sid], 'thumb'=>$thumb];
				}
			}

			if (!empty($date_items)) {
				$out->proposals->{$role} = self::summarize_dates($date_items);
			} elseif (!empty($cat_items)) {
				$out->proposals->{$role} = self::aggregate_categorical($cat_items);
			}
		}

		return $out;
	}//end characterize



	// ------------------------------------------------------------------
	// pure aggregation primitives (unit-testable)
	// ------------------------------------------------------------------

	/**
	* AGGREGATE_CATEGORICAL  similarity-weighted vote
	* @param array<int,array{value:string,weight:float,record?:array,thumb?:?string}> $items
	* @return object { kind:'categorical', proposal, confidence, distribution[], evidence[] }
	*/
	public static function aggregate_categorical( array $items ) : object {

		$weight_by_value = [];
		$total = 0.0;
		foreach ($items as $it) {
			$v = (string)$it['value'];
			$w = max(0.0, (float)$it['weight']);
			$weight_by_value[$v] = ($weight_by_value[$v] ?? 0.0) + $w;
			$total += $w;
		}
		arsort($weight_by_value);

		$distribution = [];
		foreach ($weight_by_value as $v => $w) {
			$distribution[] = ['value'=>$v, 'share'=> $total>0 ? round($w/$total, 4) : 0.0];
		}
		$proposal = array_key_first($weight_by_value);
		$confidence = $total > 0 ? round(reset($weight_by_value) / $total, 4) : 0.0;

		$out = new stdClass();
			$out->kind			= 'categorical';
			$out->proposal		= $proposal;
			$out->confidence	= $confidence;
			$out->distribution	= $distribution;
			$out->evidence		= self::evidence_for($items, static fn($it) => (string)$it['value'] === (string)$proposal);
		return $out;
	}//end aggregate_categorical



	/**
	* SUMMARIZE_DATES  earliest…latest range + weighted-central estimate
	* @param array<int,array{from:int,to:int,label:string,weight:float,record?:array,thumb?:?string}> $items
	* @return object { kind:'date_range', proposal:{earliest,latest,central}, confidence, evidence[] }
	*/
	public static function summarize_dates( array $items ) : object {

		// earliest by 'from', latest by 'to'
		usort($items, static fn($a, $b) => $a['from'] <=> $b['from']);
		$earliest = $items[0];
		$latest = $items[0];
		foreach ($items as $it) {
			if ($it['to'] > $latest['to']) { $latest = $it; }
		}

		// weighted-median of midpoints → central
		$mids = [];
		foreach ($items as $it) {
			$mids[] = ['mid'=>($it['from']+$it['to'])/2, 'weight'=>max(0.0,(float)$it['weight']), 'label'=>$it['label']];
		}
		usort($mids, static fn($a, $b) => $a['mid'] <=> $b['mid']);
		$total_w = array_sum(array_column($mids, 'weight'));
		$central = $mids[(int)floor(count($mids)/2)]; // fallback unweighted median
		if ($total_w > 0) {
			$acc = 0.0;
			foreach ($mids as $m) {
				$acc += $m['weight'];
				if ($acc >= $total_w/2) { $central = $m; break; }
			}
		}

		// confidence = clustering of midpoints (1 - normalized spread)
		$span = max(1, $latest['to'] - $earliest['from']);
		$mid_min = $mids[0]['mid']; $mid_max = $mids[count($mids)-1]['mid'];
		$confidence = round(max(0.0, 1.0 - (($mid_max - $mid_min) / $span)), 4);

		$out = new stdClass();
			$out->kind		= 'date_range';
			$out->proposal	= (object)[
				'earliest'	=> $earliest['label'],
				'latest'	=> $latest['label'],
				'central'	=> $central['label']
			];
			$out->confidence= $confidence;
			$out->evidence	= self::evidence_for($items, static fn($it) => true);
		return $out;
	}//end summarize_dates



	/**
	* EVIDENCE_FOR  shape the contributing neighbours (cited support), top 8
	* @param array<int,array<string,mixed>> $items
	* @param callable $match
	* @return array<int,object>
	*/
	private static function evidence_for( array $items, callable $match ) : array {

		$ev = [];
		foreach ($items as $it) {
			if (!$match($it)) {
				continue;
			}
			$ev[] = (object)[
				'section_tipo'	=> $it['record'][0] ?? null,
				'section_id'	=> $it['record'][1] ?? null,
				'value'			=> $it['value'] ?? ($it['label'] ?? null),
				'weight'		=> round((float)($it['weight'] ?? 0), 4),
				'thumb_url'		=> $it['thumb'] ?? null
			];
		}
		usort($ev, static fn($a, $b) => $b->weight <=> $a->weight);
		return array_slice($ev, 0, 8);
	}//end evidence_for



	// ------------------------------------------------------------------
	// value readers (best-effort)
	// ------------------------------------------------------------------

	/**
	* READ_DATE  a component_date's first item → {from, to, label} in ordinal
	* seconds, or null when the component is not a date / has no value.
	* @param string $component_tipo
	* @param int $section_id
	* @param string $section_tipo
	* @return ?array
	*/
	private static function read_date( string $component_tipo, int $section_id, string $section_tipo ) : ?array {

		try {
			$model = ontology_node::get_model_by_tipo($component_tipo, true);
			if ($model !== 'component_date') {
				return null;
			}
			$c = component_common::get_instance(null, $component_tipo, $section_id, 'list', DEDALO_DATA_LANG, $section_tipo);
			if ($c === null) {
				return null;
			}
			$data = $c->get_data();
			$item = $data[0] ?? null;
			if (!is_object($item)) {
				return null;
			}
			$start = $item->start ?? null;
			$end   = $item->end ?? $start;
			if (!is_object($start)) {
				return null;
			}
			$from = dd_date::convert_date_to_seconds(new dd_date($start));
			$to   = is_object($end) ? dd_date::convert_date_to_seconds(new dd_date($end)) : $from;
			$label = $c->get_value() ?? '';
			return ['from'=>(int)$from, 'to'=>(int)$to, 'label'=>(string)$label];
		} catch (\Throwable $e) {
			return null;
		}
	}//end read_date



	/**
	* READ_LABEL  any component's displayable value (typology/material/term)
	* @param string $component_tipo
	* @param int $section_id
	* @param string $section_tipo
	* @return ?string
	*/
	private static function read_label( string $component_tipo, int $section_id, string $section_tipo ) : ?string {

		return rag_text_extractor::get_component_value($component_tipo, $section_id, $section_tipo, DEDALO_DATA_LANG);
	}//end read_label



}//end class rag_characterizer

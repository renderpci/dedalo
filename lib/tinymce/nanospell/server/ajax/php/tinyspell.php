<?php
error_reporting(E_ERROR);
try{ini_set("memory_limit","255M");}catch(Exception $e){}
//  Freeing up memory where available improoves performance on larger dictionaries.
$token = explode("\n","".file_get_contents("../../license/key.lic"));
$token = trim($token[0]); 
$rawPostData = file_get_contents('php://input');
$post        = json_decode($rawPostData);
require('lib.php');
require('spellcheck.php');
if (!$post->id) {
	die("JSON Data sent in unexpected format for TinyMCE 4");
} //!$post->id
if ($post->method == 'spellcheck') {
	echo '{"id":"' . protect($post->id) . '","result": {';
	$first = true;
	foreach ($post->params->words as $word) {
		if (!$spellcheckObject->SpellCheckWord($word)) {
			if ($first) {
				$first = false;
			} //$first
			else {
				echo ",";
			}
		 		$suggestions = $spellcheckObject->Suggestions($word);
				$strsuggestions = "[";
				for ($i = 0; $i < count($suggestions); $i++) {
						if ($i > 0) {
								$strsuggestions .= ",";
						} //$i > 0
						$strsuggestions .= '"' . protect($suggestions[$i]) . '"';
				} //$i = 0; $i < count($suggestions) && $i < MAX_SUGGESTIONS; $i++
				$strsuggestions .= "]";
			$word = protect($word);
			echo "\"$word\":$strsuggestions";
		} //!$spellcheckObject->SpellCheckWord($word)
	} //$post->params->words as $word
	echo '}}';
} //$post->method == 'spellcheck'
if ($post->method == 'listdicts') {
	echo '{"id":"' . $post->id . '","result": {';
	$dictionaries = $spellcheckObject->ListDictionaries();
	echo '"dicts": ["' . implode('","', $dictionaries) . '"]';
	echo '}';
	echo '}';
} //$post->method == 'listdicts'



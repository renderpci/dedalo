<?php
if($post->params->lang){
$RequestedLangs = explode(",",$post->params->lang);
}else{
$RequestedLangs= array("es");
}
$spellcheckObject = new PHP_MCESpellCheck();
$spellcheckObject -> LicenceKey=$token;
$spellcheckObject -> IgnoreAllCaps = false;
$spellcheckObject -> IgnoreNumeric = false;
$spellcheckObject -> CaseSensitive = true;
$spellcheckObject -> SuggestionTollerance = 1.5;
$spellcheckObject -> DictionaryPath = ("../../dictionaries/");
foreach($RequestedLangs as $dictionary){   $spellcheckObject -> LoadDictionary(trim($dictionary) );}
$spellcheckObject -> LoadCustomDictionary("custom.txt");
$spellcheckObject -> LoadCustomBannedWords("language-rules/banned-words.txt"); 
$spellcheckObject -> LoadEnforcedCorrections("language-rules/enforced-corrections.txt");
$spellcheckObject -> LoadCommonTypos("language-rules/common-mistakes.txt");

function protect($word){
	$word = str_replace("<","&lt;",$word);
	$word = str_replace(">","&gt;",$word);	
	return $word;
}
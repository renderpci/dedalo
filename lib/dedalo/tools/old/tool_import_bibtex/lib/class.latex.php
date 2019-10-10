<?php





class latex {


	/**
	* LATEX_DECODE 
	*
		LaTeX command	Sample	Description (https://en.wikibooks.org/wiki/LaTeX/Special_Characters)
		\`{o}	ò	grave accent
		\'{o}	ó	acute accent
		\^{o}	ô	circumflex
		\"{o}	ö	umlaut, trema or dieresis
		\H{o}	ő	long Hungarian umlaut (double acute)
		\~{o}	õ	tilde
		\c{c}	ç	cedilla
		\k{a}	ą	ogonek
		\l{}	ł	barred l (l with stroke)
		\={o}	ō	macron accent (a bar over the letter)
		\b{o}	o	bar under the letter
		\.{o}	ȯ	dot over the letter
		\d{u}	ụ	dot under the letter
		\r{a}	å	ring over the letter (for å there is also the special command \aa)
		\u{o}	ŏ	breve over the letter
		\v{s}	š	caron/háček ("v") over the letter
		\t{oo}	o͡o	"tie" (inverted u) over the two letters
		\o		ø	slashed o (o with stroke)

		# More symbols : http://hevea.inria.fr/examples/test/sym.html
	*
	* @param string 
	* @return string
	*/
	public static function latex_decode( $string ) {

		$ar_map = array(

			"\'{a}" => 'á',		#	\'{a}	á	acute accent
			"\'{e}" => 'é',		#	\'{e}	é	acute accent
			"\'{i}" => 'í',		#	\'{i}	í	acute accent
			"\'{\i}"=> 'í',		#	\'{i}	í	acute accent
			"\'{o}" => 'ó',		#	\'{o}	ó	acute accent
			"\'{u}" => 'ú',		#	\'{u}	ú	acute accent

			"\'{A}" => 'Á',		#	\'{a}	á	acute accent
			"\'{E}" => 'É',		#	\'{E}	É	ACUTE ACCENT
			"\'{I}" => 'Í',		#	\'{I}	Í	ACUTE ACCENT
			"\'{\I}"=> 'Í',		#	\'{I}	Í	ACUTE ACCENT
			"\'{O}" => 'Ó',		#	\'{O}	Ó	ACUTE ACCENT
			"\'{U}" => 'Ú',		#	\'{U}	Ú	ACUTE ACCENT

			"\`{a}" => 'à',		#	\`{a}	à	grave accent
			"\`{e}" => 'è',		#	\`{e}	è	grave accent
			"\`{i}" => 'ì',		#	\`{i}	ì	grave accent
			"\`{\i}"=> 'ì',		#	\`{i}	ì	grave accent
			"\`{o}" => 'ò',		#	\`{o}	ò	grave accent
			"\`{u}" => 'ù',		#	\`{u}	ù	grave accent

			"\`{A}" => 'À',		#	\`{A}	À	GRAVE ACCENT
			"\`{E}" => 'È',		#	\`{E}	È	GRAVE ACCENT
			"\`{I}" => 'Ì',		#	\`{I}	Ì	GRAVE ACCENT
			"\`{\I}"=> 'Ì',		#	\`{I}	Ì	GRAVE ACCENT
			"\`{O}" => 'Ò',		#	\`{O}	Ò	GRAVE ACCENT
			"\`{U}" => 'Ù',		#	\`{U}	Ù	GRAVE ACCENT

			"\\textperiodcentered" 	=> '·',		# {\textperiodcentered}
			"\\textordfeminine"	   	=> 'ª',
			"\\textordmasculine" 	=> 'º',
			"\\textquestiondown" 	=> '¿',
			"\\textquotedblleft" 	=> '“',
			"\\textquotedblright" 	=> '”',
			"\\textquoteleft" 		=> '‘',
			"\\textquoteright" 		=> '’',
			"\\textregistered" 		=> '®',
			"\\texttrademark" 		=> '™',
			"\\textunderscore" 		=> '_',
			"\\textasciitilde" 		=> '~',
			"\\textasteriskcentered"=> '∗',
			"\\textbackslash"		=> "\\",
			"\\textbar" 			=> '|',
			"\\textbraceleft" 		=> '{',
			"\\textbraceright"		=> '}',
			"\\textbullet"			=> '•',
			"\\textcopyright"		=> '©',
			"\\textdagger" 			=> '†',
			"\\textdaggerdbl" 		=> '‡',
			"\\textdollar"			=> '$',
			"\\textsterling"		=> '£',
			"\\textsection"			=> '§',
			"\\textellipsis"		=> '…',
			"\\textemdash"			=> '—',
			"\\textendash"			=> '–',
			"\\textexclamdown"		=> '¡',
			"\\textasciicircum"		=> '^',
			"\\textgreater"			=> '>',
			"\\textless" 			=> '<',
			"\\guillemotleft"		=> '«',
			"\\guillemotright"		=> '»',
			"\\guilsinglleft" 		=> '‹',
			"\\guilsinglright" 		=> '›',
			"\\quotedblbase" 		=> '„',
			"\\quotesinglbase" 		=> '‚',
			"\\textquotedbl" 		=> '"',

			# Table 6: textcomp Diacritics
			"\\textacutedbl"		=> ' ̋',
			"\\textasciiacute"		=> '´',
			"\\textasciicaron"		=> 'ˇ',
			"\\textasciidieresis" 	=> '¨',
			"\\textasciigrave"		=> '`',
			"\\textasciimacron"		=> '¯',
			"\\textgravedbl"		=> ' ̏',

			# Table 7: textcomp Currency Symbols
			"\\textcent"			=> '¢',
			"\\textcurrency"		=> '¤',
			"\\texteuro"			=> '€',
			"\\textlira"			=> '₤',
			"\\textyen"				=> '¥',

			# Table 23: Greek Letters
			"\\alpha" 				=> 'α',
			"\\beta"				=> 'β',
			"\\gamma"				=> 'γ',
			"\\delta"				=> 'δ',
			"\\epsilon"				=> 'є',
			"\\pi"					=> 'π',
			"\\omega"				=> 'ω',
			"\\Gamma"				=> 'Γ',
			"\\Delta"				=> 'Δ',
			"\Omega"				=> 'Ω',

			# Table 31: textcomp Text-mode Science and Engineering Symbols
			"\\textcelsius"			=> '℃',
			"\\textohm"				=> 'Ω',
			"\\textmu" 				=> 'µ',
			"\\textmho"				=> '℧',

			# Table 33: Miscellaneous LaTeX2e Math Symbols
			"\\infty" 				=> '∞',
			"\\sharp" 				=> '♯',
			"\\backslash"			=> '\\',			

			"\~{n}" => 'ñ',		#	\~{n}	ñ	eñe
			"\~{N}" => 'Ñ',		#	\~{n}	Ñ	eñe

			'\"{a}' => 'ä',		#	\"{o}	ö	umlaut, trema or dieresis
			'\"{e}' => 'ë',		#	\"{o}	ö	umlaut, trema or dieresis
			'\"{i}' => 'ï',		#	\"{o}	ö	umlaut, trema or dieresis
			'\"{o}' => 'ö',		#	\"{o}	ö	umlaut, trema or dieresis
			'\"{u}'	=> 'ü',

			'\"{A}' => 'Ä',		#	\"{O}	Ö	UMLAUT, TREMA OR DIERESIS
			'\"{E}' => 'Ë',		#	\"{O}	Ö	UMLAUT, TREMA OR DIERESIS
			'\"{I}' => 'Ï',		#	\"{O}	Ö	UMLAUT, TREMA OR DIERESIS
			'\"{O}' => 'Ö',		#	\"{O}	Ö	UMLAUT, TREMA OR DIERESIS
			'\"{U}'	=> 'Ü',

			"\^{o}" => 'ô',		#	\^{o}	ô	circumflex
			
			"\H{o}" => 'ő',		# 	\H{o}	ő	long Hungarian umlaut (double acute)
			"\~{o}" => 'õ',		# 	\~{o}	õ	tilde
			"\c{c}" => 'ç',		# 	\c{c}	ç	cedilla
			"\c{C}" => 'Ç',		# 	\C{C}	Ç	CEDILLA
			"\k{a}" => 'ą',		#	\k{a}	ą	ogonek
			"\l{}"  => 'ł',		# 	\l{}	ł	barred l (l with stroke)
			"\={o}" => 'ō',		# 	\={o}	ō	macron accent (a bar over the letter)
			"\b{o}" => 'o',		#	\b{o}	o	bar under the letter
			"\.{o}" => 'ȯ',		# 	\.{o}	ȯ	dot over the letter
			"\d{u}" => 'ụ', 	#	\d{u}	ụ	dot under the letter
			"\r{a}" => 'å',		# 	\r{a}	å	ring over the letter (for å there is also the special command \aa)
			"\\u{o}"=> 'ŏ',		# 	\u{o}	ŏ	breve over the letter
			"\v{s}" => 'š',		# 	\v{s}	š	caron/háček ("v") over the letter
			"\t{oo}"=> 'o͡o',	# 	\t{oo}	o͡o	"tie" (inverted u) over the two letters
			"\o" 	=> 'ø',		# 	\o		ø	slashed o (o with stroke)

			#'_'	=> '_',		# added by mendeley in some paths ( from {_} to _ )
			);
		
		#$string = stripslashes($string);
		#$string = htmlspecialchars($string);
		#dump($string, ' string ++ '.to_string());
		foreach ($ar_map as $key => $value) {
			#dump($key, ' key ++ '.to_string($value));
			$string = str_replace('{'.$key.'}', $value, $string);
		}


		# LITHERALS
		$ar_litherals = array(
			"$\backslash$"	=> '',			
			);
		foreach ($ar_litherals as $lkey => $value) {
			$string = str_replace($lkey, $value, $string);
		}

		return $string;

	}#end latex_decode


}
?>
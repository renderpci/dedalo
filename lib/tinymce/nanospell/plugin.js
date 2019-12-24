/*
 *  # NanoSpell Spellchecking Plugin for TinyMCE #
 *
 *  (C) Copyright TinyMCESpellCheck.com (all rights reserverd)
 *  License:  http://www.tinymcespellcheck.com/license
 *
 */
/* 
 *	# Resources #
 *
 *	Getting Started - http://tinymcespellcheck.com/
 *	Installation - http://tinymcespellcheck.com/installation
 *	Settings - http://tinymcespellcheck.com/settings
 *	Dictionaries - http://tinymcespellcheck.com/dictionaries
 *
 *
 *
 * # Usage #
 *
 *   tinymce.init({
 *		selector: 'textarea',
 *		external_plugins: {"nanospell": "/path/to/nanospell/plugin.js"},
 *		nanospell_server: 'php', // choose "php" "asp" "asp.net"
 *		nanospell_dictionary: 'en', // download 23 more at http://tinymcespellcheck.com/dictionaries
 *		nanospell_ignore_words_with_numerals: true,
 *		nanospell_autostart: true,
 *		nanospell_ignore_block_caps: false,
 *		nanospell_compact_menu: false,
 *		toolbar: 'nanospell'
 *	});
 *
 *
 */
/*
 * A huge thanks To Moxiecode Systems AB For releasing and maintaining a world class javascript HTML Editor.
 * Without TinyMCE this project would be pointless.
 */
(function(exports, undefined) {
	"use strict";
	//#  SECTION TINYMCE INTEGRATION  #//
	var PluginManager = exports.tinymce.PluginManager;
	var Tools = exports.tinymce.util.Tools;
	var Menu = exports.tinymce.ui.Menu;
	var DOMUtils = exports.tinymce.dom.DOMUtils;
	var JSONRequest = exports.tinymce.util.JSONRequest;
	function nanospellbase() {
		/*verbose but aparently nessicary method to extract this plugin's diretory url before instantiation*/
		var scripts = document.getElementsByTagName('script');
		for (var i = scripts.length - 1; i > -1; i--) {
			var src = scripts[i].src;
			if (src.toLowerCase().indexOf('nanospell/plugin.js') != -1) {
				return src.substring(0, src.lastIndexOf('/'));
			}
		}
		for (var i = scripts.length - 1; i > -1; i--) {
			var src = scripts[i].src;
			if (src.toLowerCase().indexOf('/plugin.js') != -1) {
				return src.substring(0, src.lastIndexOf('/'));
			}
		}
	}
	tinymce.PluginManager.load('spellcontextmenu', nanospellbase() + "/os/contextmenu.js");
	PluginManager.add('nanospell', function(editor, url) {
		var spellcache = [];
		var suggestionscache = [];
		var ignorecache = [];
		var started = false
		var suggestionsMenu = null;
		var spell_delay = 500;
		var spell_fast_after_spacebar = true;
		var spell_ticker = null;
		var maxRequest = 200;
		//#  SECTION  MAIN   #//
		function start() {
			started = true;
			appendCustomStyles()
			var words = getWords(maxRequest);
			if (words.length == 0) {
				render();
			} else {
				defaultTinyMceSpellAJAXRequest("spellcheck", words, render, words.length >= maxRequest);
			}
		}
		function render() {
			if(!editor.selection.isCollapsed()){
				return;
			}
			putCursor();
			var IEcaret = getCaretIE()
			clearAllSpellCheckingSpans(editor.getBody());
			normalizeTextNodes(editor.getBody())
			var caret = getCaret();
			MarkAllTypos(editor.getBody())
			setCaret(caret);
			setCaretIE(IEcaret)
			editor.fire('SpellcheckStart');
			editor.nanospellstarted = true;
		}
		function cleanQuotes(word) {
			 return word.replace(/[\u2018\u2019]/g, "'");
		}
		function getWords(max) {
			var fullTextContext = "";
			var allTextNodes = FindTextNodes(editor.getBody())
			for (var i = 0; i < allTextNodes.length; i++) {
				fullTextContext += allTextNodes[i].data
				if (allTextNodes[i].parentNode && allTextNodes[i].parentNode.className && allTextNodes[i].parentNode.className==("nanospell-typo") ) {
					fullTextContext += "";
				} else {
					fullTextContext += " ";
				}
			}
			var matches = fullTextContext.match(wordTokenizer())
			var uniqueWords = [];
			var words = [];
			if(!matches){return words;}
			for (var i = 0; i < matches.length; i++) {
				var word = cleanQuotes(matches[i]);
				if (!uniqueWords[word] && validWordToken(word) && (typeof(spellcache[word]) === 'undefined')) {
					words.push(word);
					uniqueWords[word] = true;
					if (words.length >= max) {
						return words;
					}
				}
			}
			return words;
		}
		function finish() {
			started = false;
			clearAllSpellCheckingSpans(editor.getBody());
			editorHasFocus = false;
			editor.nanospellstarted = false;
			editor.fire('SpellcheckEnd');
		}
		//# SECTION MARKUP #//
		function MarkAllTypos(body) {
			var allTextNodes = FindTextNodes(body)
			for (var i = 0; i < allTextNodes.length; i++) {
				MarkTypos(allTextNodes[i]);
			}
		}
		function MarkTypos(textNode) {
			var regex = wordTokenizer();
			"".match(regex); /*the magic reset button*/
			var currentNode = textNode
			var match
			var caretpos = -1
			var newNodes = [textNode];
			while ((match = regex.exec(currentNode.data)) != null) {
				var matchtext = match[0];
				if (!validWordToken(matchtext)) {
					continue;
				}
				if (typeof(suggestionscache[cleanQuotes(matchtext)]) !== 'object') {
					continue;
				}
				var pos = match.index
				var matchlength = matchtext.length
				var matchlength = matchtext.length
				var newNode = currentNode.splitText(pos)
				var span = editor.getDoc().createElement('span');
				span.className = "nanospell-typo";
				span.setAttribute('data-mce-bogus',1);
				
				var middle = editor.getDoc().createTextNode(matchtext);
				span.appendChild(middle);
				currentNode.parentNode.insertBefore(span, newNode);
				newNode.data = newNode.data.substr(matchlength)
				currentNode = newNode;
				newNodes.push(middle)
				newNodes.push(newNode)
				"".match(regex); /*the magic reset button*/
			}
		}
		//#  SECTION MENU   #//
		function generateMemuItem(suggestion) {
			return {
				text: suggestion,
				disabled: false,
				onclick: function() {
					placeSuggestion(suggestion)
				}
			}
		}
		function getMenuItemsArray(target, word) {
			var items = [];
			var suggestions = getSuggestions(word);
			if (!suggestions) {
				suggestions = [];
			}
			for (var i = 0; i < suggestions.length; i++) {
				var suggestion = suggestions[i] + "";
				if (suggestion.replace(/^\s+|\s+$/g, '').length < 1) {
					continue;
				}
				items.push(generateMemuItem(suggestion));
			}
			if (!items.length) {
				items.push({
					text: "(No Spelling Suggestions)",
					disabled: true
				});
			}
			if (suggestions && suggestions.length == 2 && suggestions[0].indexOf(String.fromCharCode(160)) > -1) { /**/ } else {
				items.push({
					text: '-'
				});
				items.push({
					text: 'Ignore',
					onclick: function() {
						ignoreWord(target, word, true);
					}
				})
				items.push({
					text: 'Add to personal dictionary',
					onclick: function() {
						addPersonal(word);
						ignoreWord(target, word, true);
					}
				})
			}
			return items;
		}
		function showSuggestionsMenu(e, target, word) {
			var items = getMenuItemsArray(target, word);
			if (editor.plugins.contextmenu) {
				editor.rendercontextmenu(e, items)
				return;
			}
			suggestionsMenu = new Menu({
				items: items,
				context: 'contextmenu',
				onautohide: function(e) {
					if (e.target.className !== 'nanospell-typo') {
						e.preventDefault();
					}
				},
				onhide: function() {
					suggestionsMenu.remove();
					suggestionsMenu = null;
				}
			});
			suggestionsMenu.renderTo(document.body);
			var pos = DOMUtils.DOM.getPos(editor.getContentAreaContainer());
			var targetPos = editor.dom.getPos(target);
			var doc = editor.getDoc().documentElement;
			if (editor.inline) {
				pos.x += targetPos.x;
				pos.y += targetPos.y;
			} else {
				var scroll_left = (editor.getWin().pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0);
				var scroll_top = (editor.getWin().pageYOffset || doc.scrollTop) - (doc.clientTop || 0);
				pos.x += targetPos.x - scroll_left;
				pos.y += targetPos.y - scroll_top;
			}
			suggestionsMenu.moveTo(pos.x, pos.y + target.offsetHeight);
		}
		function getSuggestions(word) {
			word = cleanQuotes(word)
			if (suggestionscache[word] && suggestionscache[word][0]) {
				if (suggestionscache[word][0].indexOf("*") == 0) {
					return Array("nanospell\xA0plugin\xA0developer\xA0trial ", "tinymcespellcheck.com/license\xA0")
				}
			}
			return suggestionscache[word];
		}
		//#  SECTION CURSOR  #//
		function setCaretIE(pos) {
			if (editor.getWin().getSelection || pos.x === 0 || pos.y === 0 /*thanks Nathan*/) {
				return null;
			}
			var doc = editor.getDoc();
			var clickx, clicky
				clickx = pos.x;
			clicky = pos.y;
			var cursorPos = doc.body.createTextRange();
			cursorPos.moveToPoint(clickx, clicky)
			cursorPos.select();
			
			if(cursorPos.getBoundingClientRect().top !== clicky && cursorPos.getBoundingClientRect().clickx !== clicky){
				//IE8 selecing a br moved down 1 line
				cursorPos.move('character',-1);
				cursorPos.select();
			}
			
		}
		function getCaretIE() {
			if (editor.getWin().getSelection) {
				return null;
			}
			var doc = editor.getDoc();
			var clickx, clicky
			var cursorPos = doc.selection.createRange().duplicate();
			clickx = cursorPos.boundingLeft;
			clicky = cursorPos.boundingTop;
			var pos = {
				x: clickx,
				y: clicky
			};
			return pos;
		}
		function getCaret() {
			if (!editor.getWin().getSelection) {
				return null
			}
			if (!editorHasFocus) {
				return;
			}
			var allTextNodes = FindTextNodes(editor.getBody())
			var caretpos = null
			var caretnode = null
			for (var i = 0; i < allTextNodes.length; i++) {
				if (allTextNodes[i].data.indexOf(caret_marker) > -1) {
					caretnode = allTextNodes[i]
					caretpos = allTextNodes[i].data.indexOf(caret_marker);
					allTextNodes[i].data = allTextNodes[i].data.replace(caret_marker, "")
					return {
						node: caretnode,
						offset: caretpos
					}
				}
			}
		}
		function setCaret(bookmark) {
			if (!editor.getWin().getSelection) {
				return null
			}
			if (!editorHasFocus) {
				return;
			}
			if (!bookmark) {
				return;
			}
			var nodeIndex = null;
			var allTextNodes = FindTextNodes(editor.getBody())
			var caretnode = bookmark.node
			var caretpos = bookmark.offset
			for (var i = 0; i < allTextNodes.length; i++) {
				if (allTextNodes[i] == caretnode) {
					var nodeIndex = i;
				}
			}
			if (nodeIndex === null) {
				return;
			}
			for (var i = nodeIndex; i < allTextNodes.length - 1; i++) {
				if (caretpos <= allTextNodes[i].data.length) {
					break;
				}
				caretpos -= allTextNodes[i].data.length
				caretnode = allTextNodes[i + 1]
			}
			var textNode = caretnode
			var sel = editor.getWin().getSelection();
			if (sel.getRangeAt && sel.rangeCount) {
				var range = sel.getRangeAt(0);
				range.collapse(true);
				range.setStart(textNode, caretpos);
				range.setEnd(textNode, caretpos);
				sel.removeAllRanges();
				sel.addRange(range);
			}
		}
		var caret_marker = String.fromCharCode(8) + String.fromCharCode(127) + String.fromCharCode(1) 
			function putCursor() {
				if (!editor.getWin().getSelection) {
					return null /*IE <=8*/
				}
				if (!editorHasFocus) {
					return;
				}
				var sel = editor.getWin().getSelection();
				var range = sel.getRangeAt(0);
				range.deleteContents();
				range.insertNode(editor.getDoc().createTextNode(caret_marker));
			}
			function validWordToken(word) {
				if (!word) {
					return false;
				}
				if (/\s/.test(word)) {
					return false;
				}
				if (/[\:\.\@\/\\]/.test(word)) {
					return false;
				}
				if (/^\d+$/.test(word) || word.length == 1) {
					return false;
				}
				var ingnoreAllCaps = (editor.settings.nanospell_ignore_block_caps === true);
				var ignoreNumeric = (editor.settings.nanospell_ignore_words_with_numerals !== false);
				if (ingnoreAllCaps && word.toUpperCase() == word) {
					return false;
				}
				if (ignoreNumeric && /\d/.test(word)) {
					return false;
				}
				if (ignorecache[word.toLowerCase()]) {
					return false;
				}
				if (hasPersonal(word)) {
					return false
				}
				return true;
			}
			function appendCustomStyles() {
				if (!editor.getDoc().getElementById('nanospell_theme')) {
					var head = editor.getDoc().getElementsByTagName("head")[0];
					var element = editor.getDoc().createElement("link");
					element.setAttribute("rel", "stylesheet");
					element.setAttribute("type", "text/css");
					element.setAttribute("href", url + "/theme/nanospell.css");
					element.setAttribute("id", 'nanospell_theme');
					head.insertBefore(element, head.firstChild);
				}
			}
			//#  SECTION AJAX  #//
			function resolveAjaxHandler() {
				var svr = editor.settings.nanospell_server;
				if (typeof(svr) == "undefined") {
					svr = "php"
				}
				svr = svr.toLowerCase();
				switch (svr) {
					case ".net":
						return url + "/server/ajax/asp.net/tinyspell.aspx"
						break;
					case "asp.net":
						return url + "/server/ajax/asp.net/tinyspell.aspx"
						break;
					case "net":
						return url + "/server/ajax/asp.net/tinyspell.aspx"
						break;
					case "asp":
						return url + "/server/ajax/asp/tinyspell.asp"
						break;
					default:
						/*php*/
						return url + "/server/ajax/php/tinyspell.php"
						break
				}
			}
			function defaultTinyMceSpellAJAXRequest(method, words, render, daisychain) {
				JSONRequest.sendRPC({
					url: resolveAjaxHandler(),
					method: method,
					params: {
						lang: editor.settings.nanospell_dictionary || "en",
						words: words
					},
					success: function(result) {
						for (var i in words) {
							var word = words[i];
							if (result[word]) {
								suggestionscache[word] = result[word];
								spellcache[word] = false;
							} else {
								spellcache[word] = true;
							}
						}
						render();
						if (daisychain) {
							checkNow();
						}
					},
					error: function(error, xhr) {
						if (editor.settings.nanospell_debug !== true) {
							return;
						}
						if (!window.console) {
							return
						}
						var svr = editor.settings.nanospell_server;
						if (typeof(svr) == "undefined") {
							svr = "php"
						}
						var error = "The Nanospell spellchecker plugin for TinyMCE enountered a server error with '" + svr.toUpperCase() + "'.  For help diagnosing and solving the issue you can go to:\n\n" + url + "/getstarted.html"
						window.console.log(error);
					}
				});
			}
			//#  SECTION UTIL  #//
			function isCDATA(elem){
				var n = elem.nodeName.toLowerCase();
				if(n=="script"){return true;}
				if(n=="style"){return true;}
				if(n=="textarea"){return true;}
				return false;
			}
			
			function FindTextNodes(elem) {
				// recursive but asynchronous so it can not choke
				
				var textNodes = [];
				FindTextNodes_r(elem)
				function FindTextNodes_r(elem) {
					for (var i = 0; i < elem.childNodes.length; i++) {
						var child = elem.childNodes[i];
						if (child.nodeType == 3) {
							textNodes.push(child)
						} else if ( !isCDATA(child) && child.childNodes) {
							FindTextNodes_r(child);
						}
					}
				}
				return textNodes;
			}
		var __memtok = null;
		var __memtoks = null;
		function wordTokenizer(singleton) {
			if (!singleton && !! __memtok) {
				return __memtok
			};
			if (singleton && !! __memtoks) {
				return __memtoks
			};
			var email = "\\b[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,4}\\b"
			var protocol = "\\bhttp[s]?://[a-z0-9#\\._/]{5,}\\b"
			var domain = "\\bwww\.[a-z0-9#\._/]{8,128}[a-z0-9/]\\b"
			var invalidchar = "\\s!\"#$%&()*+,-.â€¦/:;<=>?@[\\]^_{|}`\u00a7\u00a9\u00ab\u00ae\u00b1\u00b6\u00b7\u00b8\u00bb\u00bc\u00bd\u00be\u00bf\u00d7\u00f7\u00a4\u201d\u201c\u201e\u201f"+String.fromCharCode(160)
			var validword = "[^"+invalidchar+"'\u2018\u2019][^"+invalidchar+"]+[^"+invalidchar+"'\u2018\u2019]";
			var result = editor.getParam('spellchecker_wordchar_pattern') || new RegExp("(" + email + ")|(" + protocol + ")|(" + domain + ")|("+validword+")", singleton ? "" : "g");
			if (singleton) {
				__memtoks = result
			} else {
				__memtok = result
			}
			return result;
		}
		function isIE() {
			/*Why can Microsoft just use a stable javascript engine like V8*/
			var au = navigator.userAgent.toLowerCase();
			var found = (au.indexOf("msie") > -1 || au.indexOf("trident") > -1 || au.indexOf(".net clr") > -1)
			return found;
		}
		function unwrap(node) {
			var text = node.innerText || node.textContent;
			if (isIE()) {
				text = text.replace(/  /g, " " + String.fromCharCode(160));
			}
			var content = editor.getDoc().createTextNode(text);
			node.parentNode.insertBefore(content, node);
			node.parentNode.removeChild(node);
		}
		function placeSuggestion(suggestion) {
			if (suggestion.indexOf(String.fromCharCode(160)) > -1) {
				return window.open('http://www.tinymcespellcheck.com/license');
			}
			editor.insertContent(suggestion);
		}
		function ignoreWord(target, word, all) {
			if (all) {
				ignorecache[word.toLowerCase()] == true;
				for (var i in suggestionscache) {
					if (i.toLowerCase() == word.toLowerCase()) {
						delete suggestionscache[i];
					}
				}
				Tools.each(editor.dom.select('span.nanospell-typo'), function(item) {
					var text = item.innerText || item.textContent;
					if (text == word) {
						unwrap(item);
					}
				});
			} else {
				unwrap(target);
			}
		}
		function clearAllSpellCheckingSpans(base) {
			var i, node, nodes;
			var finished = false;
			while (!finished) {
				finished = true;
				nodes = editor.getDoc().getElementsByTagName("span")
				var i = nodes.length;
				while (i--) {
					node = nodes[i];
					if (node.className == ('nanospell-typo') || node.className == ('nanospell-typo-disabled')) {
						unwrapbogus(node);
						finished = false;
					}
				}
			}
		}
		function unwrapbogus(node) {
			node.outerHTML = node.innerHTML;
		}
		function checkNow() {
			if (editor.selection.isCollapsed() && started) {
				start();
			}
		}
		function normalizeTextNodes(elem) {
			if (!isIE()) {
				elem.normalize();
				return;
			}
			/*IE normalize function is not stable, even in IE 11*/
			var child = elem.firstChild,
				nextChild;
			while (child) {
				if (child.nodeType == 3) {
					while ((nextChild = child.nextSibling) && nextChild.nodeType == 3) {
						child.appendData(nextChild.data);
						elem.removeChild(nextChild);
					}
				} else {
					normalizeTextNodes(child);
				}
				child = child.nextSibling;
			}
		}
		//#  SECTION LOCAL STORAGE  #//
		function addPersonal(word) {
			var value = tinymce.util.LocalStorage.getItem('mce_spellchecker_personal');
			if (value !== null && value !== "") {
				value += String.fromCharCode(127);
			} else {
				value = "";
			}
			value += word.toLowerCase();
			tinymce.util.LocalStorage.setItem('mce_spellchecker_personal', value);
		}
		function hasPersonal(word) {
			var value = tinymce.util.LocalStorage.getItem('mce_spellchecker_personal');
			if (value === null || value == "") {
				return false;
			}
			var records = value.split(String.fromCharCode(127));
			word = word.toLowerCase();
			for (var i = 0; i < records.length; i++) {
				if (records[i] === word) {
					return true;
				}
			}
			return false;
		}
		function toggleActive() {
			if (!started) {
				start()
			} else {
				finish()
			}
		}
		//#  SECTION EVENTS  #//
		var editorHasFocus = false;
		editor.on('focus', function(e) {
			editorHasFocus = true;
		})
		var addEventHandler = function(elem, eventType, handler) {
			if (elem.addEventListener) elem.addEventListener(eventType, handler, false);
			else if (elem.attachEvent) elem.attachEvent('on' + eventType, handler);
		}
		var handleBlur = function() {
			editorHasFocus = false;
			if (suggestionsMenu) {
				suggestionsMenu.remove();
			}
		}
		addEventHandler(document.body, 'click', handleBlur)
		editor.on('blur', handleBlur)
		editor.on('contextmenu', function(e) {
			if (e.target.className == "nanospell-typo") {
				e.preventDefault();
				e.stopPropagation();
				var rng = editor.dom.createRng();
				rng.setStart(e.target.firstChild, 0);
				rng.setEnd(e.target.lastChild, e.target.lastChild.length);
				editor.selection.setRng(rng);
				showSuggestionsMenu(e, e.target, rng.toString());
			} else {
				if (editor.rendercontextmenu) {
					editor.rendercontextmenu(e, false)
				}
			}
		});
		started = editor.settings.nanospell_autostart == true || typeof(editor.settings.nanospell_autostart) == "undefined";
		if (started) {
			editor.on('init', function(e) {
				checkNow();
			});
		}
		function triggerSpelling(immediate) {
			//only reckeck when the user pauses typing
			clearTimeout(spell_ticker);
			if (editor.selection.isCollapsed()) {
				spell_ticker = setTimeout(checkNow, immediate ? 50 : spell_delay);
			}
		}
		editor.on('paste', function(e) {
			setTimeout(triggerSpelling, 100)
		})
		editor.on('keydown keypress', function(e) {
			editorHasFocus = true;
			//recheck after typing activity
			var target = editor.selection.getNode();
			//ignore navigation keys
			var ch8r = e.keyCode;
			if (ch8r >= 16 && ch8r <= 31) {
				return;
			}
			if (ch8r >= 37 && ch8r <= 40) {
				return;
			}
			//if user is typing on a typo remove its underline
			if (target.className == "nanospell-typo") {
				target.className = 'nanospell-typo-disabled';
			}
			triggerSpelling((spell_fast_after_spacebar && (ch8r === 32 || ch8r === 10 || ch8r===13) ))
		});
		editor.addMenuItem('nanospell', {
			text: 'Spellcheck As You Type',
			context: 'tools',
			onclick: toggleActive,
			selectable: true,
			active: started,
			onPostRender: function() {
				var self = this;
				editor.on('SpellcheckStart SpellcheckEnd', function() {
					self.active(started);
				});
			}
		});
		editor.addButton('nanospell', {
			tooltip: 'Spellcheck As You Type',
			onclick: toggleActive,
			active: started,
			icon: 'spellchecker',
			onPostRender: function() {
				var self = this;
				editor.on('SpellcheckStart SpellcheckEnd', function() {
					self.active(started);
				});
			}
		});
		editor.on('remove', function() {
			if (suggestionsMenu) {
				suggestionsMenu.remove();
				suggestionsMenu = null;
			}
		});
	});
})(this);

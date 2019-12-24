/**
 * TinyMCE 4 context menu plugin
 *
 * Copyright, Moxiecode Systems AB
 * Released under LGPL License.
 *
 * License: http://www.tinymce.com/license
 *
 */
/**
 * Modified to allow spellchecking plugins to interact with the context menu directly
 * TinyMCESpellCheck Feb 2014
 */
tinymce.PluginManager.add('contextmenu', function(editor) {
	var menu, contextmenuNeverUseNative = editor.settings.contextmenu_never_use_native;
	
	editor.rendercontextmenu = function(e, spelling_options) {
		if (editor.nanospellstarted && spelling_options === null) {
			return;
		}
		var contextmenu;
		// Block TinyMCE menu on ctrlKey
		if (e.ctrlKey && !contextmenuNeverUseNative) {
			return;
		}
		e.preventDefault();
		contextmenu = editor.settings.contextmenu || 'link image inserttable | cell row column deletetable';
		if (menu) {
			menu.remove();
			menu = null;
		}
		var items = [];
		
		if (spelling_options) {
			if( editor.settings.nanospell_compact_menu ){
				items.push({
					text: 'Spell Checking',
					icon: 'spellchecker',
					menu: spelling_options
				});
			}else{
			for (var i = 0; i < spelling_options.length; i++) {
				spelling_options[i].icon = 'spellchecker';
				items.push(spelling_options[i]);
			}
			items.push({
				text: '|'
			});
			}
		}
		tinymce.each(contextmenu.split(/[ ,]/), function(name) {
			var item = editor.menuItems[name];
			if (name == '|') {
				item = {
					text: name
				};
			}
			if (item) {
				item.shortcut = ''; // Hide shortcuts
				items.push(item);
			}
		});
		for (var i = 0; i < items.length; i++) {
			if (items[i].text == '|') {
				if (i === 0 || i == items.length - 1) {
					items.splice(i, 1);
				}
			}
		}
		menu = new tinymce.ui.Menu({
			items: items,
			context: 'contextmenu'
		});
		// allow css to target this special menu
		menu.addClass('contextmenu');
		menu.renderTo(document.body);
		editor.on('remove', function() {
			menu.remove();
			menu = null;
		});
		// Position menu
		var pos = {
			x: e.pageX,
			y: e.pageY
		};
		if (!editor.inline) {
			pos = tinymce.DOM.getPos(editor.getContentAreaContainer());
			pos.x += e.clientX;
			pos.y += e.clientY;
		}
		menu.moveTo(pos.x, pos.y);
		editor.contextmenu = menu;
	}
	editor.on('contextmenu', editor.rendercontextmenu);
});

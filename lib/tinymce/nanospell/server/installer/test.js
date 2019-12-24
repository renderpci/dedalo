var capabilities = [];
var models = [];

function render() {
 
	document.getElementById('installer-results').style.display = 'none';
	document.getElementById('runbtn').style.display = 'none';
	document.getElementById('results-meta').style.display = 'block';
	if(capabilities['online']) {
		document.getElementById("warn_internet").style.display = 'none';
	} else {
		document.getElementById("warn_internet").style.display = 'block'
		return;
	}
	if(capabilities['onserver']) {
		$("#warn_protocol").hide();
	} else {
		$("#warn_protocol").show();
		return;
	}
	document.getElementById('installer-results').style.display = 'block';
	// # PHP # //
	var php_all = true;
	var php_output = "<h4>Test Results for PHP</h4>";
	if(capabilities['php']) {
		php_output += '<p>PHP Available: Yes <i class="glyphicon glyphicon-ok" style="color:green"></i></p>';
	} else {
		php_output += '<p>PHP Available: No <i class="glyphicon glyphicon-warning-sign" style="color:red"></i></p>';
		php_output += '<div class="alert alert-danger" >PHP is not installed on your server.  We suggest choosing another server language, or installing PHP Version 5 or above.</div>';
		php_all = false
	}
	if(php_all) {
		if(capabilities['phpver'] >= "5") {
			php_output += '<p>PHP Version: ' + capabilities['phpver'] + ' <i class="glyphicon glyphicon-ok" style="color:green"></i> running on ' + capabilities['server'] + ' </p>';
		} else {
			php_output += '<p>PHP Version: ' + capabilities['phpver'] + ' <i class="glyphicon glyphicon-warning-sign" style="color:red"></i></p>';
			php_output += '<div class="alert alert-danger" >This software required PHP version 5 or above.</div>';
			php_all = false
		}
	}
	if(php_all) {
		if(capabilities['read_php']) {
			php_output += '<p>PHP Dictionary Read Permissions: Yes<i class="glyphicon glyphicon-ok" style="color:green"></i></p>';
		} else {
			php_output += '<p>PHP Dictionary Read Permissions: Permission Denied <i class="glyphicon glyphicon-warning-sign" style="color:red"></i></p>';
			php_output += '<div class="alert alert-danger" >Please allow the web server (or everyone) "READ" permissions to the nanospell/server/dictionaries folder and all files inside.</div>';
			php_all = false
		}
	}
	if(php_all) {
		if(capabilities['dic_php'].length) {
			php_output += '<p>NanoSpell Dictionaries Installed: Yes <i class="glyphicon glyphicon-ok" style="color:green"></i>';
			php_output += '<ul>'
			var dlist = capabilities['dic_php'].split(",");
			for(var i = 0; i < dlist.length; i++) {
				php_output += '<li>' + dlist[i] + '</li>'
			}
			php_output += '<li>  <a href="http://www.tinymcespellcheck.com/dictionaries" target="_blank"> Download More &raquo;</a></li>';
			php_output += '</ul> ';
		} else {
			php_output += '<p>NanoSpell Dictionaries Installed: None <i class="glyphicon glyphicon-warning-sign" style="color:red"></i>';
			php_output += '<div class="alert alert-danger" >This is likely to be a file permissions issue, or simply the files have not been copied to the correct directory - which is "nanospell/server/dictionaries" .  You may also want to read tinymcespellcheck.com/dictionaries </div>';
			php_all = false
		}
	}
	if(php_all) {
		$.ajax('server/ajax/php/tinyspell.php', {
			async: false,
			error: function (xhr) {
				php_output += '<div class="alert alert-danger" >PHP is reporting a server error. <a href="server/ajax/php/tinyspell.php" target="_blank">Read the full error info &raquo;</a></div>';
				php_all = false
			}
		})
	}
	$("#php_results").html(php_output);
	if(php_all) {
		$("#php_live").show();
		var path = document.location.pathname + '';
		var filename = path.substring(path.lastIndexOf('/') + 1);
		var url = path.replace(filename, "plugin.js");
		$('.dynamic_url_for_plugin').html(url);
		tinymce.init({
			selector: '#php_live textarea',
			external_plugins: {
				"nanospell": url
			}
		});
		$('#tab-php').html("<i class='glyphicon glyphicon-ok' style='color:green'></i> PHP")
	}
	// # ASP # //
	var asp_all = true;
	var asp_output = "<h4>Test Results for ASP VBScript</h4>";
	if(capabilities['asp']) {
		asp_output += '<p>ASP Available: Yes <i class="glyphicon glyphicon-ok" style="color:green"></i></p>';
	} else {
		asp_output += '<p>ASP Available: No <i class="glyphicon glyphicon-warning-sign" style="color:red"></i></p>';
		asp_output += '<div class="alert alert-danger" >ASP does not appear to be running on your server.  If you are running on Windows IIS you may need to activate ASP in IIS Manager.  </div>';
		asp_all = false
	}
	if(asp_all) {
		if(capabilities['read_asp']) {
			asp_output += '<p>ASP Dictionary Read Permissions: Yes<i class="glyphicon glyphicon-ok" style="color:green"></i></p>';
		} else {
			asp_output += '<p>ASP Dictionary Read Permissions: Permission Denied <i class="glyphicon glyphicon-warning-sign" style="color:red"></i></p>';
			asp_output += '<div class="alert alert-danger" >Please allow the web server (or "Everyone") "READ" permissions to the nanospell/server/dictionaries folder and all files inside.</div>';
			asp_all = false
		}
	}
	if(asp_all) {
		if(capabilities['dic_asp'].length) {
			asp_output += '<p>NanoSpell Dictionaries Installed: Yes <i class="glyphicon glyphicon-ok" style="color:green"></i>';
			asp_output += '<ul>'
			var dlist = capabilities['dic_asp'].split(",");
			for(var i = 0; i < dlist.length; i++) {
				asp_output += '<li>' + dlist[i] + '</li>'
			}
			asp_output += '<li>  <a href="http://www.tinymcespellcheck.com/dictionaries" target="_blank"> Download More &raquo;</a></li>';
			asp_output += '</ul> ';
		} else {
			asp_output += '<p>NanoSpell Dictionaries Installed: None <i class="glyphicon glyphicon-warning-sign" style="color:red"></i>';
			asp_output += '<div class="alert alert-danger" >This is likely to be a file permissions issue, or simply the files have not been copied to the correct directory - which is "nanospell/server/dictionaries" .  You may also want to read tinymcespellcheck.com/dictionaries </div>';
			asp_all = false
		}
	}
	if(asp_all) {
		$.ajax('server/ajax/asp/tinyspell.asp', {
			async: false,
			dataType: 'json',
			error: function (xhr, textStatus, errorThrown) {
				asp_output += '<div class="alert alert-danger" >ASP is reporting a server error. <a href="server/ajax/asp/tinyspell.asp" target="_blank">Read the full error info &raquo;</a></div>';
				asp_all = false
			}
		})
	}
	$("#asp_results").html(asp_output);
	if(asp_all) {
		$("#asp_live").show();
		var path = document.location.pathname + '';
		var filename = path.substring(path.lastIndexOf('/') + 1);
		var url = path.replace(filename, "plugin.js");
		$('.mydynamic_url_for_plugindir').html(url);
		tinymce.init({
			selector: '#asp_live textarea',
			external_plugins: {
				"nanospell": url
			},
			nanospell_server: "asp"
		});
		$('#tab-asp').html("<i class='glyphicon glyphicon-ok' style='color:green'></i> ASP")
	}
	// # ASP.Net # //
	var net_all = true;
	var net_output = "<h4>Test Results for ASP.Net </h4>";
	if(capabilities['net']) {
		net_output += '<p>ASP.Net Available: Yes <i class="glyphicon glyphicon-ok" style="color:green"></i></p>';
	} else {
		net_output += '<p>ASP.Net Available: No <i class="glyphicon glyphicon-warning-sign" style="color:red"></i></p>';
		net_output += '<div class="alert alert-danger" >ASP.Net does not appear to be running on your server.   The  Software requires ASP.Net Framework version 2 or above. </div>';
		net_output += '<div class="alert alert-danger" >If ASP.Net is runnig then try copying <b>nanospell/bin/TinyMCESpell.dll</b> to your /bin folder and re-run this test. </div>';
		
		net_all = false
	}
	if(net_all) {
		if(capabilities['dll']) {
			net_output += '<p>ASP.Net DLL: Installed<i class="glyphicon glyphicon-ok" style="color:green"></i></p>';
		} else {
			net_output += '<p>ASP.Net DLL: Not Yet Installed  <i class="glyphicon glyphicon-warning-sign" style="color:red"></i></p>';
			net_output += '<div class="alert alert-danger" >Copy <b>nanospell/bin/TinyMCESpell.dll</b> to your /bin folder and re-run this test.  The DLL requires ASP.Net Framework version 2 or above.</div>';
			net_all = false
		}
	}
	if(net_all) {
		if(capabilities['read_net']) {
			net_output += '<p>ASP.Net Dictionary Read Permissions: Yes<i class="glyphicon glyphicon-ok" style="color:green"></i></p>';
		} else {
			net_output += '<p>ASP.Net Dictionary Read Permissions: Permission Denied <i class="glyphicon glyphicon-warning-sign" style="color:red"></i></p>';
			net_output += '<div class="alert alert-danger" >Please allow the web server (or "Everyone") "READ" permissions to the nanospell/server/dictionaries folder and all files inside.</div>';
			net_all = false
		}
	}
	if(net_all) {
		if(capabilities['dic_net'].length) {
			net_output += '<p>NanoSpell Dictionaries Installed: Yes <i class="glyphicon glyphicon-ok" style="color:green"></i>';
			net_output += '<ul>'
			var dlist = capabilities['dic_net'].split(",");
			for(var i = 0; i < dlist.length; i++) {
				net_output += '<li>' + dlist[i] + '</li>'
			}
			net_output += '<li>  <a href="http://www.tinymcespellcheck.com/dictionaries" target="_blank"> Download More &raquo;</a></li>';
			net_output += '</ul> ';
		} else {
			net_output += '<p>NanoSpell Dictionaries Installed: None <i class="glyphicon glyphicon-warning-sign" style="color:red"></i>';
			net_output += '<div class="alert alert-danger" >This is likely to be a file permissions issue, or simply the files have not been copied to the correct directory - which is "nanospell/server/dictionaries" .  You may also want to read tinymcespellcheck.com/dictionaries </div>';
			net_all = false
		}
	}
	if(net_all) {
		$.ajax('server/ajax/asp.net/tinyspell.aspx', {
			async: false,
			error: function (xhr) {
				net_output += '<div class="alert alert-danger" >ASP.Net is reporting a server error. <a href="server/ajax/asp.net/tinyspell.aspx" target="_blank">Read the full error info &raquo;</a></div>';
				net_all = false
			}
		})
	}
	$("#net_results").html(net_output);
	if(net_all) {
		$("#net_live").show();
		var path = document.location.pathname + '';
		var filename = path.substring(path.lastIndexOf('/') + 1);
		var url = path.replace(filename, "plugin.js");
		$('.dynamic_url_for_plugin').html(url);
		tinymce.init({
			selector: '#net_live textarea',
			external_plugins: {
				"nanospell": url
			},
			nanospell_server: "asp.net"
		});
		$('#tab-net').html("<i class='glyphicon glyphicon-ok' style='color:green'></i> ASP.Net")
	}
	if(net_all) {
		$("#tab-net").tab('show');
	} else if(php_all) {
		$("#tab-php").tab('show');
	} else if(asp_all) {
		$("#tab-asp").tab('show');
	}
	var infocount = 0;
	infocount += net_all ? 1 : 0;
	infocount += php_all ? 1 : 0;
	infocount += asp_all ? 1 : 0;
	if(infocount) {
		var pluralizer = infocount == 1 ? "" : "s";
		var infotop = 'On your system it looks like you have ' + infocount + ' installation option' + pluralizer + ' which will work straight out of the box.  The other (unticked) installation options will need to be configured before use.'
	} else {
		var infotop = 'On your system it looks like installation will require you to choose your optimal server language and carefully follow the instructions.';
	}
	$('#infotop').html(infotop)
	$('html, body').animate({
		scrollTop: $("#results-meta").offset().top
	}, 300);
}

function runTests() {
	capabilities['onserver'] = location.href.toLowerCase().indexOf("file://") ? true : false;
	capabilities['online'] = typeof ($) !== 'undefined' ? true : false;
	capabilities['json'] = false;
	capabilities['php'] = false;
	capabilities['phpver'] = 0;
	capabilities['dic_php'] = "";
	capabilities['read_php'] = "";
	capabilities['server'] = "Unknown"; // or NIX
	capabilities['net'] = false;
	capabilities['dll'] = false;
	capabilities['dic_net'] = "";
	capabilities['read_net'] = "";
	capabilities['asp'] = false;
	capabilities['dic_asp'] = "";
	capabilities['read_asp'] = "";
	if(capabilities['onserver'] && capabilities['online']) {
		testHostSystem(["server/installer/php.php", "server/installer/asp.net.aspx", "server/installer/asp.asp", "server/installer/json.js"]);
	} else {
		render();
	}
}

function testHostSystem(capability_providers) {
	if(capability_providers.length == 0) {
		return render();
	}
	var url = capability_providers.pop();

	$.ajax(url, {
		dataType: "JSON"
	}).done(function (data) {
		 
		  $.each(data, function(k, v) {
			capabilities[k] = v;
		     
		  });
	 

	}).fail(function () {
		
	}).always(function () {
		
		return testHostSystem(capability_providers);
	});
}
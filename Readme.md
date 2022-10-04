<img src="https://dedalo.render.es/dedalo/images/logos/dedalo_logo.png" alt="Dédalo logo" />

**README**

*Dédalo*

**IMPORTANT: V6 ontology compatibility for V4 and V5**
*Starting at 21-05-2020, the ontology in V4 and V5 need to be update with a new column into the "jer_dd" table named "properties", for compatibility with the upcoming V6, this new column will not affect v4 or V5 normal function but the new exported ontologies files from master will include this column in copy files. If you don't add this column to jer_dd, Dédalo will can't import the new files and you will can lost the ontology data, although you can re-build jer_dd making the import process manually.
Read the update V5.6.0*

**ATENTION: this v6_developer branch is in beta state, don't use it in production**

Dédalo is a knowledge management system for Cultural Heritage (tangible and intangible), Natural Heritage and Oral History/Memory.

<p><a href="https://dedalo.dev" target="_blank">Official Dédalo webpage</a></p>

Dédalo is a Open Source software based in a new paradigm of programing: develop objects with a ontology model. The ontology control the app flow with the descriptors, related terms, no descriptors, TG, TE, etc. The objects are built with a MVC structure and are linked to the ontology. The database use a NoSQL model, all data is stored in JSONB (binary).

Dédalo use the structured Ontology for three things:

	1. Make the data structured. (user data is stored without fixed structure)
	2. Build the programing objects in the execution time (in real time).
	3. Interpret the code and the data and translate to multiple formats (RDF, JSON-LD, SQL, CSV, XML, Dublin Core, HTML, PDF, etc)

The ontology can be changed by the time and this will change the data and the programing code; you can develop new functionalities without change the data, and you can change the metadata without change the code or the data.

Dédalo is based in linked data model, and use a relative, multi-reference and universal locator. The locator can find:
entity, section, component, and tag. In other words, the locator can find, archives (in others entities), records, fields, and part of the fields (sub-field data).

Dédalo is a real multilingual app (Dédalo can use any language) in the interface and the managed data, has a multi-thesaurus engine and manage multiple resources and resolutions for video, image, pdf, notation scores, etc.

Dédalo has a geo-reference for the cultural properties, interviews, etc. with points, areas, paths, etc and have a indexation and related model of multiple data sources with the thesaurus.

Dédalo can handle and cut video in real time for find thematic parts of interviews or cultural goods (fragments of interviews / cultural goods), for 4k, HD 1080, 720, 404 resolutions.

**DEMO**

You can see Dédalo in action:

<p><a href="https://dedalo.render.es/" target="_blank">Dédalo demo</a></p>

Some projects using Dédalo to manage their Cultural Heritage or Oral Archive:

<p><strong>Projects: </strong>
<p><a href="http://www.occupation-memories.org/de/archive/index.html" target="_blank">Freie Universität Berlin</a></p>
<p><a href="https://monedaiberica.org" target="_blank">Moneda Ibérica catalog</a></p>
<p><a href="http://museoprehistoriavalencia.org/web_mupreva/?q=en" target="_blank">Museu de Prehistòria de València</a></p>
<p><a href="https://arxiu.memoria.gencat.cat/en/app/#/" target="_blank">Memorial Democràtic</a> (Banco audiovisual de Memoria Colectiva)</p>
<p><a href="https://www.mujerymemoria.org" target="_blank">Mujer y Memoria</a> (Woman and Memory - Mothers and daughters of the Spanish transition. An oral history project)</p>
<p><a href="http://memoriahistorica.paiporta.es" target="_blank">Arxiu de la Memòria Històrica de Paiporta</a> Delegación de Memoria Histórica de la Diputación de Valencia </p>
<p><a href="http://memoriahistorica.dival.es/recursos/archivo-memoria-historica/" target="_blank">Nuestra Memoria. Archivo de historia oral</a></p>
<p><a href="https://exhumacionestempranas.navarra.es" target="_blank"> Lur Azpian, Desobiratze Goiztiarrak Nafarroan| Bajo tierra, Exhumaciones tempranas en Navarra </a> (Underground Early exhumations in Navarra - Instituto Navarro de Memoria)</p>
<p><a href="http://www.museudelaparaula.es" target="_blank">Museu de la Paraula</a> (Archivo de la Memoria Oral Valenciana)</p>
<p><a href="http://www.museudelaparaula.es/colecciones/?lang=es" target="_blank">Collection of funds from MUVAET</a> (Museu Valencià d'Etnologia)</p>


**DEPENDENCIES**

*Required for the OS*

- PHP 8.1+
- Apache 2.4.6+
- Postgres 12.1+
- MySQL 5.6+ (NOT REQUIRED, only if you want use it for publication).

*libs required for the Dédalo*

- flatpickr 4.6.3
- geoip2 (!)
- json-view
- leaflet 1.8+
- geoman 2.13.0
- lessphp v0.4.0
- d3
- mocha 9.2.2
- chai 4.3.3
- nvd3 1.7.1
- paper 0.9.25
- pdfjs 1.1.1
- pdfkit
- tcpdf 6.2.5
- ckeditor 5+
- wexflow 1.2

Some libraries like ffmpeg or ImageMagick need to be install directly in the system (Ubuntu, Debian, MacOs X, etc)

SO libraries:
- Ffmpeg 4.0+
- Ffprobe 2.6.1+
- qtfaststart 1.0
- ImageMagick 6.9+
- Xpdf command line tools 4.00.01+
- wkhtmltopdf 0.12.1-08b0817


**INSTALLATION**

You can use our ready to use VM for develop (only V5 available):
<p><a href="https://dedalo.dev/v5" target="_blank">Dedalo V5</a></p>

Or follow the install video (video show all install process of v5, that is similar for v6):
<p><a href="https://dedalo.dev/v5_install" target="_blank">Dedalo V5 install video on CentOS</a></p>

Or do it manually (provisional installation instructions for v6 beta):
1. Download Dédalo and copy to the httpdocs of web server
2. Create a DB in PostgreSQL and name it to: dedalo_xx (you can change the xx with own name).
3. Rename the /dedalo/config/sample.config.php to /dedalo/config/config.php.
4. Change the /dedalo/config/config.php to with your project needs.
5. Rename the /dedalo/config/sample.config_db.php to /dedalo/config/config_db.php.
6. Change the /dedalo/config/config_db.php with your DB configuration.
7. Rename the /dedalo/config/sample.config_core.php to /dedalo/config/config_core.php.
8. Rename the /dedalo/config/sample.config_areas.php to /dedalo/config/config_areas.php.
9. Run Dédalo into the browser.
10. Follow the instructions.
11. When the install process will done, login and go to Development Area and register all tools.
12. Create admin user to be used in normal edition.
13. log-out and log-in with the admin user.
14. Create Users and Projects as you need.


**UPDATE**

*Please read the "Updates.md" file for specific notes, procedures, etc, of the versions.*

Dédalo have three main updates procedures:

1. Update the code files (php, js, css, html, etc)
	-  Make backup of all files.
	-  Download the new files and change the files in your server
	-  You will need see the new config files and put the changes into your own config files (/dedalo/config/config.php and /dedalo/config/config_db.php) is not possible change this files automatically because are the configuration files and it has specific pw and paths of the users. If you don't change the config files, Dédalo will require the new "define" variables and will stop the app.

2. Update the ontology structure with the sections, components, list, etc
	-  Do the first update step
	-  Log-in with any "developer" user.
	-  You will see the menu in "orange" or "red" (in red, if you have the debugger active) and a "grey" sub-menu with a "tool administrator" (or in translation version of the app language) button, press it to go to the "admin utils" page.
	-  Press the "import structure" button, if all go well you will see a "green" alert.
	-  Log-out and log-in with a normal admin user.

3. Update the data in your installation
	-  Do the first and second update steps
	-  Log-in with any "developer" user.
	-  You will see the menu in "orange" or "red" (in red, if you have the debugger active) and a "grey" sub-menu with a "tool administrator" (or in translation version of the app language) button, press it to go to the "admin utils" page.
	-  If your data version is different that the "code files" version, Dédalo will show that you need update, press the «update» link and wait for notifications.
	-  If all go well you will see a report with the changes.
	-  Reload the page 'Administration Tools'. Sometimes, if the update differs in several versions, you will need to update the data to each of the intermediate versions (v4.0.9 pass from v4.0.9 to -> v4.0.10, v4.0.10 to -> v4.0.11, etc) when the data and "code files" are in the same version, Dédalo will show that is consistent and stop the upgrade process.
	-  Log-out and log-in with normal admin user.
	-  Optional: in the inventory pages (OH, PCI, etc) press the "Update Cache" into the list of the sections for update some changes into the components (this task force to update all components with the new model no 1 to 1), and will apply the changes to the data into the databases.

**IMPORT TOPONYMY**

1. first create the toponymy into the Hierarchy menu into Thesaurus:
	-  Login in Dédalo
	-  Go to "Thesaurus -> Hierarchy" section
	-  Find the country that you want import
	-  Edit the country
	-  Change the "active" field to "Yes"
	-  Press the "Generate" button

2. Now the toponymy is ready for import the data in SQL.

 	-  Logout Dédalo
 	-  Go to: /dedalo/install/import/hierarchy
 	-  Select the hierarchies to be imported with the postgreSQL copy command, similar to:
		-  psql dedalo4_XXX -U YYY -p 5432 -h localhost -c "\copy matrix_hierarchy(section_id, section_tipo, datos) from es1.copy "

		-  XXX: the name of your installation
		-  YYY: the name of your user
	-  You can list all exported tables and change the "es1.copy" to the hierarchies that you want import
	-  When you are import the toponymy data, you will need change the counters of the tables that you were imported.
	-  Login to Dédalo with developer user
	-  Go to the "administration tool" and see the:
		-  DEDALO COUNTERS STATE
	-  You will see the diferences and Dédalo show the SQL command to apply into the postgreSQL, similar to this:
		-  UPDATE "matrix_counter" SET dato = 75845 WHERE tipo = 'es1';
	-  This command will change the counters to the new imported values in SQL
	-  Change the profiles to access users to the new hierarchy.

	Done! you new hierarchy was imported and ready to use.


**SERVER SYSTEM**

Dédalo in the server part is tested into the next Operating Systems:
- Ubuntu Server 20.04+
- Debian 9.0+
- MacOsX 11.0+
- CentOS, Fedora and RedHat situation. We are stopping Dédalo testing into RedHat/CenOS/Fedora model due CentOS project focus was changed. The main OS will be Ubuntu to test Dédalo. RedHat/CentOS/Fedora will become to the category of "all other linux that we don't test it".
<p><a href="https://blog.centos.org/2020/12/future-is-centos-stream/?utm_source=rss&utm_medium=rss&utm_campaign=future-is-centos-stream" target="_blank">CentOS blog</a></p>

All other Linux will be compatible but we don't test it.

Windows: is possible that Dédalo can run, but we NO TESTED.

**USE**

Dédalo version v6+, is only certificated and proved into the chromium or webkit browsers (Chrome, Safari, Edge (77+), ...).
Firefox situation: From the 4.8 version of Dédalo is full compatible with Firefox, and can be used in production, but we need more feedback from the users, please comment your experience.

Browser	|	Version |	certificated
--------- | --------- | ---------
Chrome	|	106+ | YES - recommended
Chrome	|	100 to 105 | Deprecated (Please update as soon as possible)
Chrome	|	0 to 100 | NO
Safari	|	16+ | YES
Safari	|	15 | Deprecated (Please update as soon as possible)
Safari	|	0 to 14 | NO
Firefox	|	105+ | YES
Firefox	|	100 to 104 | Deprecated (Please update as soon as possible)
Firefox	|	0-99 | NO
Firefox	|	0-40 | NO
EDGE	|	106+ | YES
EDGE	| 	100 to 105 | Deprecated (Please update as soon as possible)
EDGE	| 	0 to 100 | NO
IExplorer	| All 	| NO

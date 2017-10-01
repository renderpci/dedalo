<img src="http://dedalo4.antropolis.net/dedalo/images/logos/dedalo_logo.png" alt="Dédalo logo" />

**README**

*Dédalo Ver 4*

Dédalo is a knowledge management system for Cultural Heritage (tangible and intangible), Natural Heritage and Oral History/Memory. 

Dédalo is a Open Source software based in a new paradigm of programing: develop objects with a ontology model and control the app flow with the ontology descriptors, related terms, no descriptors, TG, TE, etc. The objects have a MVC structure linked to the ontology and the database is a NoSQL model. The data is stored in JSONB (binary).

Dédalo use the structure Ontology for three things:

	1. Make the data structured. (user data is stored without fixed structure)
	2. Do the programing objects in the execution time (in real time).
	3. Interpret the code and the data and translate to multiple formats (RDF, JSON-LD, SQL, CSV, XML, Dublin Core, HTML, PDF, etc)

The ontology can be changed in the time and this will change the data and the programing code; you can develop new functionalities without change the data, and you can change the metadata without change the code or the data.

Dédalo is based in linked data model, and use a relative, multireference and universal locator. THe locator can find a entity, section, component, and tag. In other words, the locator can find, archives (in others entities), records, fields, and part of the fields (sub-field data).

Dédalo is a real multilingual app (Dédalo can use any language) in the interface and the managed data, has a multi-thesaurus engine and manage multiple resources and resolutions for video, image, pdf, notation scores, etc. 

Dédalo has a geo-reference for the cultural goods, interviews, etc. with points, areas, paths, etc and have a indexation and related model of multiple data sources with the thesaurus.

Dédalo can handle and cut video in real time for find thematic parts of interviews or cultural goods (fragments of interviews / cultural goods), for 4k, HD 1080, 720, 404 resolutions.

**DEMO**

You can see Dédalo in action:

<p><a href="http://dedalo4.antropolis.net/dedalo/lib/dedalo/main/?t=oh1" target="_blank">Dédalo demo</a></p>

Some projects using Dédalo to manage their Cultural Heritage or Oral Archive:

<p><strong>Projects: </strong> 

<p><a href="http://museoprehistoriavalencia.org/web_mupreva/?q=en" target="_blank">Museu de Prehistòria de València</a></p>	
<p><a href="http://bancmemorial.gencat.cat/web/home/?&amp;lang=eng" target="_blank">Memorial Democràtic</a> (Banco audiovisual de la Memoria Colectiva)</p>
<p><a href="http://www.mujerymemoria.org" target="_blank">Mujer y Memoria</a> (Woman and Memory - Mothers and daughters of the Spanish transition. An oral history project)</p>	
<p><a href="http://memorialdemocratic.gencat.cat/ca/exposicions/expcicions_virtuals/catalunya_en_transicio/" target="_blank">
	Catalonia in transition</a> (Transition in Catalonia - Memorial Democràtic)</p>
<p><a href="http://www.museudelaparaula.es" target="_blank">Museu de la Paraula</a> (Archivo de la Memoria Oral Valenciana)</p>
<p><a href="http://www.museudelaparaula.es/colecciones/?lang=es" target="_blank">Collection of funds from MUVAET</a> (Museu Valencià d'Etnologia)</p>


**DEPENDENCES**

*Required for the OS*

- PHP 7.0+
- Apache 2.4.2+
- Postgres 9.5+
- MySQL 5.6+ (NOT REQUIRED, only if you want use it for publication)

*libs required for the Dédalo*

- Jquery 2.2.3
- bootstrap 3.1.1
- calendar 1.25
- Captionator 0.5.1
- ffmpeg 2.6.1+
- qtfaststart 1.0
- ImageMagick 6.9+
- FullCalendar v2.3.1
- geoip2
- jshash md5 v2.2
- json-logic
- SWFObject v1.5
- jwplayer 5.9.2118
- leaflet 0.8
- lessphp v0.4.0
- MediaElement 2.14.2
- nvd3 1.7.1
- NodeJS 5.10.1
- paper 0.9.25
- pdfjs 1.1.1
- pdfkit
- PdfParser (2014)
- tcpdf 6.2.5
- tinymce 4.3.10
- wexflow 1.2
- videojs 3.0r2
- wkhtmltopdf 0.12.1-08b0817


**INSTALLATION**

1. Download Dédalo and copy to the httpdocs of web server
2. Create a DB in PostgreSQL and name it to: dedalo_xx (you can change the xx with own name).
3. Restore the file /install/db/dedalo4_install.backup to the postgres created DB. 

		pg_restore /install/db/dedalo4_install.backup dedalo_xx

4. Download the dependences and libs for Dédalo and install it into the /lib/ folder. In some cases you need see the /lib/dedalo/config/sample.config4.php file in order to change or customize the installation.
5. Rename the /lib/dedalo/config/sample.config4.php to /lib/dedalo/config/config4.php.
6. Change the file /lib/dedalo/config/sample.config4_db.php with your DB configuration.
7. Rename the /lib/dedalo/config/sample.config4_db.php to /lib/dedalo/config/config4_db.php.
8. Run Dédalo into the browser. 
9. Fix your root password (you can change only once), the default account is: root (this user is a superuser and only for development or debuger the application).
10. Create one Administrator user account with all access to the system.(this user will be the administrator of the system)
11. Logout and login with the Administrator acount.
12. Create Users and Projects as you need.
Optional: Import the toponymy that you will need (Dédalo install DB will not provide specific toponymy by default anymore).

**UPDATE**

*Please read the "Updates.md" file for specific notes, procedures, etc, of the versions.*

Dédalo have three updates procedures:

1. Update the code files (php, js, css, html, etc)
	-  Make backup of all files.
	-  Download the new files and change the files in your server
	-  You will need see the new config files and put the changes into your own config files (/lib/dedalo/config4.php and /lib/dedalo/config4_db.php) is not possible change it automatically because are the configuration specific of the users. If you don't change the config files, Dédalo will require the new "define" variables and will stop the app.

2. Update the ontology structure with the sections, components, list, etc
	-  Do the first update step
	-  Log-in with any "developer" user.
	-  You will see the menu in "orange" or "red" (in red, if you have the debugger active) and a "grey" sub-menu with a "tool administrator" (or in translation version of the app language) button, press it to go to the "admin utils" page.
	-  Press the "import structure" button, if all go well you will see a "green" alert.
	-  Log-out and log-in with a normal admin user.

3. Update the data in your instalation
	-  Do the first and second update steps
	-  Log-in with any "developer" user.
	-  You will see the menu in "orange" or "red" (in red, if you have the debugger active) and a "grey" sub-menu with a "tool administrator" (or in translation version of the app language) button, press it to go to the "admin utils" page.
	-  If your data version is different that the "code files" version, Dédalo will show that you need update, press the «update» link and wait for notifications.
	-  If all go well you will see a repport with the changes.
	-  Reload the page 'Administration Tools'. Sometimes, if the update differs in several versions, you will need to update the data to each of the intermediate versions (v4.0.9 pass from v4.0.9 to -> v4.0.10, v4.0.10 to -> v4.0.11, etc) when the data and "code files" are in the same version, Dédalo will show that is consistent and stop the upgrade process.
	-  Log-out and log-in with normal admin user.
	-  Optional: in the inventory pages (OH, PCI, etc) press the "Update Cache" into the list of the sections for update some changes into the components (this task force to update all components with the new model no 1 to 1), and will apply the changes to the data into the databases.

**IMPORT TOPONYMY**

1. first create the toponymy into the Hierarchy menu into THesaurus:
	-  Login in Dédalo
	-  Go to "Thesaurus -> Hierarchy" section
	-  Find the country that you want import
	-  Edit the country
	-  Change the "active" field to "Yes"
	-  Press the "Generate" button

2. Now the toponymy is ready for import the data in SQL.

 	-  Logout Dédalo
 	-  Go to: /dedalo/install/import/hierarchy
 	-  Select the hierarchies to be imported with the postgreSQL copy comand, similar to:
		-  psql dedalo4_XXX -U YYY -p 5432 -h localhost -c "\copy matrix_hierarchy(section_id, section_tipo, datos) from es1.copy "

		-  XXX: the name of your installation
		-  YYY: the name of your user
	-  You can list all exported tables and change the "es1.copy" to the hierarchies that you want import
	-  When you are import the toponymy data, you will need change the counters of the tables that you were imported.
	-  Login to Dédalo with developer user
	-  Go to the "administation tool" and see the:
		-  DEDALO COUNTERS STATE
	-  You will see the diferences and Dédalo show the SQL command to apply into the postgreSQL, similar to this:
		-  UPDATE "matrix_counter" SET dato = 75845 WHERE tipo = 'es1'; 
	-  This command will change the counters to the new imported values in SQL
	-  Change the profiles to acces users to the new hierarchy.

	Done! you new hierarchy was imported and ready to use.


**SERVER SYSTEM**

Dédalo in the server part is tested into the next Operating Systems:
- CentOS 6.5 (deprecated update as soon as possible), 6.6, 7.1
- Red Hat Enterprise Linux 6.5 (deprecated update as soon as possible), 6.6, 7.1
- Debian 8.7
- MacOsX 10.8 (deprecated update as soon as possible), 10.9, 10.10+

All other Linux will be compatible but we don't test it.

Windows: is possible that Dédalo can run, but NO TESTED.

**USE**

Dédalo version 4, is only certificated and proved into the webkit browsers (Chrome, Safari,...). 
Firefox situation: Is possible use Firefox, but not in production, this version of Dédalo(V4.7+) is compatible, but we need feedback from the users, please comment your experience. 

Browser	|	Version |	certificated
--------- | --------- | ---------
Chrome	|	60+ | YES - recomended
Chrome	|	50+ | Deprecated (Please update as soon as posible)	 
Chrome	|	0 to 50 | NO	 
Safari	|	9+ | YES
Safari	|	7 to 8 | Deprecated (Please update as soon as posible)
Safari	|	0 to 6 | NO	
Firefox	|	49+ | The compatibility now is complete, but we need feedback to resolve issues in the diary work with Firefox (15-09-2017), please test it and comment it.
Firefox	|	40-49 | NO
Firefox	|	0-40 | NO
EDGE	| All 	| For us NO, we don't test it. But, is possible that Dédalo run fine in the last versions, because Microsoft say that EDGE is ECMA and HTML5 standards compatible. But we insist that we don't test it.
IExplorer	| All 	| NO

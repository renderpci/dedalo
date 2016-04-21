**README**

*Dédalo Ver 4*

<img src="http://dedalo4.antropolis.net/dedalo/images/logos/dedalo_logo.png" alt="Dédalo logo" />

Dédalo is a knowledge management system for Cultural Heritage (tangible and intangible), Natural Heritage and Oral History/Memory. 

Dédalo is a Open Source software based in a new paradigm of programing: develop objects with a ontology model and control the app flow with the ontology descriptors, related terms, no descriptors, TG, TE, etc. The objects have a MVC structure linked to the ontology and the database is a NoSQL model. The data is stored in JSONB (binary).

Dédalo use the structure Ontology for three things:
	1; Make the data structured. (user data is stored without fixed structure)
	2; Do the programing objects in the execution time (in real time).
	3; Interpret the code and the data and translate to multiple formats (RDF, JSON-LD, SQL, CSV, XML, Dublin Core, HTML, PDF, etc)

The ontology can be change in the time and this will change the data and the programing code; you can develop new functionalities without change the data, and you can change the metadata without change the code and the data.

Dédalo is a real multilingual app (Dédalo can use any language) in the interface and the managed data, with a multi-thesaurus and manage multiple resources and resolutions for video, image, pdf, notation scores, etc. 

Dédalo has a geo-reference for the cultural goods, interviews, etc. withh points, areas, paths, etc and have a indexation and related model of multiple data sources with the thesaurus.

Dédalo can handle and cut video in real time for find thematic parts of interviews or cultural goods (fragments of interviews / cultural goods), for 4k, HD 1080, 720, 404 resolutions.

**DEPENDENCES**

*Required for the OS*

- PHP 5.6+
- Apache 2.2.3+
- Postgres 9.4+
- MySQL 5.6+ (NOT REQUIRED, only if you want use it for publication)

*libs required for the Dédalo*

- Jquery 2.1.4
- bootstrap 3.1.1
- calendar 1.25
- Captionator 0.5.1
- ffmpeg 2.6.1
- qtfaststart 1.0
- ImageMagick 6.9+
- FullCalendar v2.3.1
- geoip
- gruntfile
- jshash md5 v2.2
- SWFObject v1.5
- jwplayer 5.9.2118
- leaflet 0.8
- lessphp v0.4.0
- MediaElement 2.14.2
- nvd3 1.7.1
- paper 0.9.20
- pdfjs 1.1.1
- pdfkit
- predis 0.8.5
- PdfParser (2014)
- tcpdf 6.2.5
- tinymce 4.1.10
- wexflow 1.2
- videojs 3.0r2
- wkhtmltopdf 0.12.1-08b0817
- Zend: Bit
-       Exception
-       Io
-       Media
-       Mime

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
9. Fix your admin password (you can change only once), the default account is: admin (this user is a root and only for development or debuger the application).
10. Create one Administrator user account with all access to the system.(this user will be the administrator of the system)
11. Logout and login with the Administrator acount.
12. Create Users and Projects as you need.

**UPDATE**

Dédalo have two updates procedures:

1. Update the code files (php, js, css, html, etc)
	a. Make backup of all files.
	b. Download the new files and change the files in your server
	c. You need see the new config files and put the changes into your own config files (/lib/dedalo/config4.php and /lib/dedalo/config4_db.php). If you don't change the config files, Dédalo will require the new "define" variables and will stop the app.

2. Update the structure with the sections, components, list, etc
	a. Do the first update step
	b. Log-in as "superuser-developer"
	c. You will see the menu in "orange" or "red" (if you have the debugger active) and a "grey" sub-menu with a "tool administrator" (or in translation of the app language) button, press the info button to go "admin utils"
	d. Press the "import structure" button, if all go well you will see a "green" alert.
	e. Log-out and log-in with normal admin user.
	f. Optional: in the inventory pages (OH, PCI, etc) press the "Update Cache" for update some changes into the components (this task force to update all components with the new model no 1 to 1), and will apply the changes to the data into the databases.

**SERVER SYSTEM**

Dédalo in the server part is tested into the next Operating Systems:
- CentOS 6.5, 6.6, 7.1
- Red Hat Enterprise Linux 6.5, 6.6, 7.1
- MacOsX 10.6, 10.7, 10.8, 10.9, 10.10

All other Linux will be compatible but we don't test it.

Windows: is possible that Dédalo can run, but NO TESTED.

**USE**

Dédalo version 4, is only certificated and proved into the webkit browsers (Chrome, Safari,...). Is possible use Firefox but no is tested and maybe Dédalo can't run fine.

*Notes of Beta 1 for MySQL:*

- If you need install the beta 1, we recomended MySQL 5.6 and PHP 5.6.

- For Intangible Heritage with the Render model (standar schema) for the IPCE you will need install Memcache or Redis.

- For the Oral History no is necessary Memcache or Redis.


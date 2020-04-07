Repository for ontology files by tlds.

**Changing the ontology** 

You have two different ways to use/change the Dédalo ontology.

1.  By my own: If you want build your own ontology you don't need add your changes here, but your changes will be incompatible with the official ontology.
2. Sharing changes: If you want to be compatible with the standard sections of the ontology, you will need to publish your changes, in this case, you can use the tld to identify the ontology terms and create the file with the tld name (like mht.sql.gz) in: /install/import/ontology/

In the second case we have two different scenarios:
- a: if the changes are in private or institution tld, your changes will be incorporated into the official ontology by the time (when the ontology file is updated).
- b: if your changes are in the standard tlds, they will need to be approved before. this is because the standard tlds are used by some institutions and projects, and you can't change them without affecting to others users.

The ontology file, with the changes of the specific tld , will include ONLY the data of specific tld of the tables:
-jer_dd (sql file without user, role or id column)
-matrix_descriptors_dd (sql file without user, role or id column)
-matrix_counter_dd (sql file without user, role or id column)

Only one tld for file is allowed. All files with more that one tld will be rejected.
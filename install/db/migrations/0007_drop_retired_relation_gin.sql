-- P2-34 / UPD-02 — drop the RETIRED relation GIN expression families.
--
-- Five families were retired 2026-07-20 as DROP-ONLY. The shipped seed still
-- creates them: 120 indexes across 24 matrix tables, measured 2026-08-31 against
-- install/db/dedalo_install.pgsql.gz.
--
-- No emitted query shape can use them any more, and every one is MAINTAINED ON
-- EVERY SAVE: +32% measured on the relation write path from one family of the
-- five. An index nothing reads is not free; it is a tax on every write, paid
-- forever, by every install that ever ran the seed.
--
-- DROP INDEX IF EXISTS, not CONCURRENTLY: migrations run inside a transaction
-- (install/db/migrate.ts -- one transaction per migration so the DDL and its
-- version record land together), and CONCURRENTLY cannot run in one. A plain
-- DROP takes a brief ACCESS EXCLUSIVE lock on the table, which is correct here
-- because migrations run AT BOOT, BEFORE the server starts serving.
--
-- The five families:
--   relation_flat_fct_st_si_gin, relation_flat_st_si_gin,
--   relation_flat_ty_st_gin, relation_flat_ty_st_si_gin, relation_locators_gin

DROP INDEX IF EXISTS matrix_activities_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_activities_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_activities_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_activities_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_activities_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_activity_diffusion_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_activity_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_activity_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_activity_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_activity_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_activity_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_dataframe_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_dataframe_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_dataframe_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_dataframe_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_dataframe_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_dd_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_dd_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_dd_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_dd_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_dd_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_hierarchy_main_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_hierarchy_main_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_hierarchy_main_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_hierarchy_main_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_hierarchy_main_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_hierarchy_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_hierarchy_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_hierarchy_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_hierarchy_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_hierarchy_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_indexations_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_indexations_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_indexations_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_indexations_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_indexations_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_langs_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_langs_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_langs_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_langs_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_langs_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_layout_dd_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_layout_dd_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_layout_dd_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_layout_dd_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_layout_dd_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_layout_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_layout_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_layout_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_layout_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_layout_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_list_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_list_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_list_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_list_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_list_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_nexus_main_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_nexus_main_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_nexus_main_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_nexus_main_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_nexus_main_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_nexus_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_nexus_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_nexus_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_nexus_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_nexus_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_notes_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_notes_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_notes_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_notes_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_notes_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_ontology_main_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_ontology_main_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_ontology_main_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_ontology_main_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_ontology_main_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_ontology_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_ontology_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_ontology_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_ontology_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_ontology_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_profiles_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_profiles_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_profiles_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_profiles_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_profiles_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_projects_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_projects_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_projects_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_projects_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_projects_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_stats_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_stats_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_stats_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_stats_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_stats_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_test_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_test_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_test_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_test_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_test_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_tools_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_tools_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_tools_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_tools_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_tools_relation_locators_gin_idx;
DROP INDEX IF EXISTS matrix_users_relation_flat_fct_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_users_relation_flat_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_users_relation_flat_ty_st_gin_idx;
DROP INDEX IF EXISTS matrix_users_relation_flat_ty_st_si_gin_idx;
DROP INDEX IF EXISTS matrix_users_relation_locators_gin_idx;

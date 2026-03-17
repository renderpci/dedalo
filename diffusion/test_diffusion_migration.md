# Test diffusion migration

## Description

This is a test and refine of diffusion migration properties and parsers.

V6 and v7 use the same MariaDB for diffusion. The goal is to migrate the diffusion definitions from v6 to v7 maintaining the same output results. To achive this goal, we need to test the migration script and refine it if necessary.

The most important aspect is to maintain the same output results. The migration script should not change the output results.
As diffusion is huge, we need to test the migration script in small chunks.

## Scope

- The scope is only to check the differences between v6 and v7.
- Don't try to fix errors or refine the migration script.
- Don't try to fix errors or refine the diffusion api.
- If a error is detected, inform it to me.
- Use the diffusion/migration/helpers folder to store the results.

## Important

- Don't try to fix errors or refine the diffusion api.
- When a error is detected, stop immediately and inform it to me. I will decide what to do.
- The v6 `propiedades` of diffusion node CAN'T be changed, so the migration script should be able to handle the data format mismatch.
- The v7 `propiedades` of diffusion node CAN be changed, so the migration script should be able to handle the data format mismatch.
- All you need is in the diffusion/migration/helpers directory. Read the scripts in /helpers directory carefully.
- Yoy are not allowed to fix any error or refine any script. Just inform the errors to me.

## Steps

1. Ask for diffusion_element_tipo, section_tipo and section_id to be tested
2. Run the migration script `migrate_diffusion_properties.php`
3. Update the ontology nodes using the api regenerate_ontologies() as tool_ontology_parser does
4. Drop MariaDB tables to start fresh
5. Run as diffusion tool performing the process in v6 (using the section_tipo and section_id) use `run_v6_diffusion.php`
6. The result into MariaDB v6 needs to be saved to a file (don't use the PHP output, use the database final result)
7. Drop MariaDB tables to start fresh
8. Run as diffusion tool performing the process in v7 (using the section_tipo and section_id) use `run_v7_diffusion.php`    
9. Check if the schema created is the same in v6 and v7
10. If the schema is different, refine the bun `diffusion_api`
11. the result into MariaDB v7 needs to be saved to a file (don't use the PHP output, use the database final result)
12. Compare the files
13. Inform the results

## Details of the new v7 diffusion

v6 and v7 has small differences and changes that are ok and is not necesary to be checked.

- id column in v6 is not present in v7
- languages column has not specific order, is not relevant the language order

## Expected results

The diffusion migration should be successful.

Create a Plan, ask me for questions.
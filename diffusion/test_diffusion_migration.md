# Test diffusion migration

## Description

This is a test and refine of diffusion migration properties and parsers.

V6 and v7 use the same MariaDB for diffusion. The goal is to migrate the diffusion definitions from v6 to v7 maintaining the same output results. To achive this goal, we need to test the migration script and refine it if necessary.

The most important aspect is to maintain the same output results. The migration script should not change the output results.
As diffusion is huge, we need to test the migration script in small chunks.

The migration script should be able to run in a loop until all the diffusion definitions are migrated, defining a scope to test.

When a data format mismatch is detected, change the properties definition of diffusion node of v7 to match the new format and update the parser in v7.

The v6 diffusion node CAN'T `propiedades` be changed, so the migration script should be able to handle the data format mismatch.

## Steps

1. Ask for section_tipo and section_id to be tested
2. Drop tables to start fresh
3. Run as diffusion tool performing the process in v6 (using the section_tipo and section_id)
4. the result into MariaDB v6 needs to be saved to a file (don't use the PHP output, use the database final result)
5. Drop tables to start fresh
6. Run as diffusion tool performing the process in v7 (using the section_tipo and section_id)
7. Check if the schema created is the same in v6 and v7
8. if the schema is different, refine the bun `diffusion_api`
9. the result into MariaDB v7 needs to be saved to a file (don't use the PHP output, use the database final result)
10. Compare the files
11. If the files are different, refine the migration script
12. Repeat until the files are the same

## Expected results

The diffusion migration should be successful.

Create a Plan, ask me for questions.
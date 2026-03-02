import { process_response } from './lib/diffusion_processor';
import { insert_table_data, close_all_pools } from './lib/db';
import { readFileSync } from 'fs';
import path from 'path';

async function run() {
    try {
        const dumpPath = path.resolve(__dirname, '../../../v7_dump.json');
        console.log("Loading dump from", dumpPath);
        const jsonStr = readFileSync(dumpPath, 'utf8');
        const php_response = JSON.parse(jsonStr);

        console.log("Parsing diffusion datum through TS runtime...");
        const tables = process_response(php_response);
        
        console.log(`Resolved target queries for ${tables.length} tables`);

        for (const table of tables) {
            console.log(`Executing UPSERT to target table "${table.table_name}"...`);
            const affected = await insert_table_data(table);
            console.log(`Inserted/Updated ${affected} rows into "${table.table_name}"`);
        }
    } catch (err) {
        console.error("Error generating or inserting MySQL data:", err);
    } finally {
        await close_all_pools();
        console.log("Process complete.");
    }
}
run();

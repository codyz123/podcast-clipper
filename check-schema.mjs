/* eslint-disable no-undef */
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

// Check projects_v2 table
const columns =
  await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'projects_v2' ORDER BY ordinal_position`;
console.log("projects_v2 table columns:");
columns.forEach((c) => console.log(`  - ${c.column_name}: ${c.data_type}`));

// Check if there's data in the old projects table
const oldData = await sql`SELECT COUNT(*) as count FROM projects`;
console.log(`\nOld 'projects' table has ${oldData[0].count} rows`);

// Check if there's data in new projects_v2
const newData = await sql`SELECT COUNT(*) as count FROM projects_v2`;
console.log(`New 'projects_v2' table has ${newData[0].count} rows`);

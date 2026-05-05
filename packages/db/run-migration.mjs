import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
console.log('Connecting to:', url.replace(/:([^:@]+)@/, ':****@'));

const sql = postgres(url, { ssl: 'require', max: 1, family: 4 });
const db = drizzle(sql);

console.log('Running migrations...');
try {
  await migrate(db, { migrationsFolder: '/Users/nm/Projects/Deepmint/packages/db/drizzle' });
  console.log('Migrations complete!');
} catch (e) {
  console.error('Migration failed:', e.message);
} finally {
  await sql.end();
}

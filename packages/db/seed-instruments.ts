import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { MAG7_INSTRUMENTS, requireSeedTarget } from "./seed/common";

/** Adds whichever Mag-7 instruments are missing, and nothing else. */
async function seedInstruments() {
  const client = postgres(requireSeedTarget());
  const db = drizzle(client, { schema });

  const inserted = await db
    .insert(schema.instruments)
    .values(MAG7_INSTRUMENTS)
    .onConflictDoNothing({ target: schema.instruments.ticker })
    .returning({ ticker: schema.instruments.ticker });

  // eslint-disable-next-line no-console
  console.log(`✓ Inserted ${inserted.length} of ${MAG7_INSTRUMENTS.length} Mag-7 instruments`);

  await client.end();
}

seedInstruments().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Seed failed:", err);
  process.exit(1);
});

import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";

/**
 * Resolve the entity that owns an agent API key (api_keys.created_by).
 * Write MCP tools (submit_claim, add_note) require a real owning entity so the
 * claim/note is attributed and scored like any other participant. Throws when
 * the key is not bound to an entity — agent keys must be minted with an owner.
 */
export async function resolveAgentEntity(
  entityId: string,
): Promise<typeof entities.$inferSelect> {
  const [row] = await db
    .select()
    .from(entities)
    .where(eq(entities.id, entityId))
    .limit(1);
  if (!row) {
    throw new Error(
      "This API key is not bound to an entity; agent write access requires an owning entity.",
    );
  }
  return row;
}

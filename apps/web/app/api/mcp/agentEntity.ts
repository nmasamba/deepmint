import { db, eq } from "@deepmint/db";
import { entities } from "@deepmint/db/schema";

/**
 * Resolve the agent an API key acts as (api_keys.entity_id). Write MCP tools
 * (submit_claim, add_note) need one, so the claim or note is attributed and
 * scored like any other participant's. The admin who minted the key
 * (api_keys.created_by) never acts through it. Throws for anything but an
 * agent's entity, and for a deleted agent, whose keys are revoked anyway.
 */
export async function resolveAgentEntity(
  entityId: string,
): Promise<typeof entities.$inferSelect> {
  const [row] = await db
    .select()
    .from(entities)
    .where(eq(entities.id, entityId))
    .limit(1);
  if (!row?.isAgent) {
    throw new Error("This API key is not bound to an agent.");
  }
  if (row.deletedAt) {
    throw new Error("This API key's agent has been deleted.");
  }
  return row;
}

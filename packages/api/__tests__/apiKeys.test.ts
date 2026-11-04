import { describe, it, expect } from "vitest";
import { db, eq } from "@deepmint/db";
import { apiKeys, entities } from "@deepmint/db/schema";
import { createCaller } from "../root";
import { createContext } from "../trpc";

const ADMIN = {
  id: "00000000-0000-4000-8000-000000000001",
} as NonNullable<Parameters<typeof createContext>[0]["entity"]>;

const admin = createCaller(
  createContext({ userId: "local-admin", entity: ADMIN, isAdmin: true }),
);

class Rollback extends Error {}

/** Each case rolls back, so it leaves no agent or key behind. */
async function rolledBack(
  run: (tx: typeof db, caller: ReturnType<typeof createCaller>) => Promise<void>,
) {
  await db
    .transaction(async (tx) => {
      const handle = tx as unknown as typeof db;
      const [minter] = await handle.select().from(entities).limit(1);
      const caller = createCaller({
        ...createContext({ userId: "local-admin", entity: minter!, isAdmin: true }),
        db: handle,
      });
      await run(handle, caller);
      throw new Rollback();
    })
    .catch((err: unknown) => {
      if (!(err instanceof Rollback)) throw err;
    });
}

describe("apiKeys.create", () => {
  it("refuses a claims:write key with no agent", async () => {
    await expect(
      admin.apiKeys.create({ name: "zz", scopes: ["claims:write"] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses both a new and an existing agent", async () => {
    await expect(
      admin.apiKeys.create({
        name: "zz",
        scopes: ["claims:write"],
        agentName: "Zz Agent",
        agentEntityId: "00000000-0000-4000-8000-000000000002",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe.skipIf(!process.env.DATABASE_URL)("apiKeys.create (local DB)", () => {
  const name = `zz Agent ${Date.now()}`;

  it("creates an agent Player and binds the key to it", async () => {
    await rolledBack(async (tx, caller) => {
      const key = await caller.apiKeys.create({
        name: "zz",
        scopes: ["claims:write"],
        agentName: name,
      });
      const [agent] = await tx
        .select()
        .from(entities)
        .where(eq(entities.id, key.entityId!));
      expect(agent).toMatchObject({
        type: "player",
        isAgent: true,
        displayName: name,
        clerkUserId: null,
      });
      const [row] = await tx.select().from(apiKeys).where(eq(apiKeys.id, key.id));
      expect(row?.entityId).toBe(agent!.id);
      expect(row?.createdBy).not.toBe(agent!.id);
    });
  });

  it("gives an agent a second key, and a second agent its own slug", async () => {
    await rolledBack(async (tx, caller) => {
      const first = await caller.apiKeys.create({
        name: "zz",
        scopes: ["claims:write"],
        agentName: name,
      });
      const second = await caller.apiKeys.create({
        name: "zz 2",
        scopes: ["claims:write"],
        agentEntityId: first.entityId!,
      });
      expect(second.entityId).toBe(first.entityId);

      const twin = await caller.apiKeys.create({
        name: "zz 3",
        scopes: ["claims:write"],
        agentName: name,
      });
      expect(twin.entityId).not.toBe(first.entityId);
      const slugs = await tx
        .select({ slug: entities.slug })
        .from(entities)
        .where(eq(entities.displayName, name));
      expect(new Set(slugs.map((s) => s.slug)).size).toBe(2);
    });
  });

  it("refuses to bind a key to an entity that is not an agent", async () => {
    await rolledBack(async (tx, caller) => {
      const [human] = await tx
        .select({ id: entities.id })
        .from(entities)
        .where(eq(entities.isAgent, false))
        .limit(1);
      await expect(
        caller.apiKeys.create({
          name: "zz",
          scopes: ["claims:write"],
          agentEntityId: human!.id,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  it("leaves a read key unbound", async () => {
    await rolledBack(async (_tx, caller) => {
      const key = await caller.apiKeys.create({ name: "zz" });
      expect(key.entityId).toBeNull();
    });
  });
});

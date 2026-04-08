import { db, eq } from "@deepmint/db";
import { notifications, notificationPreferences } from "@deepmint/db/schema";

// Maps notification type to the preference column name
const TYPE_TO_PREF: Record<string, keyof typeof notificationPreferences.$inferSelect> = {
  new_follower: "newFollower",
  outcome_matured: "outcomeMature",
  rank_change: "rankChange",
  new_claim_from_follow: "newClaimFromFollow",
  signal_trade_logged: "signalTradeLogged",
};

/**
 * Create a notification for an entity, respecting their preferences.
 * Returns the notification if created, or null if the user has disabled this type.
 */
export async function createNotification(params: {
  entityId: string;
  type: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}): Promise<typeof notifications.$inferSelect | null> {
  // Check preferences
  const prefColumn = TYPE_TO_PREF[params.type];
  if (prefColumn) {
    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.entityId, params.entityId))
      .limit(1);

    // If preferences exist and this type is disabled, skip
    if (prefs && prefs[prefColumn] === false) {
      return null;
    }
  }

  // Insert notification
  const [notification] = await db
    .insert(notifications)
    .values({
      entityId: params.entityId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      metadata: params.metadata ?? {},
    })
    .returning();

  return notification;
}

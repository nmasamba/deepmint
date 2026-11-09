import { entities } from "@deepmint/db/schema";

/**
 * The entity columns anyone may read. Public procedures and pages select
 * these instead of whole rows, so internal columns (Clerk and SnapTrade ids,
 * allowlist and soft-delete flags) never leave the server, and a column added
 * later stays private until it is listed here.
 */
export const publicEntityColumns = {
  id: entities.id,
  type: entities.type,
  displayName: entities.displayName,
  slug: entities.slug,
  bio: entities.bio,
  avatarUrl: entities.avatarUrl,
  styleTags: entities.styleTags,
  brokerLinkStatus: entities.brokerLinkStatus,
  isAgent: entities.isAgent,
  sourceUrl: entities.sourceUrl,
  createdAt: entities.createdAt,
};

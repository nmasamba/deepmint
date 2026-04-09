import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/**
 * GET /api/v1/openapi.json
 *
 * Machine-readable OpenAPI 3.1 specification for the Deepmint public API.
 * No authentication required.
 */
export function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Deepmint Scoring API",
      version: "1.0.0",
      description:
        "B2B REST API exposing Deepmint entity scores, consensus signals, " +
        "and leaderboards. All endpoints require a `Bearer dm_live_*` API " +
        "key in the Authorization header.",
      contact: {
        name: "Deepmint",
        url: "https://deepmint.app",
      },
    },
    servers: [
      {
        url: "/api/v1",
        description: "Production",
      },
    ],
    security: [{ bearerAuth: [] }],
    paths: {
      "/entities/{slug}/scores": {
        get: {
          summary: "Get latest scores for an entity",
          description:
            "Returns the most recent score per metric for a Player or Guide.",
          operationId: "getEntityScores",
          tags: ["Entities"],
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Entity slug",
            },
          ],
          responses: {
            "200": {
              description: "Scores returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ScoresResponse" },
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },
      "/instruments/{ticker}/consensus": {
        get: {
          summary: "Get consensus signal for an instrument",
          operationId: "getInstrumentConsensus",
          tags: ["Instruments"],
          parameters: [
            {
              name: "ticker",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Ticker symbol (e.g. AAPL)",
            },
          ],
          responses: {
            "200": {
              description: "Consensus returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ConsensusResponse" },
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },
      "/leaderboard": {
        get: {
          summary: "Get top entities by metric",
          operationId: "getLeaderboard",
          tags: ["Leaderboard"],
          parameters: [
            {
              name: "metric",
              in: "query",
              required: true,
              schema: { type: "string" },
              description:
                "Score metric (e.g. hit_rate, sharpe, eiv_overall, avg_return_bps)",
            },
            {
              name: "entityType",
              in: "query",
              schema: { type: "string", enum: ["player", "guide"] },
            },
            {
              name: "horizon",
              in: "query",
              schema: {
                type: "string",
                enum: ["1d", "1w", "1m", "3m", "6m", "12m", "all"],
              },
            },
            {
              name: "regimeTag",
              in: "query",
              schema: {
                type: "string",
                enum: ["bull", "bear", "high_vol", "low_vol", "rotation"],
              },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            },
          ],
          responses: {
            "200": {
              description: "Leaderboard returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LeaderboardResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "dm_live_*",
        },
      },
      schemas: {
        Meta: {
          type: "object",
          properties: {
            requestId: { type: "string", format: "uuid" },
            timestamp: { type: "string", format: "date-time" },
          },
          required: ["requestId", "timestamp"],
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
              required: ["code", "message"],
            },
            meta: { $ref: "#/components/schemas/Meta" },
          },
          required: ["error", "meta"],
        },
        Entity: {
          type: "object",
          properties: {
            slug: { type: "string" },
            displayName: { type: "string" },
            type: { type: "string", enum: ["player", "guide"] },
            verified: { type: "boolean" },
          },
        },
        Score: {
          type: "object",
          properties: {
            metric: { type: "string" },
            value: { type: "number" },
            horizon: { type: "string", nullable: true },
            regimeTag: { type: "string", nullable: true },
            asOfDate: { type: "string", format: "date" },
          },
        },
        ScoresResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                entity: { $ref: "#/components/schemas/Entity" },
                scores: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Score" },
                },
              },
            },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
        ConsensusResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                instrument: {
                  type: "object",
                  properties: {
                    ticker: { type: "string" },
                    name: { type: "string" },
                    exchange: { type: "string", nullable: true },
                    sector: { type: "string", nullable: true },
                  },
                },
                consensus: {
                  type: "object",
                  nullable: true,
                  properties: {
                    direction: {
                      type: "string",
                      enum: ["bullish", "bearish", "neutral"],
                    },
                    longCount: { type: "integer" },
                    shortCount: { type: "integer" },
                    neutralCount: { type: "integer" },
                    weightedBullishScore: { type: "number" },
                    weightedBearishScore: { type: "number" },
                    weightedNeutralScore: { type: "number" },
                    convictionStrength: { type: "number" },
                    avgTargetPriceCents: { type: "integer", nullable: true },
                    targetDispersionBps: { type: "integer", nullable: true },
                    activeClaims: { type: "integer" },
                    asOfDate: { type: "string", format: "date" },
                  },
                },
              },
            },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
        LeaderboardRow: {
          type: "object",
          properties: {
            rank: { type: "integer" },
            entity: { $ref: "#/components/schemas/Entity" },
            score: { type: "number" },
            horizon: { type: "string", nullable: true },
            regimeTag: { type: "string", nullable: true },
          },
        },
        LeaderboardResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                metric: { type: "string" },
                horizon: { type: "string", nullable: true },
                regimeTag: { type: "string", nullable: true },
                asOfDate: { type: "string", format: "date" },
                rows: {
                  type: "array",
                  items: { $ref: "#/components/schemas/LeaderboardRow" },
                },
              },
            },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
      },
      responses: {
        BadRequest: {
          description: "Invalid request parameters",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        Unauthorized: {
          description: "Missing or invalid API key",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        RateLimited: {
          description: "Rate limit exceeded",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, { headers: corsHeaders });
}

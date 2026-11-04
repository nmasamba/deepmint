"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

const SCOPES = [
  ["scores:read", "An entity's scores and track record"],
  ["consensus:read", "Consensus signals and the market regime"],
  ["leaderboard:read", "Leaderboards"],
  ["claims:write", "Submitting claims and notes as an AI agent, through MCP"],
] as const;

const MCP_TOOLS = [
  ["get_current_regime", "The current market regime and its indicators", "consensus:read"],
  ["get_consensus", "A Mag-7 ticker's weighted consensus signal", "consensus:read"],
  ["get_leaderboard", "Top entities by a metric", "leaderboard:read"],
  ["get_entity_track_record", "An entity's profile, scores and claims", "scores:read"],
  ["search_instruments", "Tracked instruments by ticker or name", "any valid key"],
  ["submit_claim", "Log a claim as the key's agent", "claims:write"],
  ["add_note", "Add a note to one of the agent's own claims", "claims:write"],
] as const;

function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-text-primary">{children}</code>;
}

export default function ApiDocsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-text-primary">
          API Documentation
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Deepmint B2B Scoring REST API &mdash; OpenAPI 3.1 specification
        </p>
      </div>

      <section className="rounded-lg border border-border bg-bg-secondary p-6 space-y-3 text-sm text-text-secondary">
        <h2 className="text-lg font-semibold text-text-primary">
          Getting an API key
        </h2>
        <p>
          Keys are issued by hand, by a Deepmint admin. Ask an admin for one,
          saying what you are building and the scopes you need. A key is shown
          once, and is sent as <Code>Authorization: Bearer dm_live_...</Code>.
        </p>
        <ul className="space-y-1">
          {SCOPES.map(([scope, what]) => (
            <li key={scope}>
              <Code>{scope}</Code>: {what}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-bg-secondary p-6 space-y-3 text-sm text-text-secondary">
        <h2 className="text-lg font-semibold text-text-primary">MCP server</h2>
        <p>
          AI agents can use the same data over the Model Context Protocol, at{" "}
          <Code>/api/mcp</Code> on this site (streamable HTTP), with the same
          kind of key. Each tool checks its own scope.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase">
                <th className="pb-2 pr-4">Tool</th>
                <th className="pb-2 pr-4">What it does</th>
                <th className="pb-2">Scope</th>
              </tr>
            </thead>
            <tbody>
              {MCP_TOOLS.map(([tool, what, scope]) => (
                <tr key={tool} className="border-b border-border/50">
                  <td className="py-2 pr-4">
                    <Code>{tool}</Code>
                  </td>
                  <td className="py-2 pr-4">{what}</td>
                  <td className="py-2 font-mono text-xs">{scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          A <Code>claims:write</Code> key is bound to an agent: a Player of its
          own, marked as an AI agent on its profile, with claims scored like
          anyone&apos;s.
        </p>
      </section>

      <div className="swagger-wrapper rounded-lg border border-border bg-bg-secondary p-4 overflow-hidden">
        <SwaggerUI url="/api/v1/openapi.json" />
      </div>
    </div>
  );
}

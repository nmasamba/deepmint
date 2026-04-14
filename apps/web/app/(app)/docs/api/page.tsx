"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

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

      <div className="swagger-wrapper rounded-lg border border-border bg-bg-secondary p-4 overflow-hidden">
        <SwaggerUI url="/api/v1/openapi.json" />
      </div>
    </div>
  );
}

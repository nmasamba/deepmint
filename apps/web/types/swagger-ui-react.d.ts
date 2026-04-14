declare module "swagger-ui-react" {
  import type { ComponentType } from "react";

  interface SwaggerUIProps {
    url?: string;
    spec?: Record<string, unknown>;
    requestInterceptor?: (req: Record<string, unknown>) => Record<string, unknown>;
    responseInterceptor?: (res: Record<string, unknown>) => Record<string, unknown>;
    onComplete?: () => void;
    docExpansion?: "list" | "full" | "none";
    defaultModelExpandDepth?: number;
    defaultModelsExpandDepth?: number;
    displayOperationId?: boolean;
    displayRequestDuration?: boolean;
    filter?: boolean | string;
    showExtensions?: boolean;
    showCommonExtensions?: boolean;
    supportedSubmitMethods?: string[];
    tryItOutEnabled?: boolean;
    validatorUrl?: string | null;
    withCredentials?: boolean;
    persistAuthorization?: boolean;
    layout?: string;
    plugins?: unknown[];
    presets?: unknown[];
  }

  const SwaggerUI: ComponentType<SwaggerUIProps>;
  export default SwaggerUI;
}

declare module "swagger-ui-react/swagger-ui.css";

export type RouteContext = {
  path: string;
  locale: string;
  searchParams: URLSearchParams;
  params: Record<string, string | string[]>;
  request?: {
    ip?: string;
    method?: string;
    body?: unknown;
    headers?: Record<string, string | undefined>;
  };
};

export type MiddlewareResult =
  | { type: "continue" }
  | { type: "rewrite"; to: string }
  | { type: "redirect"; to: string; status?: 301 | 302 | 307 | 308 };

export type RouteMiddleware = (
  ctx: RouteContext
) => Promise<MiddlewareResult | void> | MiddlewareResult | void;

export type ErrorBoundaryRenderer = (params: { error: unknown; context: RouteContext }) => string;

export type CachePolicy = {
  ttl: number;
  key?: string | ((ctx: RouteContext) => string);
  tags?: string[] | ((ctx: RouteContext) => string[]);
};

export type ActionCachePolicy<Input> = {
  ttl: number;
  key?: string | ((input: Input, ctx: RouteContext) => string);
  tags?: string[] | ((input: Input, ctx: RouteContext) => string[]);
};

export type DataLoader<Data = unknown> = (ctx: RouteContext) => Promise<Data> | Data;

export type ServerAction<Input, Output> = {
  handler: (input: Input, ctx: RouteContext) => Promise<Output> | Output;
  cache?: ActionCachePolicy<Input>;
  validate?: (input: unknown) => Input;
  authorize?: (input: Input, ctx: RouteContext) => boolean | string | Promise<boolean | string>;
};

export function continueRequest(): MiddlewareResult {
  return { type: "continue" };
}

export function rewrite(to: string): MiddlewareResult {
  return { type: "rewrite", to };
}

export function redirect(to: string, status: 301 | 302 | 307 | 308 = 302): MiddlewareResult {
  return { type: "redirect", to, status };
}

// ---------------------------------------------------------------------------
// Head management
// ---------------------------------------------------------------------------

export type PageHead = {
  title?: string;
  description?: string;
  charset?: string;
  viewport?: string;
  canonical?: string;
  og?: {
    title?: string;
    description?: string;
    image?: string;
    type?: string;
    url?: string;
  };
  /** Extra <meta> tags */
  meta?: Array<{ name?: string; property?: string; content: string }>;
  /** Extra <link> tags */
  link?: Array<{ rel: string; href: string } & Record<string, string>>;
};

export type HeadProvider = (ctx: RouteContext, data?: unknown) => PageHead | Promise<PageHead>;

// ---------------------------------------------------------------------------
// Throwable control-flow errors (for use inside loadData)
// ---------------------------------------------------------------------------

export class RedirectError extends Error {
  readonly to: string;
  readonly redirectStatus: 301 | 302 | 307 | 308;

  constructor(to: string, status: 301 | 302 | 307 | 308 = 302) {
    super(`Redirect to ${to}`);
    this.name = "RedirectError";
    this.to = to;
    this.redirectStatus = status;
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Throw inside `loadData` to redirect the request.
 *
 * @example
 * export const loadData: DataLoader = async (ctx) => {
 *   if (!ctx.params.id) throwRedirect("/");
 *   return fetchData(ctx.params.id as string);
 * };
 */
export function throwRedirect(to: string, status: 301 | 302 | 307 | 308 = 302): never {
  throw new RedirectError(to, status);
}

/**
 * Throw inside `loadData` to render a 404 page.
 *
 * @example
 * export const loadData: DataLoader = async (ctx) => {
 *   const item = await db.find(ctx.params.id);
 *   if (!item) throwNotFound();
 *   return item;
 * };
 */
export function throwNotFound(message?: string): never {
  throw new NotFoundError(message);
}

// ---------------------------------------------------------------------------

export type SchemaShape = Record<string, "string" | "number" | "boolean" | "object" | "array">;

export function defineInputSchema<T extends Record<string, unknown>>(shape: SchemaShape) {
  return (input: unknown): T => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Invalid action input: expected object");
    }

    const obj = input as Record<string, unknown>;
    Object.entries(shape).forEach(([key, expected]) => {
      const value = obj[key];

      if (value === undefined || value === null) {
        throw new Error(`Invalid action input: missing field '${key}'`);
      }

      if (expected === "array") {
        if (!Array.isArray(value)) {
          throw new Error(`Invalid action input: field '${key}' must be array`);
        }
        return;
      }

      if (typeof value !== expected) {
        throw new Error(`Invalid action input: field '${key}' must be ${expected}`);
      }
    });

    return obj as T;
  };
}

export function defineAction<Input, Output>(
  handler: (input: Input, ctx: RouteContext) => Promise<Output> | Output,
  options?: {
    cache?: ActionCachePolicy<Input>;
    validate?: (input: unknown) => Input;
    authorize?: (input: Input, ctx: RouteContext) => boolean | string | Promise<boolean | string>;
  }
): ServerAction<Input, Output> {
  return {
    handler,
    cache: options?.cache,
    validate: options?.validate,
    authorize: options?.authorize,
  };
}

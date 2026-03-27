export interface RateLimiterAdapter {
  shouldLimit(key: string, limit: number, windowMs: number): boolean | Promise<boolean>;
  close?(): void | Promise<void>;
}

export class InMemoryRateLimiter implements RateLimiterAdapter {
  private readonly store = new Map<string, { count: number; resetAt: number }>();

  shouldLimit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const current = this.store.get(key);
    if (!current || now > current.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    if (current.count >= limit) return true;
    current.count += 1;
    return false;
  }
}

/**
 * Redis-backed rate limiter. Requires NEXULAR_REDIS_URL env var and the
 * `redis` npm package installed (optional peer dependency).
 * Falls back to always-allow if Redis is unavailable at startup.
 */
export class RedisRateLimiter implements RateLimiterAdapter {
  private client: unknown = null;
  private ready = false;

  constructor(redisUrl: string) {
    this.connect(redisUrl).catch(() => {
      /* handled inside */
    });
  }

  private async connect(redisUrl: string): Promise<void> {
    try {
      // Dynamic import keeps `redis` as an optional peer dep
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClient } = require("redis") as {
        createClient: (opts: { url: string }) => {
          connect(): Promise<void>;
          incr(key: string): Promise<number>;
          pExpire(key: string, ms: number): Promise<void>;
          quit(): Promise<void>;
        };
      };
      this.client = createClient({ url: redisUrl });
      await (this.client as { connect(): Promise<void> }).connect();
      this.ready = true;
      console.log("[Nexular] Rate limiter connected to Redis");
    } catch {
      console.warn(
        "[Nexular] Redis unavailable (NEXULAR_REDIS_URL set but redis package missing or unreachable). Falling back to in-memory rate limiter.",
      );
    }
  }

  async shouldLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    if (!this.ready || !this.client) return false;
    try {
      const redis = this.client as {
        incr(key: string): Promise<number>;
        pExpire(key: string, ms: number): Promise<void>;
      };
      const count = await redis.incr(`nexular:rl:${key}`);
      if (count === 1) await redis.pExpire(`nexular:rl:${key}`, windowMs);
      return count > limit;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.ready && this.client) {
      await (this.client as { quit(): Promise<void> }).quit();
      this.ready = false;
    }
  }
}

let _adapter: RateLimiterAdapter | null = null;

/**
 * Returns the singleton rate limiter. Uses Redis when NEXULAR_REDIS_URL is
 * set, otherwise falls back to in-memory.
 */
export function getRateLimiter(): RateLimiterAdapter {
  if (!_adapter) {
    const redisUrl = process.env.NEXULAR_REDIS_URL;
    _adapter = redisUrl ? new RedisRateLimiter(redisUrl) : new InMemoryRateLimiter();
  }
  return _adapter;
}

/** Reset the singleton — useful in tests. */
export function resetRateLimiter(): void {
  _adapter = null;
}

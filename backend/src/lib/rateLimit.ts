import type { Request, Response, NextFunction } from "express";

/** Pembatas sederhana (in-memory) untuk mencegah tebak-password. */
export function rateLimit(options: { windowMs: number; max: number; keyPrefix: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of hits) if (value.resetAt <= now) hits.delete(key);
  }, options.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${options.keyPrefix}:${req.ip}`;
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > options.max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({
        success: false,
        message: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
      });
    }
    next();
  };
}

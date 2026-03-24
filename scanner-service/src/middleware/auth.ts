import type { Request, Response, NextFunction } from "express";

/**
 * Shared-secret auth middleware.
 * The Next.js API routes and the scanner service share a secret token
 * set via SCANNER_API_KEY environment variable.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = process.env.SCANNER_API_KEY;

  if (!apiKey) {
    console.error("SCANNER_API_KEY not configured");
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  const provided = req.headers.authorization?.replace("Bearer ", "");

  if (!provided || provided !== apiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

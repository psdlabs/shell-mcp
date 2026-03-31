import type { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(`[shell-daemon] Error: ${err.message}`);
  res.status(500).json({
    error: err.message ?? "Internal server error",
  });
}

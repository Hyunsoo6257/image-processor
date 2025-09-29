import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { AuthenticatedUser } from "../types/index.js";

// Simple JWT verification without dotenv
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret"; // replace with a better secret before shipping

interface JWTPayload {
  id: string;  // Changed from number to string for Cognito
  username: string;
  role: "admin" | "user";
  iat?: number;
  exp?: number;
}

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;

    // Set user information in request
    req.user = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
    };

    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid token" });
  }
}

// Legacy function for backward compatibility
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  return authenticateToken(req, res, next);
}

// Admin only middleware
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  next();
}

// Optional auth middleware (sets user if token is present, but doesn't require it)
export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
      req.user = {
        id: payload.id,
        username: payload.username,
        role: payload.role,
      };
    } catch (error) {
      // Ignore invalid tokens in optional auth
    }
  }

  next();
}

// Generate JWT token
export function generateToken(user: AuthenticatedUser): string {
  // Extended token expiration for better session management
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d"; // 7 days instead of 1 hour

  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );
}

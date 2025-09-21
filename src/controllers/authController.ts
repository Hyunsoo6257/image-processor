import { Request, Response } from "express";
import { generateToken } from "../middleware/auth.js";
import {
  User,
  LoginRequest,
  LoginResponse,
  AuthenticatedUser,
} from "../types/index.js";

// Hardcoded users
const USERS: User[] = [
  { id: 1, username: "admin", password: "admin123", role: "admin" },
  { id: 2, username: "user1", password: "user123", role: "user" },
];

export function login(req: Request, res: Response): void {
  try {
    const { username, password }: LoginRequest = req.body || {};

    if (!username || !password) {
      res.status(400).json({
        error: "Username and password are required",
        success: false,
      });
      return;
    }

    const user = USERS.find(
      (u) => u.username === username && u.password === password
    );

    if (!user) {
      res.status(401).json({
        error: "Invalid credentials",
        success: false,
      });
      return;
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      role: user.role,
    };

    const token = generateToken(authenticatedUser);

    res.json({
      success: true,
      token,
      user: authenticatedUser,
      message: "Login successful",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Internal server error",
      success: false,
    });
  }
}

// Get current user info (requires authentication)
export function getCurrentUser(req: Request, res: Response): void {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Authentication required",
        success: false,
      });
      return;
    }

    res.json({
      success: true,
      user: {
        username: req.user.username,
        role: req.user.role,
      },
    });
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({
      error: "Internal server error",
      success: false,
    });
  }
}

// Logout (client-side token removal, server just confirms)
export function logout(req: Request, res: Response): void {
  res.json({
    success: true,
    message: "Logged out successfully",
  });
}

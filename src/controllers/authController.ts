import { Request, Response } from "express";
import {
  CognitoService,
  AuthResult,
  GoogleUserInfo,
} from "../services/cognitoService.js";
import { generateToken } from "../middleware/auth.js";
import {
  LoginRequest,
  LoginResponse,
  AuthenticatedUser,
} from "../types/index.js";
import { createUserCredits } from "../models/credits.js";

// Get CognitoService instance (will be initialized in server.ts)
const getCognitoService = () => CognitoService.getInstance();

// Regular login (email/password)
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password }: LoginRequest = req.body || {};

    if (!email || !password) {
      res.status(400).json({
        error: "Email and password are required",
        success: false,
      });
      return;
    }

    const authResult: AuthResult = await getCognitoService().loginUser(
      email,
      password
    );

    if (authResult.challengeName === "SOFTWARE_TOKEN_MFA") {
      res.json({
        success: true,
        challengeName: authResult.challengeName,
        session: authResult.session,
        message: "MFA required",
      });
      return;
    }

    if (authResult.challengeName === "MFA_SETUP") {
      res.json({
        success: true,
        challengeName: authResult.challengeName,
        session: authResult.session,
        message: "MFA setup required",
      });
      return;
    }

    if (authResult.challengeName === "NEW_PASSWORD_REQUIRED") {
      res.json({
        success: true,
        challengeName: authResult.challengeName,
        session: authResult.session,
        message: "New password required",
      });
      return;
    }

    // No MFA required
    const user = await getCognitoService().getUser(authResult.accessToken);

    const authenticatedUser: AuthenticatedUser = {
      id: user.username,
      username: user.email,
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
    res.status(401).json({
      error: "Invalid credentials",
      success: false,
    });
  }
}

// Get Google auth URL
export async function getGoogleAuthUrl(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const googleAuthUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${process.env.GOOGLE_CLIENT_ID || ""}&` +
      `response_type=code&` +
      `scope=email+profile+openid&` +
      `redirect_uri=${encodeURIComponent(
        process.env.GOOGLE_REDIRECT_URI || ""
      )}&` +
      `state=${encodeURIComponent(JSON.stringify({ provider: "Google" }))}`;

    res.json({
      success: true,
      authUrl: googleAuthUrl,
      message: "Google auth URL generated",
    });
  } catch (error) {
    console.error("Google auth URL error:", error);
    res.status(500).json({
      error: "Failed to generate Google auth URL",
      success: false,
    });
  }
}

// Handle Google OAuth callback
export async function handleGoogleCallback(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      res.status(400).json({
        error: "Authorization code and state are required",
        success: false,
      });
      return;
    }

    const result = await getCognitoService().handleGoogleCallback(
      code as string,
      state as string
    );

    // Look up user by email to build app session
    const foundUser = await getCognitoService().findUserByEmail(result.email);
    if (!foundUser) {
      res.status(401).json({
        error: "User not found after Google authentication",
        success: false,
      });
      return;
    }

    const authenticatedUser: AuthenticatedUser = {
      id: foundUser.username,
      username: foundUser.email,
      role: foundUser.role,
    };

    const token = generateToken(authenticatedUser);

    // Redirect to frontend with token
    const baseUrl =
      process.env.FRONTEND_URL ||
      (() => {
        try {
          const u = new URL(process.env.GOOGLE_REDIRECT_URI || "");
          return `${u.protocol}//${u.host}`; // origin only
        } catch {
          return "http://localhost:3000";
        }
      })();

    const redirectUrl = `${baseUrl}/auth/?token=${token}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Google callback error:", error);
    res.status(500).json({
      error: "Google authentication failed",
      success: false,
    });
  }
}

// Register user with email verification
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name, role = "user" } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({
        error: "Email, password, and name are required",
        success: false,
      });
      return;
    }

    const result = await getCognitoService().registerUser(
      email,
      password,
      name,
      role
    );

    res.json({
      success: true,
      username: result.username,
      requiresConfirmation: result.requiresConfirmation,
      message:
        "User registered successfully. Please check your email for verification code.",
    });
  } catch (error) {
    console.error("Registration error:", error);
    if (error instanceof Error && error.message.includes("already exists")) {
      res.status(409).json({
        error: "User with this email already exists",
        success: false,
      });
    } else {
      res.status(400).json({
        error: "Registration failed",
        success: false,
      });
    }
  }
}

// Confirm user signup with email verification code
export async function confirmSignUp(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { email, confirmationCode } = req.body;

    if (!email || !confirmationCode) {
      res.status(400).json({
        error: "Email and confirmation code are required",
        success: false,
      });
      return;
    }

    const result = await getCognitoService().confirmSignUp(
      email,
      confirmationCode
    );

    res.json({
      success: true,
      username: result.username,
      role: result.role,
      message: "Email verification successful. You can now login.",
    });
  } catch (error) {
    console.error("Email confirmation error:", error);
    res.status(400).json({
      error: "Invalid confirmation code or email verification failed",
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

// Respond to new password challenge
export async function respondToNewPasswordChallenge(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { session, newPassword, username } = req.body;

    if (!session || !newPassword || !username) {
      res.status(400).json({
        error: "Session, new password, and username are required",
        success: false,
      });
      return;
    }

    const authResult: AuthResult =
      await getCognitoService().respondToNewPasswordChallenge(
        session,
        newPassword,
        username
      );

    const user = await getCognitoService().getUser(authResult.accessToken);

    const authenticatedUser: AuthenticatedUser = {
      id: user.username,
      username: user.email,
      role: user.role,
    };

    const token = generateToken(authenticatedUser);

    res.json({
      success: true,
      token,
      user: authenticatedUser,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("New password challenge error:", error);
    res.status(500).json({
      error: "Failed to update password",
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

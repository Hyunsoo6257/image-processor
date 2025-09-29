import { Router } from "express";
import {
  login,
  getCurrentUser,
  logout,
  respondToMfaChallenge,
  setupMfa,
  verifyMfaToken,
  getGoogleAuthUrl,
  handleGoogleCallback,
  register,
  confirmSignUp,
  respondToNewPasswordChallenge,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Public routes
router.post("/login", login);
router.post("/register", register);
router.post("/confirm-signup", confirmSignUp);
router.post("/logout", logout);
router.get("/google-auth-url", getGoogleAuthUrl);
router.get("/google/callback", handleGoogleCallback);

// MFA routes
router.post("/mfa/challenge", respondToMfaChallenge);
router.post("/mfa/setup", setupMfa);
router.post("/mfa/verify", verifyMfaToken);

// New password challenge route
router.post("/new-password", respondToNewPasswordChallenge);

// Protected routes
router.get("/me", requireAuth, getCurrentUser);

export default router;

import { Router } from "express";
import {
  login,
  getCurrentUser,
  logout,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Public routes
router.post("/login", login);
router.post("/logout", logout);

// Protected routes
router.get("/me", requireAuth, getCurrentUser);

export default router;

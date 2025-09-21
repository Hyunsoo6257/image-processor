import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getCurrentUserCredits,
  getAllUsersCredits,
  getUserTransactions,
  grantCreditsToUser,
} from "../controllers/creditController.js";

const router = Router();

// Credit management routes
router.get("/me", requireAuth, getCurrentUserCredits);
router.get("/users", requireAuth, getAllUsersCredits); // Admin only
router.get("/transactions", requireAuth, getUserTransactions);
router.get("/transactions/:username", requireAuth, getUserTransactions);
router.post("/grant", requireAuth, grantCreditsToUser); // Admin only

export default router;

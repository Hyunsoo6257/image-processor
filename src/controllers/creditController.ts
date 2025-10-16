import { Request, Response } from "express";
import {
  getUserCredits,
  getAllUsersWithCredits,
  getUserTransactionHistory,
  grantCredits,
} from "../models/credits.js";
import { GrantCreditsRequest } from "../types/index.js";

export async function getCurrentUserCredits(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const credits = await getUserCredits(req.user!.username);

    if (credits) {
      res.json({
        success: true,
        data: credits,
      });
    } else {
      res.json({
        success: true,
        data: {
          username: req.user!.username,
          credits: 0,
          lastUpdated: new Date(),
        },
      });
    }
  } catch (error) {
    console.error("Credits query failed:", error);
    res.status(500).json({ success: false, error: "Failed to load credits" });
  }
}

export async function getAllUsersCredits(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.user!.role !== "admin") {
      res.status(403).json({
        error: "Admin access required",
        success: false,
      });
      return;
    }

    const users = await getAllUsersWithCredits();
    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Failed to load user credits list:", error);
    res.status(500).json({ success: false, error: "Failed to load users" });
  }
}

export async function getUserTransactions(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { username } = req.params;
    const targetUsername = username || req.user!.username;

    // Check if user can access this data
    if (req.user!.role !== "admin" && req.user!.username !== targetUsername) {
      res.status(403).json({
        error: "Access denied",
        success: false,
      });
      return;
    }

    const transactions = await getUserTransactionHistory(targetUsername);
    res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    console.warn("Database not available for transactions:", error);
    // Return empty transactions when database is not available
    res.json({
      success: true,
      data: [],
    });
  }
}

export async function grantCreditsToUser(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.user!.role !== "admin") {
      res.status(403).json({
        error: "Admin access required",
        success: false,
      });
      return;
    }

    const { username, creditsToGrant }: GrantCreditsRequest = req.body;

    if (!username || !creditsToGrant || creditsToGrant <= 0) {
      res.status(400).json({
        error: "Valid username and positive credits amount required",
        success: false,
      });
      return;
    }

    await grantCredits(username, creditsToGrant, req.user!.username);

    res.json({
      success: true,
      message: `Successfully granted ${creditsToGrant} credits to ${username}`,
    });
  } catch (error) {
    console.error("Grant credits error:", error);
    res.status(500).json({ success: false, error: "Failed to grant credits" });
  }
}

// Helper function to check if user has enough credits (works in both DB and memory mode)
export async function checkUserCredits(
  username: string,
  role: string,
  requiredAmount: number
): Promise<boolean> {
  try {
    const userCredits = await getUserCredits(username);
    if (!userCredits) return role === "admin" ? true : false;
    return role === "admin" || userCredits.credits >= requiredAmount;
  } catch (error) {
    console.error("Credit check failed:", error);
    return role === "admin" ? true : false;
  }
}

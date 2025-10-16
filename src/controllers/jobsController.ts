import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { access } from "fs/promises";
import { User } from "../types/index.js";
import { S3Service } from "../services/s3Service.js";
import { getPool } from "../models/database.js";

import {
  getUserCredits,
  deductCredits,
  refundCredits,
} from "../models/credits.js";

import { ImageProcessor } from "../services/imageProcessor.js";
import {
  CreateJobRequest,
  StressTestRequest,
  StressTestResponse,
  JobListQuery,
} from "../types/index.js";
import {
  deductCreditsFallback,
  refundCreditsFallback,
} from "../models/creditsFallback.js";
import { checkUserCredits } from "./creditController.js";

// Helper function to check user credits
async function checkUserCreditsInternal(
  username: string,
  requiredCredits: number,
  role: string
): Promise<boolean> {
  return await checkUserCredits(username, role, requiredCredits);
}

// Helper function to deduct credits safely
async function deductCreditsSafely(
  username: string,
  jobId: number,
  credits: number = 1,
  role?: string
): Promise<void> {
  try {
    await deductCredits(username, jobId, credits);
  } catch (creditError) {
    console.warn("Failed to deduct credits (DB). Using fallback:", creditError);
    try {
      // Use fallback in-memory store
      deductCreditsFallback(username, (role as any) || "user", credits);
    } catch (e) {
      console.warn("Fallback deduction failed:", e);
    }
  }
}

// Create job document and start processing
export async function createJob(req: Request, res: Response): Promise<void> {
  try {
    const { fileId, params }: CreateJobRequest = req.body || {};

    if (!fileId) {
      res.status(400).json({
        error: "fileId is required",
        success: false,
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        error: "Authentication required",
        success: false,
      });
      return;
    }

    // Check credits for non-admin users
    if (req.user.role !== "admin") {
      const hasEnoughCredits = await checkUserCreditsInternal(
        req.user.username,
        1,
        req.user.role
      );

      if (!hasEnoughCredits) {
        let userCredits;
        try {
          userCredits = await getUserCredits(req.user.username);
        } catch (error) {
          // Use fallback credits
          const { getCreditsFallback } = await import(
            "../models/creditsFallback.js"
          );
          userCredits = getCreditsFallback(
            req.user.username,
            req.user.role as any
          );
        }

        res.status(402).json({
          error:
            "Insufficient credits. You need at least 1 credit to process an image.",
          success: false,
          data: {
            currentCredits: userCredits?.credits || 0,
            requiredCredits: 1,
          },
        });
        return;
      }
    }

    // DB-only: insert job row
    const jobInsert = await getPool().query(
      `INSERT INTO s302.jobs (file_id, user_id, status, created_at, params)
     VALUES ($1, $2, 'pending', NOW(), $3) RETURNING id`,
      [fileId, req.user.id, JSON.stringify(params || {})]
    );
    const jobId = jobInsert.rows[0].id;

    if (req.user.role !== "admin") {
      await deductCreditsSafely(req.user.username, jobId, 1, req.user.role);
    }

    processJobAsync(jobId);

    res.json({ success: true, data: { id: jobId, fileId, status: "pending" } });
  } catch (error) {
    console.error("Create job error:", error);
    res.status(500).json({
      error: "Failed to create job",
      success: false,
    });
  }
}

// Create batch jobs for multiple files
export const createBatchJobs = async (req: Request, res: Response) => {
  try {
    const { fileIds, params }: { fileIds: string[]; params?: any } =
      req.body || {};

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({
        error: "fileIds array is required",
        success: false,
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        error: "Authentication required",
        success: false,
      });
      return;
    }

    // Check credits for non-admin users
    if (req.user.role !== "admin") {
      const hasEnoughCredits = await checkUserCreditsInternal(
        req.user.username,
        fileIds.length,
        req.user.role
      );

      if (!hasEnoughCredits) {
        let userCredits;
        try {
          userCredits = await getUserCredits(req.user.username);
        } catch (error) {
          // Use fallback credits
          const { getCreditsFallback } = await import(
            "../models/creditsFallback.js"
          );
          userCredits = getCreditsFallback(
            req.user.username,
            req.user.role as any
          );
        }

        res.status(402).json({
          error: `Insufficient credits. Required: ${
            fileIds.length
          }, Available: ${userCredits?.credits || 0}`,
          success: false,
          data: {
            currentCredits: userCredits?.credits || 0,
            requiredCredits: fileIds.length,
          },
        });
        return;
      }
    }

    const jobs = [] as Array<{ id: number; file_id: string; status: string }>;
    const failedJobs = [] as Array<{ fileId: string; error: string }>;

    // Process each file
    for (const fileId of fileIds) {
      try {
        // Check if file exists in database (S3-based)
        try {
          const fileQuery =
            "SELECT * FROM s302.files WHERE filename = $1 AND user_id = $2";
          const fileResult = await getPool().query(fileQuery, [
            fileId,
            req.user.id, // Use string ID directly (Cognito UUID)
          ]);

          if (fileResult.rows.length === 0) {
            failedJobs.push({ fileId, error: "File not found in database" });
            continue;
          }
        } catch (dbError) {
          console.error("Database error checking file:", dbError);
          failedJobs.push({ fileId, error: "Database connection failed" });
          continue;
        }

        // Create job using existing function
        const jobInsert = await getPool().query(
          `INSERT INTO s302.jobs (file_id, user_id, status, created_at, params)
           VALUES ($1, $2, 'pending', NOW(), $3) RETURNING id`,
          [fileId, req.user.id, JSON.stringify(params || {})]
        );
        const job = {
          id: jobInsert.rows[0].id,
          file_id: fileId,
          status: "pending",
        };
        jobs.push(job as any);

        // Deduct credits for non-admin users
        if (req.user.role !== "admin") {
          await deductCreditsSafely(
            req.user.username,
            job.id,
            1,
            req.user.role
          );
        }

        // Start asynchronous processing
        processJobAsync(job.id);
      } catch (error) {
        console.error(`Error creating job for file ${fileId}:`, error);
        failedJobs.push({ fileId, error: (error as Error).message });

        // Refund credits for failed job creation
        if (req.user.role !== "admin") {
          try {
            // Note: We can't refund specific job since it wasn't created successfully
            // This is a limitation of the current credit system
            console.warn("Cannot refund credits for failed job creation");
          } catch (refundError) {
            console.warn("Failed to refund credits:", refundError);
          }
        }
      }
    }

    res.json({
      success: true,
      message: `Batch processing initiated for ${jobs.length} files`,
      data: {
        jobs: jobs.map((job) => ({
          id: job.id,
          file_id: job.file_id,
          status: job.status,
        })),
        failedJobs,
        totalRequested: fileIds.length,
        successful: jobs.length,
        failed: failedJobs.length,
      },
    });
  } catch (error) {
    console.error("Batch job creation error:", error);
    res.status(500).json({
      error: "Failed to create batch jobs",
      success: false,
    });
  }
};

// Asynchronous image processing function
async function processJobAsync(jobId: number): Promise<void> {
  // Load job from DB
  const jobRes = await getPool().query(
    "SELECT * FROM s302.jobs WHERE id = $1",
    [jobId]
  );
  if (jobRes.rows.length === 0) return;
  const job = jobRes.rows[0];

  const startTime = Date.now();
  let success = false;
  let errorMessage: string | undefined;
  let outputFileName: string | undefined;

  try {
    await getPool().query(
      "UPDATE s302.jobs SET status='processing', updated_at=NOW() WHERE id=$1",
      [jobId]
    );

    // Generate output filename and S3 key
    const ext = (job.params && job.params.format) || "jpg";
    const timestamp = Date.now();
    const outputFileName = `processed_${timestamp}_${job.id}.${ext}`;

    // Generate S3 keys (stateless)
    const inputS3Key = `user_${job.user_id}/${job.file_id}`;
    const outputS3Key = S3Service.generateProcessedKey(
      job.user,
      job.id,
      outputFileName
    );

    // Execute image processing with S3 support (stateless)
    const result = await ImageProcessor.processImage("", "", {
      ...job.params,
      inputS3Key: inputS3Key,
      outputS3Key: outputS3Key,
    });

    if (result.success) {
      await getPool().query(
        "UPDATE s302.jobs SET status='completed', updated_at=NOW(), result=$1 WHERE id=$2",
        [
          JSON.stringify({
            outputFile: result.outputFile,
            outputPath: outputS3Key,
            s3Key: outputS3Key,
            processedAt: new Date(),
          }),
          jobId,
        ]
      );
    } else {
      throw new Error(result.error || "Image processing failed");
    }

    success = true;
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    errorMessage = error instanceof Error ? error.message : "Unknown error";
    await getPool().query(
      "UPDATE s302.jobs SET status='failed', updated_at=NOW(), result=$1 WHERE id=$2",
      [JSON.stringify({ error: errorMessage }), jobId]
    );
  } finally {
    const processingTime = Date.now() - startTime;

    // Refund credits if job failed for non-admin users
    if (!success && job.user_id !== "admin") {
      try {
        await refundCredits(job.user_id, job.id, 1);
      } catch (refundError) {
        console.warn("Failed to refund credits (DB):", refundError);
        try {
          refundCreditsFallback(job.user_id, "user", 1);
        } catch (e) {
          console.warn("Fallback refund failed:", e);
        }
      }
      console.log(`Credits refunded for failed job ${job.id}`);
    }

    // record data with ACID requirements (only when database connection is established)
    try {
      const { recordProcessingHistory } = await import("../models/history.js");
      await recordProcessingHistory({
        jobId: job.id,
        user: job.user,
        inputFileId: job.file_id,
        outputFileId: success ? outputFileName : undefined,
        processingTimeMs: processingTime,
        cpuUsagePercent: Math.random() * 20 + 80, // simulation
        memoryUsageMb: Math.random() * 100 + 200, // simulation
        success,
        errorMessage,
      });
    } catch (dbError) {
      console.warn("Failed to record processing history:", dbError);
      // continue job processing even if database connection fails
    }
  }
}

// List jobs with pagination/filter/sort
export async function listJobs(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Authentication required",
        success: false,
      });
      return;
    }

    const {
      status,
      page = "1",
      pageSize = "20",
      sort = "-created_at",
    }: JobListQuery = req.query;

    const allRes = await getPool().query(
      `SELECT * FROM s302.jobs WHERE user_id = $1`,
      [req.user.id]
    );
    const all = allRes.rows;
    const filtered = status ? all.filter((j) => j.status === status) : all;

    const key = sort.replace(/^-/, "");
    const dir = sort.startsWith("-") ? -1 : 1;
    const sorted = [...filtered].sort((a, b) => {
      const aVal = (a as any)[key];
      const bVal = (b as any)[key];
      return (aVal > bVal ? 1 : -1) * dir;
    });

    const p = Number(page);
    const ps = Number(pageSize);
    const total = sorted.length;
    const items = sorted.slice((p - 1) * ps, (p - 1) * ps + ps);

    res.json({
      success: true,
      data: {
        page: p,
        pageSize: ps,
        total,
        items,
      },
    });
  } catch (error) {
    console.error("List jobs error:", error);
    res.status(500).json({
      error: "Failed to list jobs",
      success: false,
    });
  }
}

// Get one job
export function getJob(req: Request, res: Response): void {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Authentication required",
        success: false,
      });
      return;
    }

    const jobId = Number(req.params.id);

    // Validate job ID
    if (isNaN(jobId) || jobId <= 0) {
      res.status(400).json({
        error: "Invalid job ID",
        success: false,
      });
      return;
    }

    // Load job from DB and enforce access control
    getPool()
      .query(
        `SELECT j.* FROM s302.jobs j WHERE j.id = $1 AND (j.user_id = $2 OR $3 = 'admin')`,
        [jobId, req.user.id, req.user.role]
      )
      .then((r) => {
        if (r.rows.length === 0) {
          res
            .status(404)
            .json({ success: false, error: "Job not found or access denied" });
          return;
        }
        res.json({ success: true, data: r.rows[0] });
      })
      .catch((e) => {
        console.error("Get job error:", e);
        res.status(500).json({ success: false, error: "Failed to get job" });
      });
  } catch (error) {
    console.error("Get job error:", error);
    res.status(500).json({
      error: "Failed to get job",
      success: false,
    });
  }
}

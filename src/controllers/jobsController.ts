import { Request, Response } from "express";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { access } from "fs/promises";
import { User } from "../types/index.js";
import { S3Service } from "../services/s3Service.js";

import {
  getUserCredits,
  deductCredits,
  refundCredits,
} from "../models/credits.js";
import {
  createJob as createJobModel,
  listJobsByUser,
  findJobById,
  updateJobStatus,
} from "../models/jobs.js";
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

    // Create job
    const job = createJobModel(req.user, fileId, params || null);

    // Deduct credits for non-admin users (after job creation)
    if (req.user.role !== "admin") {
      await deductCreditsSafely(req.user.username, job.id, 1, req.user.role);
    }

    // Start asynchronous processing
    processJobAsync(job.id);

    res.json({
      success: true,
      data: job,
      message: "Job created successfully",
    });
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

    const jobs = [];
    const failedJobs = [];

    // Process each file
    for (const fileId of fileIds) {
      try {
        // Check if file exists
        const filePath = path.join("./data/in", fileId);
        if (!fs.existsSync(filePath)) {
          failedJobs.push({ fileId, error: "File not found" });
          continue;
        }

        // Create job using existing function
        const job = createJobModel(req.user, fileId, params || null);
        jobs.push(job);

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
  const job = findJobById(jobId);
  if (!job) return;

  const startTime = Date.now();
  let success = false;
  let errorMessage: string | undefined;
  let outputFileName: string | undefined;

  try {
    updateJobStatus(jobId, "processing");

    const inputPath = path.join("./data/in", job.file_id);

    // Generate output filename and S3 key
    const ext = job.params?.format || "jpg";
    const timestamp = Date.now();
    const outputFileName = `processed_${timestamp}_${job.id}.${ext}`;
    const outputPath = path.join("./data/out", outputFileName);

    // Generate S3 keys
    const inputS3Key = `user_${job.user}/${job.file_id}`;
    const outputS3Key = S3Service.generateProcessedKey(
      1,
      job.id,
      outputFileName
    ); // Using user ID 1 as fallback

    // Execute image processing with S3 support
    const result = await ImageProcessor.processImage(inputPath, outputPath, {
      ...job.params,
      inputS3Key: inputS3Key,
      outputS3Key: outputS3Key,
    });

    if (result.success) {
      updateJobStatus(jobId, "completed", {
        outputFile: result.outputFile,
        outputPath: outputPath,
        s3Key: outputS3Key,
        processedAt: new Date(),
      });
    } else {
      throw new Error(result.error || "Image processing failed");
    }

    success = true;
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    errorMessage = error instanceof Error ? error.message : "Unknown error";
    updateJobStatus(jobId, "failed", {
      error: errorMessage,
    });
  } finally {
    const processingTime = Date.now() - startTime;

    // Refund credits if job failed for non-admin users
    if (!success && job.user !== "admin") {
      try {
        await refundCredits(job.user, job.id, 1);
      } catch (refundError) {
        console.warn("Failed to refund credits (DB):", refundError);
        try {
          refundCreditsFallback(job.user, "user", 1);
        } catch (e) {
          console.warn("Fallback refund failed:", e);
        }
      }
      console.log(`✅ Credits refunded for failed job ${job.id}`);
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

    const all = await listJobsByUser(req.user);
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

    const job = findJobById(jobId);

    if (!job) {
      res.status(404).json({
        error: "Job not found",
        success: false,
      });
      return;
    }

    if (req.user.role !== "admin" && job.user !== req.user.username) {
      res.status(403).json({
        error: "Access denied",
        success: false,
      });
      return;
    }

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error("Get job error:", error);
    res.status(500).json({
      error: "Failed to get job",
      success: false,
    });
  }
}

// Batch image processing for system optimization (admin access only)
export async function stressTest(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== "admin") {
      res.status(403).json({
        error: "Admin access required",
        success: false,
      });
      return;
    }

    const { iterations = 5, sampleImage }: StressTestRequest = req.body;

    if (!sampleImage) {
      res.status(400).json({
        error: "sampleImage filename required",
        success: false,
      });
      return;
    }

    const inputPath = path.join("./data/in", sampleImage);

    // Check file existence
    try {
      await access(inputPath);
    } catch (error) {
      res.status(404).json({
        error: "Sample image not found",
        success: false,
      });
      return;
    }

    // Start stress test (asynchronous)
    const response: StressTestResponse = {
      message: "Stress test started",
      iterations,
      estimatedDuration: `${iterations * 2} seconds`,
    };

    res.json({
      success: true,
      data: response,
    });

    // Execute stress test in background
    const result = await ImageProcessor.stressTest(
      inputPath,
      "./data/out",
      iterations
    );
    console.log("Stress test completed:", result);
  } catch (error) {
    console.error("Stress test error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Stress test failed",
        success: false,
      });
    }
  }
}

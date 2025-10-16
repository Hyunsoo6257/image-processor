import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { getPool } from "../models/database.js";
import { ImageProcessor } from "../services/imageProcessor.js";
import { ExternalAPIService } from "../services/externalAPIService.js";
import { S3Service } from "../services/s3Service.js";
import path from "path";
import { checkUserCredits } from "../controllers/creditController.js";
import { Job } from "../types/index.js";
import fs from "fs";

const router = express.Router();

// Get all jobs for the authenticated user
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    try {
      const query = `
        SELECT j.*, f.filename as input_filename
        FROM s302.jobs j
        JOIN s302.files f ON j.file_id = f.filename
        WHERE f.user_id = $1
        ORDER BY j.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await getPool().query(query, [userId, limit, offset]);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) 
        FROM s302.jobs j
        JOIN s302.files f ON j.file_id = f.filename
        WHERE f.user_id = $1
      `;
      const countResult = await getPool().query(countQuery, [userId]);

      res.json({
        success: true,
        data: {
          items: result.rows,
          pagination: {
            page,
            limit,
            total: parseInt(countResult.rows[0].count),
            totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
          },
        },
      });
    } catch (dbError) {
      console.warn("Database not available, using memory mode:", dbError);

      // Fallback to memory mode - return jobs from memory
      const { listJobsByUser } = await import("../models/jobs.js");
      const memoryJobs = listJobsByUser(req.user!);

      // Debug logging
      console.log(
        "Memory jobs for user:",
        req.user!.username,
        memoryJobs.length
      );
      memoryJobs.forEach((job: Job) => {
        console.log(
          `Job: ${job.id}, File: ${job.file_id}, Status: ${job.status}, Result:`,
          job.result
        );
      });

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedJobs = memoryJobs.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: {
          items: paginatedJobs,
          pagination: {
            page,
            limit,
            total: memoryJobs.length,
            totalPages: Math.ceil(memoryJobs.length / limit),
          },
        },
      });
    }
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch jobs",
    });
  }
});

// Get a specific job
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const jobId = req.params.id;
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)

    const query = `
      SELECT j.*, f.filename as input_filename
      FROM s302.jobs j
      JOIN s302.files f ON j.file_id = f.filename
      WHERE j.id = $1 AND f.user_id = $2
    `;

    const result = await getPool().query(query, [jobId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Job not found or access denied",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching job:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch job",
    });
  }
});

// Create a new job
router.post("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)
    const { fileId, params } = req.body;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: "File ID is required",
      });
    }

    // Check if user owns this file
    const fileQuery =
      "SELECT * FROM s302.files WHERE filename = $1 AND user_id = $2";
    const fileResult = await getPool().query(fileQuery, [fileId, userId]);

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "File not found or access denied",
      });
    }

    // Create job
    const jobQuery = `
      INSERT INTO s302.jobs (file_id, user_id, status, created_at, params)
      VALUES ($1, $2, $3, NOW(), $4)
      RETURNING id
    `;

    const jobResult = await getPool().query(jobQuery, [
      fileId,
      userId,
      "pending",
      JSON.stringify(params || {}),
    ]);

    const jobId = jobResult.rows[0].id;

    // Process the image asynchronously
    setTimeout(async () => {
      try {
        const inputPath = path.join(process.cwd(), "data", "in", fileId);
        const outputFilename = `processed_${Date.now()}_${jobId}.jpg`;
        const outputPath = path.join(
          process.cwd(),
          "data",
          "out",
          outputFilename
        );

        // Generate S3 keys
        const inputS3Key = `user_${userId}/${fileId}`;
        const outputS3Key = S3Service.generateProcessedKey(
          req.user!.username,
          jobId,
          outputFilename
        );

        await ImageProcessor.processImage(inputPath, outputPath, {
          ...params,
          inputS3Key: inputS3Key,
          outputS3Key: outputS3Key,
        });

        // Update job status to completed with output file info
        await getPool().query(
          "UPDATE s302.jobs SET status = 'completed', completed_at = NOW(), result = $1 WHERE id = $2",
          [
            JSON.stringify({ outputFile: outputFilename, s3Key: outputS3Key }),
            jobId,
          ]
        );
      } catch (error) {
        console.error("Background processing error:", error);

        // Update job status to failed
        await getPool().query(
          "UPDATE s302.jobs SET status = 'failed', completed_at = NOW() WHERE id = $1",
          [jobId]
        );
      }
    }, 100);

    res.json({
      success: true,
      data: {
        id: jobId,
        fileId: fileId,
        status: "pending",
      },
    });
  } catch (error) {
    console.error("Error creating job:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create job",
    });
  }
});

// Batch process multiple files
router.post("/batch-process", authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)
    const { fileIds, params } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "File IDs array is required",
      });
    }

    // Check credits for non-admin users
    if (req.user!.role !== "admin") {
      const hasEnoughCredits = await checkUserCredits(
        req.user!.username,
        req.user!.role,
        fileIds.length
      );

      if (!hasEnoughCredits) {
        // Get current credits for error message
        let currentCredits = 0;
        try {
          const { getUserCredits } = await import("../models/credits.js");
          const userCredits = await getUserCredits(req.user!.username);
          currentCredits = userCredits?.credits || 0;
        } catch (error) {
          const { getCreditsFallback } = await import(
            "../models/creditsFallback.js"
          );
          const fallbackCredits = getCreditsFallback(
            req.user!.username,
            req.user!.role as any
          );
          currentCredits = fallbackCredits.credits;
        }

        return res.status(402).json({
          success: false,
          error: `Insufficient credits. Required: ${fileIds.length}, Available: ${currentCredits}`,
          data: {
            currentCredits,
            requiredCredits: fileIds.length,
          },
        });
      }
    }

    const successfulJobs = [];
    const failedJobs = [];

    // Process files in memory mode (since DB is not available)
    for (const fileId of fileIds) {
      try {
        // Check if file exists
        const inputPath = path.join(process.cwd(), "data", "in", fileId);
        if (!fs.existsSync(inputPath)) {
          failedJobs.push({ fileId, error: "File not found" });
          continue;
        }

        // Generate unique job ID
        const jobId = Date.now() + Math.random();

        // Generate output filename
        const outputFilename = `processed_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}.jpg`;
        const outputPath = path.join(
          process.cwd(),
          "data",
          "out",
          outputFilename
        );

        // Process the image
        await ImageProcessor.processImage(inputPath, outputPath, params || {});

        // Create job and mark as completed
        const { createJob, updateJobStatus } = await import(
          "../models/jobs.js"
        );
        const job = createJob(req.user!, fileId, params);
        await updateJobStatus(job.id, "completed", {
          outputFile: outputFilename,
          processedAt: new Date(),
        });

        successfulJobs.push(job);

        console.log(`✅ Processed file: ${fileId} -> ${outputFilename}`);
      } catch (error) {
        console.error(`❌ Failed to process file ${fileId}:`, error);
        failedJobs.push({
          fileId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Deduct credits for non-admin users
    if (req.user!.role !== "admin") {
      try {
        await getPool().query(
          "UPDATE user_credits SET credits = credits - $1, last_updated = CURRENT_TIMESTAMP WHERE username = $2",
          [successfulJobs.length, req.user!.username]
        );
      } catch (creditError) {
        console.warn(
          "Failed to deduct credits from database, using fallback:",
          creditError
        );
        const { deductCreditsFallback } = await import(
          "../models/creditsFallback.js"
        );
        deductCreditsFallback(
          req.user!.username,
          req.user!.role,
          successfulJobs.length
        );
      }
    }

    res.json({
      success: true,
      data: {
        successful: successfulJobs.length,
        failed: failedJobs.length,
        jobs: successfulJobs,
        errors: failedJobs,
        creditsUsed: successfulJobs.length,
      },
    });
  } catch (error) {
    console.error("Error batch processing:", error);
    res.status(500).json({
      success: false,
      error: "Failed to batch process files",
    });
  }
});

// External API: Download processed image
router.get(
  "/download-processed-image/:jobId",
  authenticateToken,
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const userId = req.user!.id; // Use string ID directly (Cognito UUID)

      const result = await ExternalAPIService.getProcessedImagePath(
        parseInt(jobId),
        userId // userId is already a number
      );

      if (result.success && result.filePath && result.filename) {
        res.download(result.filePath, result.filename);
      } else {
        res.status(404).json({
          success: false,
          error: result.error || "File not found",
        });
      }
    } catch (error) {
      console.error("Error downloading processed image:", error);
      res.status(500).json({
        success: false,
        error: "Failed to download processed image",
      });
    }
  }
);

// External API: Process random image directly
router.post("/process-random-image", authenticateToken, async (req, res) => {
  try {
    const { searchTerm, processingOptions } = req.body;
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)

    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        error: "Search term is required",
      });
    }

    const result = await ExternalAPIService.processRandomImage(
      searchTerm,
      processingOptions,
      userId // userId is already a number
    );

    if (result.success) {
      res.json({
        success: true,
        jobId: result.jobId,
        filename: result.filename,
        message: "Random image processing started",
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error processing random image:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process random image",
    });
  }
});

// Delete job and all related data
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const userId = req.user!.id; // Use string ID directly (Cognito UUID)

    if (isNaN(jobId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid job ID",
      });
    }

    try {
      // Check if user owns this job (database mode)
      const query = "SELECT * FROM s302.jobs WHERE id = $1 AND user_id = $2";
      const result = await getPool().query(query, [jobId, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Job not found or access denied",
        });
      }

      const job = result.rows[0];

      // Delete job from database
      await getPool().query(
        "DELETE FROM s302.jobs WHERE id = $1 AND user_id = $2",
        [jobId, userId]
      );

      // Delete related output file from S3 if exists (stateless)
      if (job.result && job.result.s3Key) {
        try {
          await S3Service.deleteFile(job.result.s3Key);
        } catch (error) {
          console.warn("Failed to delete S3 file:", error);
        }
      }
    } catch (dbError) {
      console.warn(
        "Database not available for delete check, proceeding with memory mode:",
        dbError
      );

      // In memory mode, try to delete from memory
      try {
        const { deleteJob } = await import("../models/jobs.js");
        const deleted = deleteJob(jobId);

        if (!deleted) {
          return res.status(404).json({
            success: false,
            error: "Job not found or access denied",
          });
        }
      } catch (memoryError) {
        console.warn("Memory deletion failed:", memoryError);
      }
    }

    res.json({
      success: true,
      message: `Job #${jobId} and all related data deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting job:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete job",
    });
  }
});

export default router;

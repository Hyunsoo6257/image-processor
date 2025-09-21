import { Job, ImageProcessingParams, AuthenticatedUser, ProcessingResult } from "../types/index.js";

// In-memory job storage as fallback when database is unavailable
const jobs: Map<number, Job> = new Map();
let nextJobId = 1;

// Create a new job
export function createJob(
  user: AuthenticatedUser,
  fileId: string,
  params: ImageProcessingParams | null
): Job {
  const job: Job = {
    id: nextJobId++,
    user: user.username,
    role: user.role,
    file_id: fileId,
    params,
    status: "pending",
    result: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  jobs.set(job.id, job);
  return job;
}

// List jobs for a specific user
export function listJobsByUser(user: AuthenticatedUser): Job[] {
  const userJobs: Job[] = [];
  
  for (const job of jobs.values()) {
    if (user.role === "admin" || job.user === user.username) {
      userJobs.push(job);
    }
  }
  
  return userJobs.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

// Find a job by ID
export function findJobById(jobId: number): Job | null {
  return jobs.get(jobId) || null;
}

// Update job status and result
export function updateJobStatus(
  jobId: number,
  status: Job["status"],
  result?: ProcessingResult
): boolean {
  const job = jobs.get(jobId);
  if (!job) {
    return false;
  }

  job.status = status;
  job.updated_at = new Date();
  
  if (result) {
    job.result = result;
  }

  jobs.set(jobId, job);
  return true;
}

// Get all jobs (admin only)
export function getAllJobs(): Job[] {
  return Array.from(jobs.values()).sort(
    (a, b) => b.created_at.getTime() - a.created_at.getTime()
  );
}

// Delete a job
export function deleteJob(jobId: number): boolean {
  return jobs.delete(jobId);
}

// Get job statistics
export function getJobStats(): {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
} {
  const stats = {
    total: jobs.size,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  for (const job of jobs.values()) {
    switch (job.status) {
      case "pending":
        stats.pending++;
        break;
      case "processing":
        stats.processing++;
        break;
      case "completed":
        stats.completed++;
        break;
      case "failed":
        stats.failed++;
        break;
    }
  }

  return stats;
}

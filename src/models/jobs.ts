import { AuthenticatedUser, Job, JobStatus, ProcessingResult } from "../types/index.js";

// In-memory job store for fallback when database is unavailable
const jobsById = new Map<number, Job>();

export function listJobsByUser(user: AuthenticatedUser): Job[] {
  const items: Job[] = [];
  for (const job of jobsById.values()) {
    if (job.user === user.username) {
      items.push(job);
    }
  }
  // Sort newest first for consistency with DB route
  items.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  return items;
}

export function createJob(
  user: AuthenticatedUser,
  fileId: string,
  params: Job["params"]
): Job {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  const now = new Date();
  const job: Job = {
    id,
    user: user.username,
    role: user.role,
    file_id: fileId,
    params: params ?? null,
    status: "pending",
    result: null,
    created_at: now,
    updated_at: now,
  };
  jobsById.set(id, job);
  return job;
}

export function updateJobStatus(
  jobId: number,
  status: JobStatus,
  result?: ProcessingResult
): Job | null {
  const existing = jobsById.get(jobId);
  if (!existing) return null;
  const updated: Job = {
    ...existing,
    status,
    result: result ?? existing.result,
    updated_at: new Date(),
  };
  jobsById.set(jobId, updated);
  return updated;
}

export function deleteJob(jobId: number): boolean {
  return jobsById.delete(jobId);
}



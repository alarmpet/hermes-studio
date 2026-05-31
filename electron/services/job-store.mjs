import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const INDEX_FILE = "jobs-index.json";

export async function listJobs(jobsDir) {
  const indexPath = join(jobsDir, INDEX_FILE);
  if (!existsSync(indexPath)) return [];
  return JSON.parse(await readFile(indexPath, "utf8"));
}

export async function upsertJob(jobsDir, job) {
  await mkdir(jobsDir, { recursive: true });
  const indexPath = join(jobsDir, INDEX_FILE);
  const current = await listJobs(jobsDir);
  const summary = {
    id: job.id,
    title: job.title || job.sourceValue || job.id,
    status: job.status || "unknown",
    jobDir: job.jobDir,
    finalVideo: job.finalVideo || job.finalPath || "",
    finalPath: job.finalPath || job.finalVideo || "",
    thumbnailPath: job.thumbnailPath || "",
    updatedAt: new Date().toISOString(),
  };
  const next = [summary, ...current.filter((item) => item.id !== job.id)].slice(0, 500);
  await writeFile(indexPath, JSON.stringify(next, null, 2), "utf8");
  await writeFile(join(jobsDir, `${job.id}.json`), JSON.stringify(job, null, 2), "utf8");
  return summary;
}

export async function readJob(jobsDir, jobId) {
  return JSON.parse(await readFile(join(jobsDir, `${jobId}.json`), "utf8"));
}

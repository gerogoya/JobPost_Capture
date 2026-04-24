const JOB_STORAGE_KEY = "jobpost_analyzer_jobs";

const JOB_FIELDS = [
  "record_id",
  "captured_at",
  "updated_at",
  "linkedin_job_id",
  "source_url",
  "page_title",
  "job_title",
  "about_job",
  "about_company",
  "company_industry",
  "company_employees",
  "applied"
];

function getSavedJobs() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get({ [JOB_STORAGE_KEY]: [] }, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(Array.isArray(result[JOB_STORAGE_KEY]) ? result[JOB_STORAGE_KEY] : []);
    });
  });
}

function setSavedJobs(jobs) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [JOB_STORAGE_KEY]: jobs }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

async function saveJob(job) {
  const jobs = await getSavedJobs();
  jobs.unshift(job);
  await setSavedJobs(jobs);
  return job;
}

async function updateJob(job) {
  const jobs = await getSavedJobs();
  const index = jobs.findIndex((item) => item.record_id === job.record_id);

  if (index === -1) {
    jobs.unshift(job);
  } else {
    jobs[index] = job;
  }

  await setSavedJobs(jobs);
  return job;
}

async function deleteJob(recordId) {
  const jobs = await getSavedJobs();
  await setSavedJobs(jobs.filter((job) => job.record_id !== recordId));
}

async function clearJobs() {
  await setSavedJobs([]);
}

function escapeCsvValue(value) {
  const stringValue = value === undefined || value === null ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function exportJobsToCsv(jobs) {
  const header = JOB_FIELDS.map(escapeCsvValue).join(",");
  const rows = jobs.map((job) => (
    JOB_FIELDS.map((field) => escapeCsvValue(field === "applied" ? normalizeAppliedValue(job[field]) : job[field])).join(",")
  ));

  return [header, ...rows].join("\r\n");
}

function exportJobsToJson(jobs) {
  const normalizedJobs = jobs.map((job) => (
    JOB_FIELDS.reduce((record, field) => {
      record[field] = field === "applied" ? normalizeAppliedValue(job[field]) : job[field] ?? "";
      return record;
    }, {})
  ));

  return JSON.stringify(normalizedJobs, null, 2);
}

function normalizeAppliedValue(value) {
  return value === true || value === "Yes" ? "Yes" : "No";
}

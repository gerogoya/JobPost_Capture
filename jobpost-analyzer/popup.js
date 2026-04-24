const form = document.getElementById("jobForm");
const messageEl = document.getElementById("message");
const duplicateMessageEl = document.getElementById("duplicateMessage");
const captureButton = document.getElementById("captureButton");
const saveButton = document.getElementById("saveButton");
const viewButton = document.getElementById("viewButton");
const exportButton = document.getElementById("exportButton");
const exportJsonButton = document.getElementById("exportJsonButton");
const clearButton = document.getElementById("clearButton");
const savedJobsList = document.getElementById("savedJobsList");
const savedCount = document.getElementById("savedCount");

const fields = {
  linkedinJobId: document.getElementById("linkedinJobId"),
  aboutJob: document.getElementById("aboutJob"),
  aboutCompany: document.getElementById("aboutCompany"),
  companyIndustry: document.getElementById("companyIndustry"),
  companyEmployees: document.getElementById("companyEmployees"),
  appliedYes: document.getElementById("appliedYes"),
  appliedNo: document.getElementById("appliedNo")
};

let currentRecord = createEmptyRecord();

document.addEventListener("DOMContentLoaded", async () => {
  resetForm();
  await renderSavedJobs();
});

captureButton.addEventListener("click", captureCurrentTab);
form.addEventListener("submit", saveCurrentRecord);
viewButton.addEventListener("click", renderSavedJobs);
exportButton.addEventListener("click", exportSavedJobs);
exportJsonButton.addEventListener("click", exportSavedJobsAsJson);
clearButton.addEventListener("click", clearAllSavedJobs);

function createRecordId() {
  if (crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyRecord() {
  const now = new Date().toISOString();

  return {
    record_id: createRecordId(),
    captured_at: now,
    updated_at: now,
    linkedin_job_id: "",
    source_url: "",
    page_title: "",
    job_title: "",
    about_job: "",
    about_company: "",
    company_industry: "",
    company_employees: "",
    applied: "No"
  };
}

function showMessage(text, type = "info") {
  messageEl.textContent = text;
  messageEl.className = `message visible ${type}`;
}

function clearMessage() {
  messageEl.textContent = "";
  messageEl.className = "message";
}

function showDuplicateMessage(text) {
  duplicateMessageEl.textContent = text;
  duplicateMessageEl.className = "duplicate-message visible";
}

function clearDuplicateMessage() {
  duplicateMessageEl.textContent = "";
  duplicateMessageEl.className = "duplicate-message";
}

function setBusy(isBusy) {
  captureButton.disabled = isBusy;
  saveButton.disabled = isBusy;
  viewButton.disabled = isBusy;
  exportButton.disabled = isBusy;
  exportJsonButton.disabled = isBusy;
  clearButton.disabled = isBusy;
}

async function captureCurrentTab() {
  setBusy(true);
  clearMessage();
  clearDuplicateMessage();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      throw new Error("No active browser tab was found.");
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    const now = new Date().toISOString();
    const pageTitle = result && result.page_title ? result.page_title : tab.title || "";
    const sourceUrl = result && result.source_url ? result.source_url : tab.url || "";
    const linkedInJobId = result && result.linkedin_job_id ? result.linkedin_job_id.trim() : "";
    const jobTitle = result && result.job_title ? result.job_title.trim() : "";
    const aboutJob = result && result.about_job ? result.about_job.trim() : "";
    const aboutCompany = result && result.about_company ? result.about_company.trim() : "";
    const companyIndustry = result && result.company_industry ? result.company_industry.trim() : "";
    const companyEmployees = result && result.company_employees ? result.company_employees.trim() : "";

    currentRecord = {
      ...createEmptyRecord(),
      captured_at: now,
      updated_at: now,
      linkedin_job_id: linkedInJobId,
      source_url: sourceUrl,
      page_title: pageTitle,
      job_title: jobTitle,
      about_job: aboutJob,
      about_company: aboutCompany,
      company_industry: companyIndustry,
      company_employees: companyEmployees,
      applied: "No"
    };

    const duplicate = await findDuplicateJob(currentRecord);
    if (duplicate) {
      currentRecord = { ...duplicate };
      populateForm(currentRecord);
      showDuplicateMessage("This LinkedIn job post is already saved. Existing record loaded for editing.");
      await renderSavedJobs();
      return;
    }

    populateForm(currentRecord);
    showMessage("LinkedIn fields captured. Review them, then save.", "success");
  } catch (error) {
    showMessage(`Capture failed: ${friendlyError(error)}`, "error");
  } finally {
    setBusy(false);
  }
}

async function saveCurrentRecord(event) {
  event.preventDefault();
  setBusy(true);
  clearMessage();
  clearDuplicateMessage();

  try {
    currentRecord = readFormIntoRecord(currentRecord);
    validateRecord(currentRecord);
    const duplicate = await findDuplicateJob(currentRecord);

    if (duplicate && duplicate.record_id !== currentRecord.record_id) {
      currentRecord = { ...duplicate };
      populateForm(currentRecord);
      showDuplicateMessage("This LinkedIn job post is already saved. Existing record loaded for editing.");
      await renderSavedJobs();
      return;
    }

    await updateJob(currentRecord);
    showMessage("Job post saved locally.", "success");
    await renderSavedJobs();
  } catch (error) {
    showMessage(`Save failed: ${friendlyError(error)}`, "error");
  } finally {
    setBusy(false);
  }
}

function resetForm() {
  clearDuplicateMessage();
  currentRecord = createEmptyRecord();
  populateForm(currentRecord);
}

function populateForm(record) {
  fields.linkedinJobId.value = record.linkedin_job_id || "";
  fields.aboutJob.value = record.about_job || record.raw_job_post_text || "";
  fields.aboutCompany.value = record.about_company || "";
  fields.companyIndustry.value = record.company_industry || "";
  fields.companyEmployees.value = record.company_employees || "";
  fields.appliedYes.checked = record.applied === "Yes" || record.applied === true;
  fields.appliedNo.checked = !fields.appliedYes.checked;
}

function readFormIntoRecord(record) {
  return {
    ...record,
    updated_at: new Date().toISOString(),
    linkedin_job_id: fields.linkedinJobId.value.trim(),
    about_job: fields.aboutJob.value.trim(),
    about_company: fields.aboutCompany.value.trim(),
    company_industry: fields.companyIndustry.value.trim(),
    company_employees: fields.companyEmployees.value.trim(),
    applied: fields.appliedYes.checked ? "Yes" : "No"
  };
}

function validateRecord(record) {
  const missingFields = [];

  if (!record.record_id) missingFields.push("record_id");
  if (!record.captured_at) missingFields.push("captured_at");
  if (!record.linkedin_job_id) missingFields.push("linkedin_job_id");
  if (!record.source_url) missingFields.push("source_url");
  if (!record.about_job) missingFields.push("about_job");

  if (missingFields.length > 0) {
    throw new Error(`Required field missing: ${missingFields.join(", ")}.`);
  }
}

async function renderSavedJobs() {
  try {
    const jobs = await getSavedJobs();
    savedCount.textContent = String(jobs.length);
    savedJobsList.textContent = "";

    if (jobs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No saved jobs yet.";
      savedJobsList.appendChild(empty);
      return;
    }

    for (const job of jobs) {
      savedJobsList.appendChild(createSavedJobElement(job));
    }
  } catch (error) {
    showMessage(`Could not load saved jobs: ${friendlyError(error)}`, "error");
  }
}

function createSavedJobElement(job) {
  const item = document.createElement("article");
  item.className = "saved-job";

  const title = document.createElement("p");
  title.className = "saved-job-title";
  title.textContent = job.job_title || job.page_title || "LinkedIn job post";

  const meta = document.createElement("p");
  meta.className = "saved-job-meta";
  meta.textContent = [
    job.company_industry || "Unknown industry",
    job.company_employees || "Unknown employees",
    `Applied ${job.applied === "Yes" || job.applied === true ? "Yes" : "No"}`,
    job.linkedin_job_id ? `ID ${job.linkedin_job_id}` : "No LinkedIn ID",
    formatDate(job.captured_at)
  ].join(" | ");

  const actions = document.createElement("div");
  actions.className = "saved-job-actions";

  const editButton = document.createElement("button");
  editButton.className = "small-button";
  editButton.type = "button";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => {
    clearDuplicateMessage();
    currentRecord = { ...job };
    populateForm(currentRecord);
    showMessage("Saved job loaded for editing.", "info");
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "small-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", async () => {
    await deleteSavedJob(job.record_id);
  });

  actions.append(editButton, deleteButton);
  item.append(title, meta, actions);

  return item;
}

async function deleteSavedJob(recordId) {
  try {
    await deleteJob(recordId);

    if (currentRecord.record_id === recordId) {
      resetForm();
    }

    showMessage("Saved job deleted.", "success");
    await renderSavedJobs();
  } catch (error) {
    showMessage(`Delete failed: ${friendlyError(error)}`, "error");
  }
}

async function clearAllSavedJobs() {
  const confirmed = confirm("Clear all saved job posts? This cannot be undone.");
  if (!confirmed) return;

  try {
    clearDuplicateMessage();
    await clearJobs();
    resetForm();
    showMessage("All saved jobs cleared.", "success");
    await renderSavedJobs();
  } catch (error) {
    showMessage(`Clear failed: ${friendlyError(error)}`, "error");
  }
}

async function exportSavedJobs() {
  await downloadSavedJobs({
    extension: "csv",
    mimeType: "text/csv;charset=utf-8",
    serialize: exportJobsToCsv,
    successMessage: "CSV export started."
  });
}

async function exportSavedJobsAsJson() {
  await downloadSavedJobs({
    extension: "json",
    mimeType: "application/json;charset=utf-8",
    serialize: exportJobsToJson,
    successMessage: "JSON export started."
  });
}

async function downloadSavedJobs({ extension, mimeType, serialize, successMessage }) {
  try {
    const jobs = await getSavedJobs();

    if (jobs.length === 0) {
      showMessage("There are no saved jobs to export.", "info");
      return;
    }

    const content = serialize(jobs);
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `jobpost-capture-${date}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showMessage(successMessage, "success");
  } catch (error) {
    showMessage(`Export failed: ${friendlyError(error)}`, "error");
  }
}

async function findDuplicateJob(job) {
  if (!job.linkedin_job_id) return null;

  const jobs = await getSavedJobs();
  return jobs.find((savedJob) => savedJob.linkedin_job_id === job.linkedin_job_id) || null;
}

function formatDate(value) {
  if (!value) return "Unknown date";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function friendlyError(error) {
  const message = error && error.message ? error.message : String(error);

  if (message.includes("Cannot access contents of url")) {
    return "Chrome does not allow extensions to capture this page. Try a normal job post page.";
  }

  if (message.includes("The extensions gallery cannot be scripted")) {
    return "Chrome extension pages cannot be captured.";
  }

  return message;
}

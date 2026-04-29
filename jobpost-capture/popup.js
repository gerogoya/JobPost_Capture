const form = document.getElementById("jobForm");
const startScreen = document.getElementById("startScreen");
const captureScreen = document.getElementById("captureScreen");
const startButton = document.getElementById("startButton");
const messageEl = document.getElementById("message");
const duplicateMessageEl = document.getElementById("duplicateMessage");
const captureButton = document.getElementById("captureButton");
const saveButton = document.getElementById("saveButton");
const exportButton = document.getElementById("exportButton");
const exportJsonButton = document.getElementById("exportJsonButton");
const clearButton = document.getElementById("clearButton");
const savedJobsList = document.getElementById("savedJobsList");
const savedCount = document.getElementById("savedCount");
const LINKEDIN_RECOMMENDED_JOBS_URL = "https://www.linkedin.com/jobs/collections/recommended/";
const RECOMMENDED_READY_POLL_MS = 500;
const RECOMMENDED_READY_TIMEOUT_MS = 20000;

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
let isBusy = false;
let isWaitingForInitialRecommendedJob = false;
let shouldCaptureFirstRecommendedJob = false;

document.addEventListener("DOMContentLoaded", async () => {
  resetForm();
  await initializeScreen();
  await renderSavedJobs();
});

startButton.addEventListener("click", openJobListingsAndStart);
captureButton.addEventListener("click", captureCurrentTab);
form.addEventListener("submit", saveCurrentRecord);
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

async function initializeScreen() {
  const tab = await getActiveTab();
  const activeUrl = tab && tab.id ? await getTabUrl(tab) : "";
  const isSupportedPage = isSupportedLinkedInJobsUrl(activeUrl)
    || Boolean(tab && tab.id && await getLinkedInJobsPageStatus(tab.id));
  showCaptureScreen(isSupportedPage);
}

function showCaptureScreen(shouldShowCaptureScreen) {
  startScreen.classList.toggle("hidden", shouldShowCaptureScreen);
  captureScreen.classList.toggle("hidden", !shouldShowCaptureScreen);
}

async function openJobListingsAndStart() {
  startButton.disabled = true;

  try {
    const tab = await getActiveTab();
    if (tab && tab.id) {
      await chrome.tabs.update(tab.id, { url: LINKEDIN_RECOMMENDED_JOBS_URL });
    }

    showCaptureScreen(true);
    isWaitingForInitialRecommendedJob = true;
    await waitForInitialRecommendedJob(tab && tab.id ? tab.id : null);
  } catch (error) {
    showCaptureScreen(false);
    startButton.disabled = false;
    showMessage(`Could not open LinkedIn jobs: ${friendlyError(error)}`, "error");
  }
}

async function waitForInitialRecommendedJob(tabId) {
  setCaptureAvailability(false);
  showMessage("Loading LinkedIn recommended jobs...", "info");

  try {
    const startedAt = Date.now();

    while (Date.now() - startedAt < RECOMMENDED_READY_TIMEOUT_MS) {
      const tab = await getActiveTab();

      if (tab && tab.id && (!tabId || tab.id === tabId)) {
        const activeUrl = await getTabUrl(tab);
        if (!isRecommendedLinkedInJobsUrl(activeUrl)) {
          await delay(RECOMMENDED_READY_POLL_MS);
          continue;
        }

        const currentJobStatus = await getVisibleCurrentRecommendedJobStatus(tab.id);
        if (currentJobStatus.isReady) {
          isWaitingForInitialRecommendedJob = false;
          shouldCaptureFirstRecommendedJob = false;
          setCaptureAvailability(true);
          clearMessage();
          return;
        }

        const isFirstRecommendedJobReady = !currentJobStatus.currentJobId
          && await hasFirstRecommendedJobCard(tab.id);
        if (isFirstRecommendedJobReady) {
          isWaitingForInitialRecommendedJob = false;
          shouldCaptureFirstRecommendedJob = true;
          setCaptureAvailability(true);
          clearMessage();
          return;
        }
      }

      await delay(RECOMMENDED_READY_POLL_MS);
    }

    showMessage("LinkedIn is still loading the first recommended job. Try Capture again in a moment.", "info");
  } catch (error) {
    showMessage(`Could not confirm LinkedIn job list readiness: ${friendlyError(error)}`, "error");
  } finally {
    isWaitingForInitialRecommendedJob = false;
    setCaptureAvailability(true);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function getTabUrl(tab) {
  if (!tab || !tab.id) return "";
  if (tab.url && isSupportedLinkedInJobsUrl(tab.url)) return tab.url;

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.location.href
    });

    if (typeof result === "string" && result) return result;
  } catch {
    // Fall back to Chrome's tab URL when script injection is not available yet.
  }

  return tab.url || "";
}

async function getLinkedInJobsPageStatus(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const isLinkedInJobsPage = window.location.origin === "https://www.linkedin.com"
          && (
            window.location.pathname.startsWith("/jobs/search-results/")
            || window.location.pathname.startsWith("/jobs/collections/recommended/")
            || window.location.pathname.startsWith("/jobs/view/")
          );

        return {
          isLinkedInJobsPage,
          href: window.location.href
        };
      }
    });

    return result && result.isLinkedInJobsPage ? result : null;
  } catch {
    return null;
  }
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

function setBusy(nextIsBusy) {
  isBusy = nextIsBusy;
  captureButton.disabled = isBusy || isWaitingForInitialRecommendedJob;
  saveButton.disabled = isBusy;
  exportButton.disabled = isBusy;
  exportJsonButton.disabled = isBusy;
  clearButton.disabled = isBusy;
}

function setCaptureAvailability(isAvailable) {
  captureButton.disabled = !isAvailable || isBusy;
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function getVisibleCurrentRecommendedJobStatus(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        function getLinkedInJobIdFromUrl(sourceUrl) {
          try {
            const url = new URL(sourceUrl);
            const currentJobId = url.searchParams.get("currentJobId");
            return currentJobId && /^\d+$/.test(currentJobId) ? currentJobId : "";
          } catch {
            return "";
          }
        }

        function getRecommendedJobsList() {
          const sentinel = document.querySelector("div[data-results-list-top-scroll-sentinel]");
          if (!sentinel) return null;

          let sibling = sentinel.nextElementSibling;
          while (sibling) {
            if (sibling.matches("ul")) return sibling;
            sibling = sibling.nextElementSibling;
          }

          return sentinel.parentElement ? sentinel.parentElement.querySelector("ul") : null;
        }

        function isElementInViewport(element) {
          if (!element) return false;

          const rect = element.getBoundingClientRect();
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

          return rect.width > 0
            && rect.height > 0
            && rect.bottom > 0
            && rect.right > 0
            && rect.top < viewportHeight
            && rect.left < viewportWidth;
        }

        function findCurrentJobListItem(currentJobId) {
          const selectors = [
            `li[data-occludable-job-id="${currentJobId}"]`,
            `[data-job-id="${currentJobId}"]`,
            `a[href*="currentJobId=${currentJobId}"]`,
            `a[href*="/jobs/view/${currentJobId}"]`
          ];
          const list = getRecommendedJobsList();

          for (const selector of selectors) {
            const match = list ? list.querySelector(selector) : document.querySelector(selector);
            const listItem = match && match.closest ? match.closest("li[data-occludable-job-id]") : null;
            if (listItem) return listItem;
            if (match && match.matches && match.matches("li[data-occludable-job-id]")) return match;
          }

          return null;
        }

        function getVisibleJobDetailsPanel() {
          const selectors = [
            ".jobs-search__job-details",
            ".jobs-details",
            ".job-view-layout",
            ".job-details-jobs-unified-top-card",
            "[data-job-id]"
          ];

          return selectors
            .map((selector) => document.querySelector(selector))
            .find((element) => element && isElementInViewport(element)) || null;
        }

        const currentJobId = getLinkedInJobIdFromUrl(window.location.href);
        if (!currentJobId) {
          return { currentJobId: "", isReady: false };
        }

        const currentJob = findCurrentJobListItem(currentJobId);
        const currentJobCardIsVisible = Boolean(
          currentJob
            && isElementInViewport(currentJob)
            && currentJob.querySelector("[data-job-id], a[href*='/jobs/view/']")
        );
        const visibleDetailsPanel = getVisibleJobDetailsPanel();

        return {
          currentJobId,
          isReady: currentJobCardIsVisible || Boolean(visibleDetailsPanel)
        };
      }
    });

    return result || { currentJobId: "", isReady: false };
  } catch {
    return { currentJobId: "", isReady: false };
  }
}

async function hasFirstRecommendedJobCard(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const sentinel = document.querySelector("div[data-results-list-top-scroll-sentinel]");
        const list = sentinel
          ? sentinel.parentElement && sentinel.parentElement.querySelector("ul")
          : document.querySelector("ul");
        const firstJob = list
          ? list.querySelector('li[data-occludable-job-id]:not(.jobs-search-results__job-card-search--generic-occludable-area)')
          : document.querySelector('li[data-occludable-job-id]:not(.jobs-search-results__job-card-search--generic-occludable-area)');
        return Boolean(firstJob && firstJob.querySelector("[data-job-id], a[href*='/jobs/view/']"));
      }
    });

    return Boolean(result);
  } catch {
    return false;
  }
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

    const activeUrl = await getTabUrl(tab);
    const pageStatus = isSupportedLinkedInJobsUrl(activeUrl)
      ? null
      : await getLinkedInJobsPageStatus(tab.id);

    if (!isSupportedLinkedInJobsUrl(activeUrl) && !pageStatus) {
      throw new Error("Open a LinkedIn job post or your recommended LinkedIn jobs page before capturing.");
    }

    const captureUrl = pageStatus && pageStatus.href ? pageStatus.href : activeUrl;

    if (shouldCaptureFirstRecommendedJob && isRecommendedLinkedInJobsUrl(captureUrl)) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          window.__JOBPOST_CAPTURE_FIRST_RECOMMENDED__ = true;
        }
      });
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    shouldCaptureFirstRecommendedJob = false;

    const now = new Date().toISOString();
    const pageTitle = result && result.page_title ? result.page_title : tab.title || "";
    const sourceUrl = result && result.source_url ? result.source_url : captureUrl || "";
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
      showDuplicateMessage("This LinkedIn job post is already saved.");
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

function isSupportedLinkedInJobsUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://www.linkedin.com"
      && (
        url.pathname.startsWith("/jobs/search-results/")
        || url.pathname.startsWith("/jobs/collections/recommended/")
        || url.pathname.startsWith("/jobs/view/")
      );
  } catch {
    return false;
  }
}

function isRecommendedLinkedInJobsUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://www.linkedin.com"
      && url.pathname.startsWith("/jobs/collections/recommended/");
  } catch {
    return false;
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
      showDuplicateMessage("This LinkedIn job post is already saved.");
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

  const deleteButton = document.createElement("button");
  deleteButton.className = "small-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", async () => {
    await deleteSavedJob(job.record_id);
  });

  actions.append(deleteButton);
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

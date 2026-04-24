function getTextFromSelector(selector) {
  const element = document.querySelector(selector);
  return element && element.innerText ? element.innerText.trim() : "";
}

function getTextFromLastSelector(selector) {
  const elements = Array.from(document.querySelectorAll(selector));
  const element = elements[elements.length - 1];
  return element && element.innerText ? element.innerText.trim() : "";
}

function getTextFromFirstSelector(selector) {
  const element = document.querySelector(selector);
  return element && element.innerText ? element.innerText.trim() : "";
}

function getTextFromXPath(xpath) {
  const result = document.evaluate(
    xpath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  );
  return getTextFromNode(result.singleNodeValue);
}

function getTextFromNode(node) {
  if (!node) return "";
  const text = node.innerText || node.textContent || node.nodeValue || "";
  return text.trim();
}

function firstAvailableText(getters) {
  for (const getter of getters) {
    const text = getter();
    if (text) return text;
  }

  return "";
}

function getCompanyInfoScopes() {
  const selectors = [
    'div[componentkey^="JobDetails_AboutTheCompany"]',
    "div.jobs-company__box"
  ];
  const scopes = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));

  return Array.from(new Set(scopes));
}

function getTextLinesFromNode(node) {
  return getTextFromNode(node)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isCompanyInfoLabel(line) {
  return /^(about the company|company size|employees|founded|headquarters|industry|specialties|website)$/i.test(line);
}

function getScopedCompanyInfoValue(labelPattern, valuePattern) {
  for (const scope of getCompanyInfoScopes()) {
    const lines = getTextLinesFromNode(scope);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const sameLineValue = line.replace(labelPattern, "").trim();

      if (sameLineValue !== line && sameLineValue && (!valuePattern || valuePattern.test(sameLineValue))) {
        return sameLineValue;
      }

      if (!labelPattern.test(line)) continue;

      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const candidate = lines[nextIndex];
        if (isCompanyInfoLabel(candidate)) break;
        if (!valuePattern || valuePattern.test(candidate)) return candidate;
      }
    }
  }

  return "";
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function countCapturedFields(record) {
  return [
    record.linkedin_job_id,
    record.job_title,
    record.about_job,
    record.about_company,
    record.company_industry,
    record.company_employees
  ].filter(Boolean).length;
}

function hasCoreJobFields(record) {
  return Boolean(record.linkedin_job_id && record.job_title && record.about_job);
}

function getLinkedInJobIdFromUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const currentJobId = url.searchParams.get("currentJobId");

    if (currentJobId && /^\d+$/.test(currentJobId)) {
      return currentJobId;
    }

    const viewMatch = url.pathname.match(/\/jobs\/view\/(\d+)/);
    if (viewMatch) {
      return viewMatch[1];
    }
  } catch {
    return "";
  }

  return "";
}

function getLinkedInJobIdFromPageText() {
  const html = document.documentElement ? document.documentElement.innerHTML : "";
  const match = html.match(/urn:li:jobPosting:(\d+)/);
  return match ? match[1] : "";
}

function getCompanyIndustryFromInlineInfoContainer() {
  const firstInlineInfo = document.querySelector("span.jobs-company__inline-information");
  if (!firstInlineInfo || !firstInlineInfo.parentElement) return "";

  const container = firstInlineInfo.parentElement.cloneNode(true);
  container
    .querySelectorAll("span.jobs-company__inline-information")
    .forEach((element) => element.remove());

  return getTextFromNode(container)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !/employees|on linkedin/i.test(line)) || "";
}

function getCompanyIndustryFromCompanyInfoScope() {
  return getScopedCompanyInfoValue(/^industry:?\s*/i);
}

function getCompanyEmployeesFromCompanyInfoScope() {
  return getScopedCompanyInfoValue(/^(company size|employees):?\s*/i, /employees/i);
}

function captureJobPostFromPage() {
  const companyDescriptionSelector = 'p[class*="jobs-company__company-description"]';
  const sourceUrl = window.location.href;

  return {
    linkedin_job_id: firstAvailableText([
      () => getLinkedInJobIdFromUrl(sourceUrl),
      () => getLinkedInJobIdFromPageText()
    ]),
    job_title: firstAvailableText([
      () => getTextFromSelector(".job-details-jobs-unified-top-card__job-title h1 a"),
      () => getTextFromSelector(".job-details-jobs-unified-top-card__job-title h1"),
      () => getTextFromSelector(".job-details-jobs-unified-top-card__job-title a")
    ]),
    about_job: firstAvailableText([
      () => getTextFromSelector('[data-sdui-component="com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob"]'),
      () => getTextFromSelector("article.jobs-description__container")
    ]),
    about_company: firstAvailableText([
      () => getTextFromLastSelector('[data-testid="expandable-text-box"]'),
      () => getTextFromSelector(companyDescriptionSelector)
    ]),
    company_industry: firstAvailableText([
      () => getCompanyIndustryFromCompanyInfoScope(),
      () => getTextFromXPath('//*[@id="workspace"]/div/div/div[1]/div/div/div/div[3]/div[8]/div/div/div/div/div[3]/div[2]/div[1]'),
      () => getCompanyIndustryFromInlineInfoContainer(),
      () => getTextFromSelector(companyDescriptionSelector)
    ]),
    company_employees: firstAvailableText([
      () => getCompanyEmployeesFromCompanyInfoScope(),
      () => getTextFromXPath('//*[@id="workspace"]/div/div/div[1]/div/div/div/div[3]/div[8]/div/div/div/div/div[3]/div[2]/div[3]/p'),
      () => getTextFromFirstSelector("span.jobs-company__inline-information")
    ]),
    page_title: document.title || "",
    source_url: sourceUrl
  };
}

async function captureJobPostWhenReady() {
  const maxAttempts = 12;
  const retryDelayMs = 300;
  let bestRecord = captureJobPostFromPage();
  let bestScore = countCapturedFields(bestRecord);

  for (let attempt = 1; attempt < maxAttempts; attempt += 1) {
    if (document.readyState === "complete" && hasCoreJobFields(bestRecord) && bestScore >= 5) {
      break;
    }

    await delay(retryDelayMs);

    const nextRecord = captureJobPostFromPage();
    const nextScore = countCapturedFields(nextRecord);

    if (nextScore >= bestScore) {
      bestRecord = nextRecord;
      bestScore = nextScore;
    }
  }

  return bestRecord;
}

captureJobPostWhenReady();

# JobPost Capture

JobPost Capture is a Chrome Extension MVP for manually capturing selected LinkedIn job post information from the current browser tab and saving it locally for later career research, resume optimization, and QA industry analysis.

This is not a scraper, crawler, bot, or auto-apply tool. It captures only the current page when you explicitly click the capture button.

## Features

- Manual capture from the active LinkedIn job post tab
- Captures About the Job from LinkedIn's `data-sdui-component` job description container
- Falls back to `article.jobs-description__container` for other LinkedIn job page layouts
- Captures About the Company from the last `data-testid="expandable-text-box"` container
- Falls back to paragraphs whose class contains `jobs-company__company-description`
- Captures Company Industry and Company Employees from the configured LinkedIn page paths
- Captures Job Title from the LinkedIn top card and uses it as the saved job title
- Captures the LinkedIn job ID from `currentJobId`, `/jobs/view/<id>/`, or `urn:li:jobPosting:<id>`
- Detects when the current LinkedIn job post is already saved and loads the existing record
- Tracks whether you already applied to the job with an `Applied` Yes/No field
- Editable preview form before saving
- Local persistence with `chrome.storage.local`
- Saved job list with edit and delete actions
- Clear all saved records after confirmation
- CSV and JSON export with all fields in the data model
- No AI API calls
- No API keys
- No automated browsing, clicking, applying, or bulk scraping

## Data Fields Captured

- `record_id`
- `captured_at`
- `updated_at`
- `linkedin_job_id`
- `source_url`
- `page_title`
- `job_title`
- `about_job`
- `about_company`
- `company_industry`
- `company_employees`
- `applied`

## Load the Extension in Chrome Developer Mode

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click Load unpacked
4. Select the `jobpost-analyzer` folder

## How to Use

1. Open a LinkedIn job post page.
2. Click the JobPost Capture extension icon.
3. Click Capture Job Post.
4. Review or edit the fields.
5. Click Save.
6. Click View Saved Jobs to review stored records.
7. Click Export CSV or Export JSON when needed.

## Limitations

- Manual LinkedIn capture only
- No AI extraction yet
- No cloud sync yet
- No auto-apply
- No bulk scraping
- LinkedIn page layout changes may require selector updates
- Some browser-protected pages, such as Chrome system pages, cannot be captured

## Future Improvements

- AI extraction
- Google Sheets export
- Resume match scoring
- ATS keyword extraction
- Job post deduplication
- Dashboard and reporting

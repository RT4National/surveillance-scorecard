# Scorecard staff guide

Open `/scorecard/staff` and sign in with your staff identity. Start a draft from the current publication, or open the draft you are working on.

## Add an official roll call

1. In **Votes to score**, open **Add a roll call from an official source**. Paste a House Clerk vote page or XML link, or a Senate roll-call page or XML link.
2. Choose **Read roll call** and check the bill, question, date, chamber, and ballot count. If any legislators are missing, add them to the draft roster and read the roll call again. Senate votes require a reviewed LIS-to-Bioguide crosswalk.
3. Enter the short title, president and party, reform position, weight, topic, and rationale. Choose **Add reviewed roll call to draft**. The draft stores the ballots and the source capture with its digest.
4. Check the evidence cutoff, then save the draft. Open **Review & publish** and inspect any grade changes. Ask another authorized staff member to review it. An authorized publisher can publish after approval.

## Add bill support

Open **Add bill support from Congress.gov** under **Votes to score**, and enter the Congress and bill number, such as **119** and **H.R. 2**. Read the bill, check the supporter count, and enter the editorial details. Choose **Yes** if sponsorship supports reform, or **No** if it counts against reform. The sponsor and current cosponsors receive records. Withdrawn cosponsors are excluded. Save and submit the draft through the same review process.

## Adjust or retire an item

Select an item under **Votes to score**. When you change its weight or reform position, open **Per-legislator impact** to compare grades and alignment within the draft. To retire an item, choose **Preview retirement** and inspect the proposed impact. Confirm to remove the item and its records from the draft. Save and submit the draft through **Review & publish**.

## Review a scheduled roster change

Under **Legislators**, open **Scheduled roster update** and choose **Preview latest roster capture**. Review additions and updates. Legislators absent from the capture stay on the draft roster until staff decide their status. Choose **Apply roster changes to draft**, save, and submit it for review. Applying a roster capture preserves the draft’s evidence cutoff.

## Group repeated votes

In **Votes to score**, open **Repeated-vote series**. Name the reform question, choose a chamber, select at least two roll calls, and explain why the questions are comparable. Save the series in the draft and send it through **Review & publish**. Start with the Section 702 reauthorization and its reform amendments once staff have reviewed which roll calls test the same question.

## Add an official contact link

Under **Legislators**, choose a member and enter the office’s official HTTPS contact page. The link appears in the share panel after the draft is reviewed and published. Clear the field if the scorecard should omit the link.

## Environment setup

The intake endpoint requires real staff authentication. Configure Cloudflare Access and `STAFF_ROLES` before enabling the staff workflow. Never set `STAFF_OPEN_STAGING` in production.

Set `SENATE_LIS_CROSSWALK` for the Worker environment that will import Senate votes. Its value is a reviewed JSON object that maps Senate LIS IDs to Bioguide IDs. House intake can run without this setting.

Set `CONGRESS_API_KEY` as a Worker secret in each environment that imports bill support. The browser and stored source URLs do not receive the key.

For scheduled roster storage, apply migration `0003_staged_roster.sql`, set a dedicated `ROSTER_INGESTION_TOKEN` secret in both the Worker and GitHub Actions, and set the repository variable `SCORECARD_ROSTER_URL` to the Worker’s HTTPS `/scorecard/api/ingestion/roster` endpoint. The workflow stores the newest complete capture and its original response pages in D1 and retains the GitHub review artifact for 14 days. The token can send captures only. Staff Access controls reading and applying them.

# Scorecard staff guide

Open `/scorecard/staff` and sign in with your staff identity. Start a draft from the current publication, or open the draft you are working on.

## Add an official roll call

1. In **Votes to score**, open **Add a roll call from an official source**. Paste a House Clerk vote page or XML link, or a Senate roll-call page or XML link.
2. Choose **Read roll call** and check the bill, question, date, chamber, and ballot count. If any legislators are missing, add them to the draft roster and read the roll call again. Senate votes require a reviewed LIS-to-Bioguide crosswalk.
3. Enter the short title, president and party, reform position, weight, topic, and rationale. Choose **Add reviewed roll call to draft**. The draft stores the ballots and the source capture with its digest.
4. Check the evidence cutoff, then save the draft. Open **Review & publish** and inspect any grade changes. Ask another authorized staff member to review it. An authorized publisher can publish after approval.

## Environment setup

The intake endpoint requires real staff authentication. Configure Cloudflare Access and `STAFF_ROLES` before enabling the staff workflow. Never set `STAFF_OPEN_STAGING` in production.

Set `SENATE_LIS_CROSSWALK` for the Worker environment that will import Senate votes. Its value is a reviewed JSON object that maps Senate LIS IDs to Bioguide IDs. House intake can run without this setting.

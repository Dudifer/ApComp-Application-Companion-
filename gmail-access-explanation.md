# What ApComp does with Gmail access — explanation script

Use this as talking points for a Google verification demo/video, or paste sections of it directly into the verification form. It walks through what the code actually does, in the order it happens, so every claim here can be checked against the source.

## The one-sentence version

ApComp is a job-application tracker. If a user connects Gmail, the app scans for emails that look like job-application updates (submitted, interview, offer, rejection) and turns them into rows in the user's own application list, so they don't have to log every update by hand. It only ever reads mail — it can't send, delete, or modify anything in the user's inbox.

## Why gmail.readonly specifically

The app requests exactly one scope: `https://www.googleapis.com/auth/gmail.readonly`. That's read-only — there is no code path anywhere in the app that can send an email, delete an email, modify a label, or touch the inbox in any way. The only thing the access token can do is fetch message content.

## Step by step, what the code does

**1. Connecting.** A user clicks "Connect Gmail" and goes through Google's standard OAuth consent screen. The app requests offline access (so it can refresh the token without asking the user to re-approve constantly) and stores the resulting access/refresh tokens in a database row tied to that one user's account. That row is deleted automatically if the user's account is ever deleted.

**2. Building a narrow search, not "read everything."** Before fetching any mail, the app builds a specific Gmail search query — it does not scan the whole inbox. The query is restricted to the last 6 months, and to messages containing at least one job-application-related keyword: things like "application," "interview," "offer," "candidate," "thank you for applying," "your resume," "next steps." On top of that, it explicitly excludes generic job-alert spam by subject line ("jobs you might like," "job alert," "apply now," etc.) and by sender (LinkedIn, Indeed, ZipRecruiter, Glassdoor, and similar job boards). So the query is deliberately narrowed to "does this look like a personal update about an application I submitted," not "any email mentioning a job."

**3. Fetching matching messages.** The app asks Gmail's API for up to 300 messages matching that query, then fetches each one's sender, subject, date, and body.

**4. Classifying locally — no AI, no third party.** Each email's subject and body are checked against a plain keyword list in the app's own code (things like "pleased to offer" → Offer, "unfortunately" / "not moving forward" → Rejected, "schedule a call" / "next steps" → Interview). This is ordinary string matching that runs entirely on the app's own server. The email content is never sent to any external service, never passed to an AI model, and never leaves the server for this step.

**5. What actually gets saved.** Only a small structured summary is written to the database: the company name, the job title (parsed from the subject line), the detected status, the email's subject line, its date, and the Gmail message ID (so the user can click through and open the original email in Gmail if they want). The full email body is held in memory just long enough to run the keyword check in step 4, and is discarded immediately after — it is never written to the database.

**6. Where it lives.** That summary becomes one row in the user's own private application list. It's visible only to that user, through their own authenticated session. There's no cross-user access, no shared database of application data, and no export of this data anywhere else.

**7. How often this runs.** Once connected, the app checks for new matching emails at most once every 24 hours per user, and only for users who've explicitly connected Gmail. A user can also trigger a manual refresh.

## What this does not do

It does not read the entire inbox — only the narrow, keyword-matched search described above. It does not store raw email bodies. It does not send analytics, email content, or personal data to any third party or ad network. It does not use email content to train any model. It cannot send mail, delete mail, or modify the user's inbox in any way, because the scope granted is read-only.

## Two things worth fixing before you record/submit

While pulling this together I checked the current code against these claims, and found two loose ends worth tightening up first so the demo matches the code exactly:

1. **A debug log file.** `gmail.service.ts` currently writes each processed email's detected status and subject line to a local file (`email-parse-log.txt`) on the server, unconditionally — including in production. It doesn't log the email body, and it's not shown to any user, but it's an extra untracked copy of subject lines outside the database, with no cleanup. Worth removing (or gating behind a dev-only flag) before you finalize this explanation, so "we only persist a structured summary" is fully accurate.
2. **No in-app "disconnect Gmail" button yet.** Right now, disconnecting only works through Google's own account permissions page (myaccount.google.com/permissions), not from inside the app. That's still a legitimate revocation path and satisfies Google's requirement that users can revoke access, but reviewers sometimes look favorably on an in-app disconnect option too. Happy to add one if you want it before submitting.

Let me know if you'd like me to make either of those changes now.

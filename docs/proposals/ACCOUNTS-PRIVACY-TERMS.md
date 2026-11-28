# Proposal: privacy and terms wording for when accounts open

**Status: proposal only. It changes no page.** `src/pages/privacy.astro` and `src/pages/terms.astro` are Christian's to
approve (both carry a "change it only with Christian's approval" comment, privacy.astro:6-8 and terms.astro:6-7).
Everything below comes from the repository as of `origin/staging` (ece541f). Where the code or docs do not say, the item
is in section 4, not in the proposed text.

How to read the citations: `file:line` points at the line that supports the row. Migration files are in
`supabase/migrations/`, shortened to their timestamp prefix.

## 1. Inventory of what an account stores

"Student" means a signed-in account holder. "Christian" means whoever holds the Supabase service role or dashboard
access; the code gives the admin console only the flag inbox (`20261102153000`:93-209), so no screen reads the other
tables. Retention is "until the account is deleted" only where the cited code says the row cascades.

| Kind of data | What is stored | Where | Why | Who can read it | How long | Student export / delete |
| --- | --- | --- | --- | --- | --- | --- |
| Email address | The address used to sign up or sign in. profiles holds no email. | Supabase Auth (`auth.users`) | Sign in, confirm the email, reset a password | The student (through Auth). Christian through the Supabase dashboard (not verified, see 4.1). | Until the account is deleted (`20261102110000`:1-12) | Export: yes, added from Auth (`exportload.ts`:7-8, `exportdata.ts`:256). Delete: delete my account. |
| Password | Chosen at email sign-up, at least 10 characters. Google accounts sign in with Google. | Supabase Auth | Email-and-password sign-in | Not readable by the student or the site. How Supabase stores it is not in the repo (4.2). | Until the account is deleted | Delete: delete my account. Not in the export. |
| Display name | 1 to 50 characters, no control characters. Typed at email sign-up, or set on the account page. Empty for Google accounts until set. | Database table `profiles` (`display_name`) | Shown to the student | The student (select policy, `20261101060100`:27-31). Christian. | Until the account is deleted | Change on /account (`AccountSettings.tsx`:139) via `update_display_name` (`20261102140000`:1-7). Export: yes. Delete: delete my account. |
| Name-change counter | When the current hour of name changes began, and how many were made in it | `profiles` (`name_change_window_start`, `name_changes_in_window`) | Limit how often the name can change | The student (own row). Christian. | Overwritten, never piles up; deleted with the profile (`20261102140000`:8-12) | Export: yes (`exportload.ts`:66). Delete: with the account. |
| Account created date | When the profile row was made | `profiles` (`created_at`) | Housekeeping | The student. Christian. | Until the account is deleted | Export: yes (`exportload.ts`:66). |
| What Google shares at sign-in | With Google sign-in: the scopes `openid`, `userinfo.email`, `userinfo.profile` are requested. The export code says Auth's record holds, for Google, name, profile-photo link, Google account id, email and whether it is verified. | Supabase Auth (identity record), not the site's tables | Sign in with Google | The student sees it in the export. Christian through the dashboard (4.1). | Until the account is deleted | Export: yes (`exportload.ts`:11-16). Delete: delete my account. Google's own records stay with Google. |
| Sign-in sessions | One per sign-in: when it started and updated, when it ends, the browser's user agent and the IP address (as plain text) | Supabase Auth (`auth.sessions`), read back only through `my_sessions()` | Keep you signed in | The student, only their own rows (`20261102170000` file lines 16-42, 48-49). Christian through the dashboard (4.1). | "Until the student signs out" per the migration comment (`20261102170000` file line 3). Deleting the account removes sessions (`20261102110000`:10-11, a comment quoting Supabase's docs). | Export: yes (`exportload.ts`:349-362). The account page has no sessions list (4.3). |
| Two-factor (authenticator app) | A TOTP factor, if the student turns it on | Supabase Auth (MFA factors) | Optional extra sign-in step | The student manages it at /account/two-factor (`TwoFactor.tsx`:23-24). | Until removed or the account is deleted | Remove on /account/two-factor. Not in the export. |
| Answers checked | For each answer checked on a real question: which question version, the choice letters picked, right or wrong, when | Table `attempts` | Show progress; count the hourly limit (200 an hour) | The student (own rows, `20261101100000`:43-47, policy "students read their own attempts"). Christian. | Until the account is deleted (cascade) | Export: yes (`exportload.ts`:67). Delete: delete my account. Only signed-in, email-confirmed accounts can check answers (`20261101100000` file header; `20261102135000` header). |
| Review schedule | Per question: level 0 to 3, last review day, next review day | Table `review_state` | Spaced review | The student (own rows). Christian. | Until the account is deleted (cascade); the student can delete rows (`20261101110000`:150-152) | Export: yes (`exportload.ts`:69). Delete: with the account. |
| Exam date | Optional exam date per course, up to ten courses, within two years | Table `exam_plans` | Plan reviews | The student (own rows). Christian. | Until the account is deleted; the student can delete rows (`20261101110000`:167-169) | Export: yes (`exportload.ts`:68). Delete: with the account. |
| Study events | Per question or card: answered, marked (know or learning) or skipped, milliseconds on screen, when. No text, no device, no page address. | Table `study_events` | Christian reviewing what works (`20261102100000`:1-6) | The student (own rows, `20261102100000`:60-64). Christian. | Until the account is deleted (cascade). The 7 day window in the table is about how old an event may be when sent, not how long it is kept (`20261102100000`:34-39). | Export: yes (`exportload.ts`:70). Delete: with the account. |
| "Flag or comment" reports | Page path, optional question and version, reason from a list, optional comment up to 1,000 characters, status, handled time | Table `flags` (no website role can read it) | Christian reads them in the admin inbox | Christian (admin functions that check `is_admin()`, two-factor required, `20261102153000`:5-6, 93-209). The student sees their own through `my_flags()` (`20261101120000`:144-169). | Until the account is deleted (`20261101120000`:18-19) | Export: yes (`exportload.ts`:343-356). Delete: with the account. |
| Admin list | Account ids allowed into /admin | Table `admins` | Admin access | No website role and not the service role (`20261102153000`:48) | Until the account is deleted (`20261102153000`:38-41) | Not applicable to students. |
| Progress copied from the browser | If the student chooses, the card progress on this device is imported into `review_state` | Browser first, then `review_state` | Keep progress with the account | See review schedule | See review schedule | Marker key `cueory-guest-imported:<id>` (`storage-keys.ts`:75). |
| Browser storage, account keys | Sign-in session, one-time sign-in checks, the "imported" marker | localStorage: `AUTH_STORAGE_KEY`, PKCE keys, `GUEST_IMPORT_MARKER_PREFIX` (`storage-keys.ts`:75-79) | Stay signed in, finish a sign-in safely, ask about import once | The device | Signing out removes the session key; deleting the account clears the other keys (`storage-keys.ts`:3, 75-79) | Delete: sign out or delete my account. |
| Browser storage, everything else | Progress, resume place, game results, settings and so on | localStorage / sessionStorage (`storage-keys.ts`:50-95) | See /privacy today | The device | Resume 14 days; game results older than 400 days are pruned (privacy.astro:45-55, `privacy-keys.test.ts`:64-69) | Already described on /privacy. The export includes the browser's progress, game stats, setup and resume (`exportdata.ts`:256). |
| Account emails | Sign-up confirmation and password reset emails | Sent through Supabase Auth. Supabase's built-in email today. Resend is planned. | Confirm the address, reset a password | The student | Not stated | Resend: planned, confirm. The docs say real students need Resend first (`SETUP.md`:361-363, 466-467; `GO-LIVE.md`:220-230). Nothing in code references Resend. |
| Backups | Encrypted nightly dump of the production database, proposed 31 day lifecycle | Christian's Oracle bucket (proposed option A) | Recovery | Only Christian (private key) | 31 days proposed (`BACKUPS.md`:71-74) | **Not running.** `BACKUPS.md`:3-5 says "proposal, waiting for Christian"; `SECURITY.md`:50-58 says "planned, not yet verified as operational". A deleted account could stay in a backup up to 31 days if option A is approved (`BACKUPS.md`:209-211). |
| Visit statistics | Page-visit and performance counts | Cloudflare Web Analytics | See how the site is used | Christian (Cloudflare dashboard) | Not stated in the repo | Page already says no cookies and no profile (privacy.astro:126-129). The repo only shows the beacon being allowed (`astro.config.mjs`:55, 66) and set up (`SETUP.md`:147-150). The "no cookies" claim is Cloudflare's, not checkable here (4.6). |
| Reminders | Not collected. The reminder panel says "nothing will be sent, enabled or saved" | none | none | none | none | `ReminderOptIn.tsx`:10-11 and the preview notice. Do not describe reminder emails. `emails/review-reminder.html`:11-14 says never to send before opt-in. |

## 2. /privacy: passages that must change

The page's voice: short sentences, plain words, section headings in plain lowercase-friendly words ("Studying on this
device"), no legalese. The proposed text has no em dashes.

**Tests that will need a follow-up change (not done here).** `tests/unit/privacy-keys.test.ts`:62-65 requires the exact
sentence "Public accounts are closed." and `accountsOpen` false. `storage-keys.ts`:75-79 marks five sign-in keys
`'accounts-closed'`, and the test at `privacy-keys.test.ts`:50-55 fails once `accountsOpen` is true. When Christian
approves, a small follow-up must (a) replace the sentence test, (b) give those five keys a `{ section, phrase }`
disclosure. The proposed text below contains one phrase per key for that.

### 2.1 Opening paragraph

Current text (privacy.astro:19-22):

> Cueory is a free study site for nursing students, run by an individual in Arizona, USA. Public accounts are closed.
> You can study and play without giving us your email address. Your browser keeps your study progress and game
> results on your device. If you join the email list, send feedback or leave a tip, the information involved is
> described below.

Proposed text:

> Cueory is a free study site for nursing students, run by an individual in Arizona, USA. You can study sample
> activities and play daily games without an account and without giving us your email address. In that case your
> browser keeps your study progress and game results on your device. An account is optional. Some features, such as
> checking answers on real questions and sending a report, need one. If you make an account, join the email list, send
> feedback or leave a tip, the information involved is described below.

Why: "Public accounts are closed" stops being true. The "needs an account" claims come from `20261101100000` file header and `20261101120000`:3-12. Whether real questions are live on the site is in 4.4.

### 2.2 New section: "Having an account" (insert after "Playing daily games", before "Settings and reminders", or after "Settings and reminders")

Current text: none. Proposed text:

> **Having an account**
>
> An account is optional. You can sign up with your email address and a password, or sign in with Google. If you sign
> up with email, you choose a display name, and we send you a link to confirm your email address.
>
> Here is what an account holds:
> - Your email address and your sign-in method. If you sign in with Google, Google shares details such as your name,
>   profile photo link and Google account id, and our sign-in provider keeps them with your account.
> - Your display name, and when you made your account.
> - The answers you check on real questions: which question, which choices you picked, whether you were right and when.
> - Your review schedule for questions and cards, and the exam date you enter for a course.
> - What you do with a question or card: whether you answered it, marked it “know” or “still learning,” or skipped it,
>   how long it was on screen and when. It holds no question text and no answers.
> - The reports you send with “Flag or comment”: the page, the question, the reason you pick and any comment you write.
>   Please keep patient information out of comments.
> - Your sign-in sessions: when you signed in, which browser, and your IP address.
> - If you turn on two-factor, your authenticator app’s setting.
>
> Only you can read your own account records on the site. We can read them in our database to run and improve Cueory.
> We read reports in a private inbox that needs two-factor sign-in.
>
> Your browser keeps a few files so you stay signed in: your sign-in session, the one-time checks used while you sign
> in, and a note that records whether your progress on this device was imported into your account. Signing out removes
> your sign-in session from the browser. If you leave the sign-in page unfinished, the one-time checks can stay until
> you sign in again or delete your account.
>
> On your <a href="/account">account page</a> you can change your display name, download your data and delete your
> account. “Download my data” gives you a file of what your account holds, including your sign-in sessions and the
> progress saved in this browser. Delete my account removes your account, your display name, your answers, your review
> schedule, your exam dates, your study activity and your reports. It also signs you out and clears Cueory’s saved
> records from this browser. You can add or remove two-factor on the <a href="/account/two-factor">two-factor
> page</a>. Deleting your account does not remove Google’s own records, or an email address you gave to Kit for the
> launch list.

Basis for each line is in table 1. Phrases to give the storage-key test later: "your sign-in session" (auth key), "the one-time checks used while you sign in" (PKCE verifier and flow keys), "a note that records whether your progress on this device was imported into your account" (guest import marker). Three lines need Christian's eyes before they are used:
- "We can read them in our database to run and improve Cueory": the code says Christian can see what works (`20261102100000`:1-6) and the service role has full table access (`20261101100000`:39), but no code shows who holds that key. See 4.1.
- "Signing out removes your sign-in session": `storage-keys.ts`:76 says deletion signs out, and the sign-out button calls `signOut`; whether it clears the browser key is Supabase's client behavior, not in the repo. Soften to "Signing out ends your sign-in session" if unsure.
- The sentence about unfinished sign-in checks is a plain reading of `storage-keys.ts`:77-79 (they are cleared on deletion). Whether they clear on completion is in the Supabase client, not here (4.5).

### 2.3 Hosting section

Current text (privacy.astro:126-127):

> Cloudflare delivers Cueory’s pages. It processes connection details such as your IP address and browser
> information to deliver and protect the site.

Proposed text (add after it):

> If you have an account, Supabase runs our account and database service. It keeps your account records and sign-in
> sessions for us. Cueory’s own servers do not see your password.

Why: SETUP.md:189 says Supabase holds accounts and the database. "Do not see your password" is a claim that the browser talks to Supabase directly (`signin.ts`:129-145 shows calls go to the Supabase client). That is plausible but is an architecture claim: see 4.7. Drop the last sentence if unsure.

The section later lists "YouTube, Kit or Ko-fi" (privacy.astro:130-131): add Google when someone signs in with it.

Current text (privacy.astro:130-131):

> Other services you choose to use from Cueory, such as YouTube, Kit or Ko-fi, may collect information about your activity over time and across sites under their own policies.

Proposed text:

> Other services you choose to use from Cueory, such as Google sign-in, YouTube, Kit or Ko-fi, may collect information about your activity over time and across sites under their own policies.

### 2.4 "Your information and questions"

Current text (privacy.astro:146-151):

> Email <a href={mail}>{email}</a> to ask what personal information we hold about you or to request a copy,
> correction or deletion. We may need to confirm that the information is yours. We can handle records we control and
> ask a provider to help where it acts for us. Your browser’s local study and game records can be cleared on the
> device where you used Cueory. For records held independently by a payment provider or social platform, use that
> service’s privacy controls.

Proposed text:

> If you have an account, you can download your data, change your display name and delete your account yourself on your
> account page. You can also email <a href={mail}>{email}</a> to ask what personal information we hold about you or to
> request a copy, correction or deletion. We may need to confirm that the information is yours. We can handle records
> we control and ask a provider to help where it acts for us. Your browser’s local study and game records can be
> cleared on the device where you used Cueory. For records held independently by a payment provider or social
> platform, use that service’s privacy controls.

### 2.5 Backups sentence (only if option A is approved and running)

Current text: none. Proposed text, to add to "Having an account" only after the backup has run and a restore is
verified (`SECURITY.md`:57-59):

> We keep encrypted backups of the account database for 31 days. If you delete your account, a copy can stay in a
> backup for up to 31 days before it is deleted.

Do not add this while backups are only a proposal. `BACKUPS.md`:209-211 asks for exactly this wording to be approved.

### 2.6 Passages that can stay

The sections "Studying on this device", "Playing daily games", "Settings and reminders", "Joining the launch email
list", "Contacting Cueory", "Tips, videos and social links" and "Children’s information" do not conflict with accounts.
One check for Christian: "Studying on this device" (privacy.astro:27-34) says your browser saves your choices "on this
device". With an account, exam dates go to `exam_plans` and card progress can be imported into `review_state`
(`examplansync.ts`:1-8, `guestimportrun.ts`:1-10). The new account section covers that, but the first sentence of
the intro now says "in that case".

## 3. /terms: passages that must change

Kept as is: minimum age 16 (terms.astro:25), the operator ("an individual in Arizona, USA", "Cueory", "we", "us",
terms.astro:18), Arizona governing law and Maricopa County courts, the warranty and liability text, and "We may limit
or block access for violations of these terms" (terms.astro:68). No new legal terms are proposed.

### 3.1 "What you can use today"

Current text (terms.astro:36-40):

> You can try sample study activities and daily puzzles without an account. Some pages are placeholders. Public
> account registration has not opened. You can join the launch email list through the “get launch updates” email box
> (on the home page and in the signup pop-up), which sends your address straight to Kit, or through Cueory’s signup
> page on Kit. You can send feedback by email to <a href={mail}>{email}</a>.

Proposed text:

> You can try sample study activities and daily puzzles without an account. Some pages are placeholders. You can make
> a free account with your email address or with Google. You must be at least 16 to make one. An account is needed to
> check answers on real questions and to send a “Flag or comment” report. You can join the launch email list through
> the “get launch updates” email box (on the home page and in the signup pop-up), which sends your address straight to
> Kit, or through Cueory’s signup page on Kit. Joining that list does not make an account. You can send feedback by
> email to <a href={mail}>{email}</a>.

"Joining the list does not create a Cueory account" is already on /privacy (privacy.astro:91-92).

### 3.2 New short section: "Your account"

Current text: none. Proposed text (after "What you can use today"):

> **Your account**
>
> You can delete your account at any time on your account page. That removes the records described in the
> <a href="/privacy">Privacy Notice</a>. You can also download your data there. We may limit or block an account for
> violations of these terms. Please tell us at <a href={mail}>{email}</a> if you think someone else is using your
> account.

Notes: the first three sentences restate what the page does (`AccountSettings.tsx`:224-227, 307) and the page's existing
"limit or block" line (terms.astro:68). The last sentence is a practical request, not a legal term; Christian may cut it.

### 3.3 "Other services and optional tips"

Current text (terms.astro:83-86):

> Cueory links to YouTube and our other social media pages. If you choose to use an outside service, its terms and
> privacy policy also apply. Our launch email list is run by Kit: the email box sends your address straight to Kit,
> and Kit’s terms and privacy policy apply when you sign up. You must be at least 16 to join.

Proposed text:

> Cueory links to YouTube and our other social media pages. If you choose to use an outside service, its terms and
> privacy policy also apply. This includes Google if you choose to sign in with it. Our launch email list is run by
> Kit: the email box sends your address straight to Kit, and Kit’s terms and privacy policy apply when you sign up.
> You must be at least 16 to join.

### 3.4 Report wording

Current text (terms.astro:72-73):

> To report a mistake, send the page title or link and a short description to <a href={mail}>{email}</a>. Leave out
> patient details and confidential exam material.

Proposed text (add one sentence at the end of the first paragraph, which the paragraph then ends with):

> If you have an account, you can also use the “Flag or comment” button on a page. Keep patient details and
> confidential exam material out of comments.

Only if the button is live (4.4).

### 3.5 Date line

"Last updated 17 November 2026" (terms.astro:15) and "Effective 19 November 2026" (privacy.astro:16) would need new dates when approved. See decision 4.

## 4. Things the pages would claim that I could not verify in the code

1. **Who can read account data, and by what route.** The code shows RLS and the service role. It does not show who holds the service-role key or the Supabase dashboard login, or whether anything beyond the admin flag inbox reads `attempts`, `review_state`, `study_events` or `profiles`. Section 2.2 says "we can read them in our database". SETUP.md Part K says Christian owns the Supabase account.
2. **How the password is stored.** `signin.ts`:36-37 mentions Supabase's bcrypt limit, but no code or doc says the password is stored hashed. Left out of the proposed text.
3. **A sessions list for the student.** Sessions appear only in the export (`exportload.ts`:349-362). There is no sessions screen on /account, and no "sign out other devices". Proposed text only says sessions are held and exported. Also, the 2FA page is not linked from the account page; it is reached from sign-in (`SignIn.tsx`, `AuthCallback.tsx`) or by address. The proposed text links it, so check the link exists.
4. **Real questions and the flag button are live.** `check_answer` and `submit_flag` need an account, and `PublishedQuestions.tsx` and `FlagMount.tsx` exist, but I did not verify that real questions or the "Flag or comment" button are shown on the live site. CLAUDE.md says no real content goes public before the button works. Sections 2.1, 3.1 and 3.4 depend on this.
5. **Browser keys on sign-out and sign-in.** Whether Supabase's client removes the session key on sign-out, and the PKCE keys when a sign-in finishes, is the client library's behavior, not in the repo. The repo only says deletion clears or signs out (`storage-keys.ts`:76-79).
6. **Cloudflare Web Analytics is cookieless.** The page already says so (privacy.astro:127-128). The repo shows only the beacon being allowed and set up, not Cloudflare's behavior. Not changed here, but worth a check against Cloudflare's own docs.
7. **"Cueory's own servers do not see your password."** The sign-in code calls the Supabase client in the browser (`signin.ts`:129-145), and the repo is static Astro with no server code for sign-in. I did not verify there is no other path (a Worker route). Left in section 2.3 as a removable sentence.
8. **Email provider.** Sign-up and reset emails use Supabase's built-in email today. Supabase's built-in email only reaches team members (`SETUP.md`:361-363). Resend is only a plan (`GO-LIVE.md`:220-230). The proposed text does not name Resend. Add it only when it is connected.
9. **Backups.** Not operating (`BACKUPS.md`:3-5; `SECURITY.md`:50-58). No retention for Supabase's own data is stated anywhere in the repo.
10. **Deleting an account also removes Supabase's sessions and Google identity record.** The migration comment says removing the `auth.users` row removes sessions (`20261102110000`:10-11, quoting Supabase's docs). That identities are removed too is a standard cascade I did not see stated. The proposed deletion list says what the migration lists: profile, attempts, review state, exam plans, reports, study events. Section 2.2 also names the sign-in details; the deletion summary in the app does (`deleteaccount.ts`:33-37).
11. **Retention.** No periods are stated, except 14 days for the resume place and 400 days for game results (already on the page), and the proposed 31 day backup rule. The text says "until you delete your account" only in the sense that deletion removes the rows; it states no automatic deletion period.
12. **Legal basis, region, and third-party practices.** SETUP.md:204 says to pick a West US region for Supabase. I did not state a region, since I could not confirm what was actually chosen. Nothing about Supabase's, Google's or Resend's own practices is described beyond "their own policies".
13. **Minor accounts.** The page says 16 and over. Nothing in the sign-up code asks for age or checks it (`signin.ts`:106-151). The sign-up form may show a statement; I did not check `SignIn.tsx`.

## 5. Decisions for Christian

1. **Approve, edit or reject** the wording in sections 2 and 3. Nothing changes until you say so.
2. **When to open accounts relative to the backups.** The page cannot mention backups until the backup job runs and a restore works. Open accounts first and add the backup line later, or wait?
3. **Resend.** Connect it before launch (needs your yes for email DNS records under rule 9), then add one line to /privacy.
4. **Dates.** Update "Effective 19 November 2026" and "Last updated 17 November 2026" on approval? The terms say important changes get 14 days notice on the site (terms.astro:116-119).
5. **"We can read them in our database to run and improve Cueory."** Keep, soften, or cut (4.1)?
6. **The line asking people to tell us if someone else uses their account** (3.2): keep or cut. It is a practical request, not a legal term.
7. **Study events for improving Cueory.** The table is built for it, and the player sends events (`studyrecorder.ts`:1-30). The page text says what is recorded. Decide whether you want to promise more (for example, "only in totals").
8. **Follow-up code and tests** after approval, as one small pull request: change `tests/unit/privacy-keys.test.ts`:62-65, give the five `'accounts-closed'` keys in `storage-keys.ts`:75-79 a section and phrase, and flip `accountsOpen` only when the go-live checklist says so.

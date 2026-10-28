# Mako CRM

First milestone of Mako's hosted CRM: a white, blue/cyan/purple login experience, authenticated business workspaces, configurable onboarding, customer/lead records, tasks, and a restricted Mako owner console.

## What works

- Email/password sign-in, sign-out, reset-password flow, and invitation confirmation.
- One initial workspace per account. Owners select their business preset and tools; members cannot edit workspace configuration.
- Customer/lead creation and listing; task creation, completion, and reopening.
- Mako owner console at `/owner` to manually assign Pro/Custom and active/pending/suspended access.
- RLS and restricted database grants. A platform admin can manage workspace access but cannot automatically read customer or task records.
- `/preview` is an explicitly labeled, read-only sample workspace; no live customer data.

## Not included yet

Stripe billing/webhooks, automated subscription activation, staff invitation UI, account switching, customer editing/deletion/search/pagination, quotes, schedules, jobs, invoices, reporting, SMS, custom client features, and audit logs are future work. Self-service Pro signup, optional AI, scheduled email follow-ups, snapshots, and priority support are included in the Pro update below. Selected future modules show a **Soon** label and an honest placeholder. Record lists currently show the newest 100 records. Do not advertise this milestone as the complete Pro product.

## Local setup

Requires Node.js 20.9+ and pnpm. Install with `pnpm install`. Copy `.env.example` to `.env.local` and add your Supabase project URL and **publishable** key. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.

Run `pnpm dev`, then open http://localhost:3000. The root opens sign-in; an authenticated customer opens their workspace and a platform admin opens the owner console.

## Supabase setup — required before live login/workspaces

1. In your own Supabase dashboard, open **SQL Editor** and run `supabase/migrations/202610280001_foundation.sql` once. This creates new tables and access policies; it does not change existing CRM spreadsheet files.
2. Authentication → URL Configuration: set Site URL to your deployed HTTPS Vercel address and allow `https://YOUR-APP/auth/callback` and `https://YOUR-APP/auth/confirm`. Add localhost only for development.
3. Authentication → Providers: enable email/password. Enable public user signup for self-service Pro accounts. Accounts still need a confirmed email (if email confirmation is enabled) and Mako plan activation before accessing paid tools. Configure a production SMTP provider before customer rollout; the default email service has limits.
4. Create your own administrator account in Authentication → Users (or invite yourself). For the invitation email template use `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Open your Mako workspace</a>` so the server can establish a cookie session. You may instead create a test user with a password using the dashboard.
5. Copy **your own** auth user's UUID and run the following in SQL Editor. Never use a customer UUID here:

```sql
insert into public.platform_admins(user_id) values ('YOUR-OWN-AUTH-USER-UUID');
```

6. Sign in and open `/owner`. Pro customers can register at `/signup`; Custom customers contact Mako first and can be invited from Authentication → Users. They sign in, complete onboarding, and initially have **pending** access. Activate their agreed plan in the owner console. Changing module choices never changes their plan or paid access.
7. Password recovery uses `/auth/callback?next=/reset-password`. For a token-hash recovery email template use `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>`.

The app uses only the public publishable key and session-specific permissions. No database password, secret key, or service-role key is required in Vercel. Do not commit `.env.local`.

## Vercel

Import this repository, use **Next.js**, root **`./`**, and default build settings. Set these environment variables for the appropriate environments:

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=https://your-deployed-app.vercel.app
```

Redeploy after changing environment values. Use a stable production URL for email callbacks; do not use rotating deployment URLs. No custom domain is required initially.

## Validation

- `pnpm test`: executes the migration in a local PostgreSQL engine, authenticates as two different businesses, and tests denied reads, inserts, moves, updates, deletes, plan escalation, membership escalation, anonymous access, pending access, and duplicate onboarding. Tests also verify legitimate own-workspace writes and platform-admin provisioning.
- `pnpm build`: production compilation and TypeScript checks.
- Live acceptance before launch: use two real test accounts against Supabase; test invitation delivery, login/reset, both workspaces, activation/suspension, and denied cross-business API calls. Local policy tests cannot validate your remote project configuration or SMTP delivery.

Pricing/subscriptions and private Custom feature implementation must be completed before paid launch. Infrastructure remains under the Mako owner's accounts.

## Pro update: deployment steps

Apply ONLY the two new migrations in order in Supabase SQL Editor (the foundation is already installed):
1. `supabase/migrations/202610280002_pro_tools.sql`
2. `supabase/migrations/202610280003_backups.sql`

Do not rerun the foundation migration. Existing contacts get a New pipeline stage; existing workspace memberships and data are preserved. New tables and RPCs use explicit grants and RLS. Keep Supabase email signup enabled for `/signup`. Custom is still contact-first. Pro signup never grants itself paid plan access; use the owner console until Stripe is integrated.

### Optional server connections

Add these as **server-side secrets in Vercel**, never as NEXT_PUBLIC variables or in chat:

- `OPENAI_API_KEY`: your OpenAI API project key.
- `OPENAI_MODEL`: a Responses-compatible model enabled in that project. No model is silently selected or upgraded.
- `RESEND_API_KEY`: your Resend sending API key.
- `FOLLOWUP_FROM_EMAIL`: a sender on your verified Resend domain (e.g. `Mako <updates@yourdomain.com>`).
- `SUPABASE_SECRET_KEY`: a server-only Supabase secret key (or legacy service-role key). Required only for the scheduled email worker and automatic snapshots/downloads. It is not used for ordinary customer requests.
- `CRON_SECRET`: a private random token, at least 32 characters, used by Vercel cron authentication.
- `BACKUPS_ENABLED=true`: explicitly enables the private-storage snapshot worker.

Redeploy after configuring environment values. Vercel Pro is required for these cron frequencies. No email or paid AI call is made when a provider is not configured. Preview pages never send or save anything.

AI sends only user-submitted text, with provider response storage disabled; no customer records are automatically included. A server-enforced limit of 30 AI calls/workspace/day includes failed provider attempts to cap costs. The assistant has no tools and cannot send messages or change CRM data.

Follow-ups are owner-scheduled, permission-confirmed service messages to an existing workspace contact. Limit: 100 scheduled/workspace/day, including cancelled messages; 90-day scheduling horizon. Worker checks every 10 minutes and claims at most 20 due messages/run. Use a verified sending domain. Provider acceptance is marked Sent; delivery/bounces are not tracked yet. Queued messages can be cancelled; Processing messages cannot. Failed or interrupted processing needs operator review before any resend. Message IDs are used as provider idempotency keys. The worker never automatically retries an uncertain send, avoiding duplicate mail. Verify the reply destination and sender identity in the email-provider account before customer rollout.

Daily workspace snapshots are stored as JSON in the private `mako-backups` Supabase Storage bucket. The hourly worker claims up to 20 businesses that have not had a snapshot that UTC day. Each snapshot is limited to 50,000 combined records and 20 MB; failures are visible in Plan & Data. Seven-day retention cleanup happens only after a new snapshot succeeds. These snapshots are not full database/auth backups, off-site disaster recovery, or an automatic restore tool. Use the provider's managed database backup plan in addition, and test restores before advertising recovery guarantees. Bucket storage must remain private; owner downloads are authenticated and scoped by workspace before a server key is used. Configure billing/monitoring in the provider dashboards to keep hosting/storage within your plan's capacity.

Support requests are visible to the workspace and the Mako platform owner. Customers can request technical help, bug fixes, security help, and minor configuration changes. You process the priority queue in `/owner`; support emails are not automatically sent by this app. Priority email is also available via the visible mail link. Response times and monthly maintenance are services you must perform under your agreement, not features that code can fulfill by itself.

Production verification after connection: register a test Pro account, confirm email, complete onboarding, activate it as the Mako owner; test pipeline updates and support tickets. Schedule one consented follow-up to your own test email, verify provider delivery, then confirm a real snapshot and test its download/restore. AI and automated storage/email integrations have not been exercised against paid providers in local tests.

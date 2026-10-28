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

Stripe billing/webhooks, automated subscription activation, self-service signup, staff invitation UI, account switching, customer editing/deletion/search/pagination, quotes, schedules, jobs, invoices, reporting, email/SMS automations, AI, custom client features, and audit logs are future work. Selected future modules show a **Soon** label and an honest placeholder. Record lists currently show the newest 100 records. Do not advertise this milestone as the complete Pro product.

## Local setup

Requires Node.js 20.9+ and pnpm. Install with `pnpm install`. Copy `.env.example` to `.env.local` and add your Supabase project URL and **publishable** key. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.

Run `pnpm dev`, then open http://localhost:3000. The root opens sign-in; an authenticated customer opens their workspace and a platform admin opens the owner console.

## Supabase setup — required before live login/workspaces

1. In your own Supabase dashboard, open **SQL Editor** and run `supabase/migrations/202610280001_foundation.sql` once. This creates new tables and access policies; it does not change existing CRM spreadsheet files.
2. Authentication → URL Configuration: set Site URL to your deployed HTTPS Vercel address and allow `https://YOUR-APP/auth/callback` and `https://YOUR-APP/auth/confirm`. Add localhost only for development.
3. Authentication → Providers: enable email/password. Disable public user signup for this invitation-based first release. Configure a production SMTP provider before customer rollout; the default email service has limits.
4. Create your own administrator account in Authentication → Users (or invite yourself). For the invitation email template use `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Open your Mako workspace</a>` so the server can establish a cookie session. You may instead create a test user with a password using the dashboard.
5. Copy **your own** auth user's UUID and run the following in SQL Editor. Never use a customer UUID here:

```sql
insert into public.platform_admins(user_id) values ('YOUR-OWN-AUTH-USER-UUID');
```

6. Sign in and open `/owner`. Invite a customer from Authentication → Users. They sign in, complete onboarding, and initially have **pending** access. Activate their agreed plan in the owner console. Changing module choices never changes their plan or paid access.
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

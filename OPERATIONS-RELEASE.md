# Operations workspace release

## Implemented

- Optional Service assets, Recurring work, Online booking, Projects & costs, and Inventory & purchasing tools. Presets recommend appropriate tools; existing workspaces keep their selections until an owner saves settings.
- Searchable records with editable details, optimistic versions, archive/restore, and customer/job/appointment links. Vehicle, property, equipment, and pet field packs. Database validation prevents relationships outside the workspace.
- Weekly/monthly plans create jobs on their due date in an IANA time zone. Pause/resume, renewal cutoffs, visit history, and unique plan/date keys protect retries. Catch-up is bounded to 30 visits per plan per run. Month-end dates clamp to the next month's valid day. Disabling Jobs or Recurring stops generation.
- Owner-published individual appointment slots, duration, overlap checks, one active reservation per slot, public booking confirmation, private cancellation links, staff cancellation, and linked UTC schedule entries. Public output excludes guest details and internal notes. Unpublishing/removing Booking or Schedule closes public availability. Booked slots must be cancelled before their schedule can be changed.
- Projects, milestones, manual time entries with internal hourly cost, expenses, budget comparison. Costs include non-archived recorded entries; they are not collected revenue. Project summaries cover the loaded records (up to 1,000).
- Inventory items with unique active SKUs, units, thresholds, suppliers, purchase orders, signed append-only stock movements, negative-stock prevention, and atomic/idempotent purchase receipt. Received purchase fields are immutable; correct stock with an explained adjustment. Balances use the full database ledger, history shows 200 recent movements.
- In-app appointment reminders for owners within 24 hours; plan renewal reminders seven days ahead. Event keys prevent duplicate notifications. Existing notification center shows these reminders.
- Exports and automatic backup payloads include operations records, stock movements, and booking requests. Existing backup size/retention limits remain.
- Isolated session demo CRUD, linked costs, stock adjustments, purchase receipt, archive/restore, and reset. Demo creates no public bookings or scheduled jobs. Demo reservations and notifications are not simulated.
- Fin launcher click pop, separate from chat entry; reduced-motion preferences remain respected.

## Release setup / limits

Apply `202610280009_operations.sql` after 008, then deploy. Migration is additive apart from expanding the allowed-module check and extending existing export/backup functions. Existing workspace selections and records are untouched. New public booking RPCs expose only deliberately published slots. Do not apply or deploy without approval.

`/api/cron/operations` uses the existing `CRON_SECRET`, `SUPABASE_SECRET_KEY`, and Supabase URL. Vercel runs it every 15 minutes. Worker failure returns 503 and can be inspected in deployment logs. Service plans are not payment subscriptions. Reminders are in-app, not customer email.

Public booking accepts explicit individual slots (capacity one), not a repeating staff availability calendar. On-screen confirmation/cancellation links only; no automatic guest emails, deposits, payment processing, calendar sync, SMS, capacity greater than one, or rescheduling in place. Guests cancel and rebook. Public booking applies per-email limits but does not include CAPTCHA; review anti-abuse protection before advertising high-traffic booking pages. Staff schedule entries use UTC; public slots render in the visitor's local time zone. Do not place access codes or sensitive information in published slot titles.

Inventory does not automatically decrement on invoices or jobs and does not constitute accounting or POS. Purchase receipt records stock, not payment. No timers, file attachments, project templates, customer portal, or recurring billing in this release.

## Validation

17 automated tests pass, including PGlite migrations, permissions, tenant boundaries, optimistic conflicts, stock invariants, duplicate receipts, repeated plan workers, overlapping slots, booking retries/cancellation, exports, and regression coverage. Type check and ESLint pass. Production build passes. Browser QA covers stock issue/receipt, linked purchase form, Fin opening, and session persistence. Migration 009 was applied with user approval on October 29, 2026. Production checks confirmed RLS on all four new tables, no anonymous access to guest records, no authenticated member access to the scheduled worker, and unchanged counts of four workspaces, zero contacts, and zero tasks. Deployment verification follows this commit.

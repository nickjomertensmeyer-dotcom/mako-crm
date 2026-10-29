# Connected workspace upgrade — local review

The user approved production release on 2026-10-28. Migration 005 has now been applied successfully; the app deployment is in progress. A pre-migration snapshot is saved under ignored `qa/pre-board-release-snapshot.json`. Verification confirmed all seven new tables have RLS, deny anonymous reads, and deny direct authenticated inserts. Existing counts remain four workspaces and zero contacts, tasks, documents, and payments. The existing authentication, manual plan activation, invoice/quote/payment tools, jobs, appointments, support, and optional integrations remain in place.

## Implemented

- Shared Tasks, Leads, and Customers board: editable fields, saving/error feedback, grouped collapsible rows, search, status/owner filters, sort, column hiding, width sliders, reorder controls, page selection, bulk owner/status/archive changes, restore, and 30-row pagination.
- Workspace-owner custom columns: text, number, USD currency, date, status choices, workspace member, and linked contact. Server checks types and tenant-scoped relations. Owners configure columns/shared views; members can edit records and save personal views. Widths/order/filter/group/hidden columns persist in saved views.
- Native modal side panels with editable details, comments, member mentions, activity history, and actual linked contact/task/document/work-item IDs. URL record links and browser Back are supported. Lead conversion changes the existing contact's stage; it preserves the ID, notes, comments, history, and relationships and is safe to repeat.
- Version-checked updates prevent silent overwrites. Archived records are retained. New contact creation checks for matching email within the workspace; same-name records with different emails are allowed intentionally.
- Connected overview: customers, open leads/pipeline, incomplete/overdue tasks, follow-ups today, outstanding issued invoices, selected-period recorded payments, monthly payment bars, task status, owner workload, pipeline stage values/counts, and upcoming jobs/appointments. Values explicitly distinguish estimates, outstanding balances, and actual payment receipts. Metric links carry matching board filters; outstanding invoices have a new matching document filter.
- Assignment, mention, due reminder, and read/unread in-app notifications. Owner-configurable rules and execution history. Database uniqueness keys make won-lead onboarding, assignment notifications, overdue notices, and follow-up reminders idempotent.
- `/` is a public marketing homepage, `/login` remains the existing authentication entry. Signup explains capabilities, price, email verification, no card/no automatic trial, and manual activation before registration. Working Privacy/Terms disclosure pages and existing contact method are linked.
- `/preview` supports adding/editing records, assignments/statuses, board controls, panels, comments, conversion, live totals, session storage, and reset. Fictional changes stay in that browser tab's session and never call production mutations. Real email, invitations, billing, and background jobs are disabled. Workflow settings are demonstrable; background execution is not simulated.
- Transparent Mako logo, stronger label contrast, Sales/Work/Billing navigation sections, responsive horizontal board scrolling, visible focus, native keyboard inputs, loading UI, and a recoverable workspace error page.
- New board tables are included in the existing owner export and configured backup payloads.

## Safe release sequence (requires authorization)

1. Review `supabase/migrations/202610280005_boards.sql` and take the normal production backup. Apply once after 001–004 in a staging project first, then production when authorized. It adds columns/tables/functions/triggers/policies; it does not delete records or rewrite IDs. New activity history starts after application; old history is not fabricated. New tables deny anonymous access and direct client writes. Existing task/contact forms continue working through validating/auditing triggers. Hard deletion from browser roles is replaced by archive/restore.
2. Deploy this revision to a preview environment, with existing Supabase and site URL settings. Point a preview at staging data for write testing. Without migration 005, authenticated pages explicitly report the missing update and retain the old record/overview interface; existing documents/work tools remain available.
3. For scheduled rules, configure server-only `SUPABASE_SECRET_KEY` and `CRON_SECRET`. The added Vercel cron calls `/api/cron/boards` every 15 minutes. The endpoint rejects missing/incorrect bearer secrets. Scheduled dates use **UTC**. Enable desired rules in Workflows; all default off. Assignment and won-lead actions run transactionally on edits; no cron needed for those.
4. Run a staging two-user/two-workspace acceptance test, including account verification/recovery. No new real accounts, authentication emails, or production records were created during local QA.
5. Publish only after reviewing the legal/business disclosures and authorizing deployment. No billing behavior has changed.

## Configuration and limits

- Pricing defaults are verified from the existing Shopify theme `templates/index.json`: Pro $99 USD/month, suggested $199 one-time onboarding; Custom from $1,999 development plus $199/month support. Override public wording with `NEXT_PUBLIC_PRO_PRICE_LABEL` and `NEXT_PUBLIC_CUSTOM_PRICE_LABEL`. The app still has **manual activation**, with no automatic free trial, checkout, paid-access webhook, or cancellation automation.
- Formal legal entity, jurisdiction, retention schedule, cancellation/refund terms, service limits, response-time commitments, and complete commercial Privacy/Terms need operator review. The new pages disclose current behavior and say which formal terms are still pending.
- Existing `makocrm@gmail.com` remains the support contact. A verified sending domain alone does not establish a staffed support inbox.
- Workflow notifications are **in-app only**. There are no automatic workflow emails or email preferences because this change does not introduce email notification delivery. Existing consent-based email follow-ups, optional AI, and private backups retain their separate credential/configuration requirements.
- Existing owner/member roles are retained. Member invitations, new role levels, and a Team management screen are outside this change; Team remains marked Soon.
- Board snapshots load up to 10,000 recent records per table in API pages; table rendering is paginated. History/comments initially load the latest 2,000 workspace events, with up to 1,000 additional events for a directly selected record. A visible warning explains truncated snapshots; dashboard metrics, chart counts, pipeline values, payment-day totals, and upcoming work are calculated separately in PostgreSQL across all permitted records. Large-scale server-filtered boards and full history pagination remain future scaling work. Existing exports/backups enforce a 50,000 total record cap.
- Custom linked columns currently link to contacts; jobs, appointments, quotes, and invoices appear through their existing contact foreign keys. Custom multi-target relation schemas are not implemented.
- Standard bulk updates cover built-in status/owner fields and archive/restore, with per-record transactions and success/error feedback. They are not an all-or-nothing multi-row transaction. Column resizing/reordering uses accessible controls, rather than drag handles.
- Other users' changes/notifications appear on navigation or Refresh; this change does not add realtime subscriptions. Live writes refresh board data without a full document reload.

## Validation

- TypeScript native 7 type check, ESLint, and optimized Next production build.
- PostgreSQL/PGlite integration tests apply all migrations in an isolated disposable database. They cover cross-workspace reads/writes, invalid assignments/relations, member versus owner privileges, private views, stale edits, duplicate email, archive/restore, comments/mentions, lead conversion preserving identity/history/relations, backup coverage, suspended access, anonymous denial, and repeated workflow execution.
- Board model tests cover matching search/filter/sort/archive results and correct metric definitions (draft invoices, quotes, void invoices, archived records, and won leads excluded where appropriate). Existing billing, isolation, and signup tests remain passing.
- Eight automated tests pass.
- Browser QA on localhost: create task/date/assignment, inline status edit, bulk archive/restore, grouped board, saved-view persistence after reload, comments/panels, conversion, changing totals, matching widget filters, demo reset, marketing/signup disclosure rendering, and 390px overflow checks. No production authentication/billing transaction or outbound email was performed.
- The linter needs TypeScript's 6 API while native TypeScript 7 remains the explicit `typecheck` compiler. The compatibility arrangement follows [Microsoft's side-by-side guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).

## Logo asset

`public/mako-logo-transparent.png` is a sibling asset created with the built-in image generation tool; the original logo is retained. Prompt: “Remove only the white background, including the white areas inside and between the letters, to true alpha transparency. Preserve the exact existing blue MAKO lettering, fin silhouette, purple wave and cyan wave, composition, shapes, and colors. No redesign, no extra text, no shadows.” It is used by the shared Brand component.

## Resumed review

Dashboard reporting now uses the authenticated `workspace_board_report` PostgreSQL aggregate, so board snapshot caps do not truncate dashboard totals or payment-period charts. Browser checks confirmed lead conversion preserves a comment, linked task/quote/appointment, and a conversion event; browser Back closes the panel; a custom currency column can be created; demo reset restores sample totals. Review screenshots are in `qa/mako-connected-board.png`, `qa/mako-connected-record-panel.png`, and `qa/mako-connected-overview.png`. Migration 005 is applied under the approved production release; check the deployment status before treating the app rollout as complete.

## Account settings and navigation update

The profile menu now provides personal settings, Appearance, Business settings, and Sign out (Exit demo in the sandbox). Real personal preferences use Supabase auth metadata only for display, never authorization. Display name, private profile photo, light/dark/device theme, board spacing, and reduced motion are supported. Business settings reuse the owner-protected configure_workspace RPC; hiding tools preserves records and does not change billing.

Migration 202610280006_profile_photos.sql was applied to production under the approved release. It adds a private profile-photos bucket and own-user folder policies. No service-role credential is required for uploads. Photos are resized in the browser, limited to 250 KB WebP on the server and bucket, and served through an authenticated, private/no-store route. Profile photo removal cleans up the previous stored file. Personal name and appearance settings work independently of this storage migration.

Demo preferences/photos and business configuration stay in sessionStorage; Reset demo clears them. Demo configuration leaves all sample tools available to explore and does not provision a real workspace. Demo exit does not sign out an existing real account.

Internal workspace links use React/Next transitions, retaining the sidebar while server content loads. New tab content fades/slides into place. The animated sidebar border was removed at the user’s request. OS and account reduced-motion settings suppress animations. In-page settings anchors retain native scrolling.

Validation: ten automated tests pass, including private photo isolation across two users and anonymous denial. Type check, lint, and production build pass. Browser checks cover demo display name/photo, persistence across tabs, dark board contrast, menu Escape, business configuration, reset clearing profile/theme/configuration, and 390 px overflow. Real account writes and production photo storage are not exercised before release. Production publication was authorized after the local review.

## Business identity, copyright, and dark-mode follow-up

The root layout renders “© Mako CRM · Customer Relationship Systems” on every page. Business settings support a private workspace logo, preserving the image’s aspect ratio; the sidebar shows it beside the business name. Owners upload/remove logos, members can view them, and other workspaces have no access. The Mako brand logo above the workspace identity remains intact. Migration 007 adds the optional workspaces.logo_path field, private business-logos bucket, and atomic owner-protected configure_workspace_branding RPC. Existing configurations without a logo continue to work. Demo identity uses tab-session storage and Reset demo restores the initial badge.

Dark-mode document table headers and job-date cards now use readable foreground/background pairs. Dashboard card tops retain the original blue (#2457e8), purple (#793ce6), and cyan (#00cbe8) colors, as do chart accents and key borders. Smooth page transitions remain; the animated sidebar outline is removed. Ten automated tests pass, including owner/member/cross-workspace logo restrictions.

## Sharky AI floating assistant

Sharky AI replaces the old assistant form with a floating, movable chat available throughout the workspace. The custom SVG shark uses Mako navy, blue, cyan, and purple. Drag with mouse/touch or use arrow keys while the launcher is focused; Home returns it to the default corner. Position alone is stored per browser tab. Chats stay in memory across workspace navigation and clear on page reload, sign-out, new chat, or demo reset. The panel fits mobile viewports and supports Enter/Shift+Enter, Escape, minimize, and accessible labels.

The existing /api/assistant endpoint retains authentication, active-plan checks, same-origin validation, workspace daily quota, configured server-side model/key, and store:false. It now accepts bounded user/assistant conversation history; privileged roles and oversized actual request bodies are rejected. The AI cannot read workspace records or perform actions. Recent chat text is supplied as Responses API input messages following https://developers.openai.com/api/docs/guides/conversation-state . No new billing or database setup is introduced.

Demo chat uses clearly labeled deterministic sample replies and never calls the AI endpoint. Live chat requires OPENAI_API_KEY and OPENAI_MODEL; unavailable setup is displayed honestly. No live provider request was sent during QA. Thirteen automated tests pass. Browser checks cover sample chat, clear/minimize/Escape, sidebar launch, mouse drag without accidental open, keyboard movement/Home, retained chat across tabs, 390px panel fit, and dark-mode rendering. Production build and lint pass.

## Fin visual refinement

The assistant display name is now Fin throughout chat, navigation, labels, sample replies, and the server-side identity instruction. Existing internal module names and saved bubble-position keys are retained for compatibility. The desktop panel is reduced to 320 by 440 pixels and still clamps to smaller viewports. A simple fin-and-wave vector replaces the mascot face. A cyan/purple/blue light travels around the launcher border only on hover or keyboard focus; existing device/account reduced-motion preferences disable the rotation. No AI access, billing, or data handling changes accompany this update.

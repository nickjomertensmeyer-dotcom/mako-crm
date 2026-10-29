# Industry expansion roadmap

The current 28 presets select existing CRM tools; they are starting configurations, not full industry-specific software. All items below are proposed future work, not implemented features or current plan promises.

| Priority | Shared feature | Businesses helped | Concrete scope |
| --- | --- | --- | --- |
| 1 | Industry field packs and linked service assets | Auto repair, detailing, trades, property management, pet services | Optional vehicle/property/equipment/pet records linked to customers and work; preset field templates using existing custom-board support where possible. |
| 2 | Recurring work and service plans | Cleaning, landscaping, pest control, HVAC, training | Repeating jobs/appointments, pause/resume, renewal reminders, time zones, idempotent background generation. Recurring billing would require separate billing integration work. |
| 3 | Online booking and reminders | Beauty, fitness, tutoring, photography, pet services | Availability, service durations, capacity, cancellation/reschedule flows, consent-aware reminders, and optional deposits through a payment provider. |
| 4 | Project milestones, time, and job costs | Agencies, consultants, contractors, IT services | Project templates, milestones, logged time, expenses, and clear estimates-versus-actual reporting. |
| 5 | Inventory and purchasing | Retail/wholesale, repair, catering, trades | Catalog, stock movements, units, low-stock alerts, suppliers, and purchase orders. Inventory must be a real ledger; existing invoices alone are not inventory. |
| 6 | Customer portal and approvals | Field services, agencies, events, photography | Permission-scoped quote review, appointment requests, invoice visibility, and document uploads. |

Build the first two as reusable capabilities before adding many narrowly named modules. Current feature flags and workspace isolation must apply to every new table, API, and background job.

Research examples: [Jobber recurring-work documentation](https://help.getjobber.com/en/articles/create-a-recurring-job/) and [Square catalog/inventory documentation](https://api.squareup.com/help/us/en/topic/items-and-inventory). These are product-workflow references, not integrations or capabilities currently offered by Mako.

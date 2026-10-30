begin;
-- The authenticated browser roles retain their existing RLS policies. Only the
-- server credential may read these sources for the owner-validated sync worker.
grant select on public.workspaces,public.memberships,public.business_documents,public.invoice_payments to service_role;
commit;

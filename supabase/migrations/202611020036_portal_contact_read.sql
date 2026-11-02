begin;
-- Server-only portal lookup needs customer identity and archive state, not email,
-- phone, notes, or other private CRM fields. Browser roles gain no new access.
grant select (id, workspace_id, name, archived_at) on public.contacts to service_role;
commit;

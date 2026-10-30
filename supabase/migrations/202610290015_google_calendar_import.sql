begin;
-- Existing export connections remain intact but require fresh read-only consent.
alter table public.google_calendar_connections add column if not exists scopes text not null default '';
alter table public.google_calendar_connections add column if not exists import_calendar_id text not null default 'primary';
comment on column public.google_calendar_connections.import_calendar_id is 'Member-selected Google calendar for private read-only Schedule display. Events are not shared as workspace records.';
commit;

create table public.customer_reviews (
 id uuid primary key default gen_random_uuid(), author_id uuid not null unique references auth.users(id) on delete cascade,
 display_name text not null check(length(trim(display_name)) between 1 and 80),
 business_name text not null default '' check(length(business_name)<=120),
 rating integer not null check(rating between 1 and 5),
 body text not null check(length(trim(body)) between 20 and 2000),
 consent boolean not null check(consent), status text not null default 'pending' check(status in ('pending','approved','hidden','withdrawn')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.customer_reviews enable row level security;
revoke all on public.customer_reviews from anon,authenticated;
grant select on public.customer_reviews to authenticated;
create policy review_private_read on public.customer_reviews for select to authenticated using(author_id=auth.uid() or public.is_platform_admin());
create function public.public_reviews() returns table(id uuid,display_name text,business_name text,rating integer,body text,created_at timestamptz) language sql stable security definer set search_path='' as $$
 select id,display_name,business_name,rating,body,created_at from public.customer_reviews where status='approved' and consent order by created_at desc limit 100;
$$;
create function public.submit_review(public_name text,company text,stars integer,review_body text,permission boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.memberships where user_id=auth.uid()) then raise exception 'A Mako workspace account is required';end if;
 if permission is distinct from true then raise exception 'Publication permission required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,31));
 if exists(select 1 from public.customer_reviews where author_id=auth.uid() and updated_at>now()-interval '1 minute') then raise exception 'Please wait a minute before updating your review';end if;
 insert into public.customer_reviews(author_id,display_name,business_name,rating,body,consent)
 values(auth.uid(),trim(public_name),trim(coalesce(company,'')),stars,trim(review_body),true)
 on conflict(author_id) do update set display_name=excluded.display_name,business_name=excluded.business_name,rating=excluded.rating,body=excluded.body,consent=true,status='pending',updated_at=now();
end $$;
create function public.set_review_status(review_id uuid,new_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if new_status='withdrawn' then
  update public.customer_reviews set status='withdrawn',updated_at=now() where id=review_id and author_id=auth.uid();
 elsif new_status in ('approved','hidden') and public.is_platform_admin() then
  update public.customer_reviews set status=new_status,updated_at=now() where id=review_id and status<>'withdrawn';
 else raise exception 'Review permission denied';end if;
 if not found then raise exception 'Review unavailable';end if;
end $$;
revoke all on function public.public_reviews(),public.submit_review(text,text,integer,text,boolean),public.set_review_status(uuid,text) from public;
grant execute on function public.public_reviews() to anon,authenticated;
grant execute on function public.submit_review(text,text,integer,text,boolean),public.set_review_status(uuid,text) to authenticated;

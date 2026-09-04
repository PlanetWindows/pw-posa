-- Keep internal push delivery queues inaccessible through the public Data API.
alter table public.office_push_events enable row level security;

-- A signed-in user may update only their own device subscription.
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own
on public.push_subscriptions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Trigger functions are internal implementation details and must not be exposed
-- as callable RPC endpoints.
revoke execute on function public.enqueue_pose_push() from public, anon, authenticated;
revoke execute on function public.enqueue_office_push() from public, anon, authenticated;
revoke execute on function public.notify_pose_team() from public, anon, authenticated;
revoke execute on function public.notify_office_of_issue() from public, anon, authenticated;
revoke execute on function public.notify_office_of_submitted_report() from public, anon, authenticated;
revoke execute on function public.notify_office_of_execution_change() from public, anon, authenticated;

-- Subscription registration remains available only to authenticated app users.
revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- The client passes empty strings where it means null (the generated
-- RPC arg types are non-nullable). Normalize at the boundary.
create or replace function public.register_device(
  p_install_id text,
  p_push_token text,
  p_platform text,
  p_permission_status text,
  p_locale text,
  p_timezone text,
  p_app_version text
) returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_install_id is null or char_length(p_install_id) > 64 then
    raise exception 'invalid install id';
  end if;

  p_push_token := nullif(p_push_token, '');
  p_locale := nullif(p_locale, '');
  p_app_version := nullif(p_app_version, '');

  if p_push_token is not null then
    update public.devices
      set push_token = null, active = false, updated_at = now()
      where push_token = p_push_token and install_id <> p_install_id;
  end if;

  insert into public.devices as d (
    user_id, install_id, push_token, platform, permission_status,
    locale, timezone, app_version, active, last_seen_at
  ) values (
    v_user, p_install_id, p_push_token, p_platform,
    coalesce(p_permission_status, 'undetermined'),
    p_locale, coalesce(nullif(p_timezone, ''), 'UTC'), p_app_version, true, now()
  )
  on conflict (install_id) do update set
    user_id = excluded.user_id,
    push_token = excluded.push_token,
    platform = excluded.platform,
    permission_status = excluded.permission_status,
    locale = excluded.locale,
    timezone = excluded.timezone,
    app_version = excluded.app_version,
    active = true,
    last_seen_at = now(),
    updated_at = now()
  returning d.id into v_id;

  update public.profiles
    set timezone = coalesce(nullif(p_timezone, ''), timezone),
        locale = coalesce(p_locale, locale),
        install_id = p_install_id,
        updated_at = now()
    where id = v_user;

  perform public.recalc_notification_state(v_user);
  return v_id;
end;
$$;

alter table public.execution_day_calendars
add column if not exists work_days jsonb not null default '{
  "0": false,
  "1": true,
  "2": true,
  "3": true,
  "4": true,
  "5": true,
  "6": false
}'::jsonb;

update public.execution_day_calendars
set work_days = '{
  "0": false,
  "1": true,
  "2": true,
  "3": true,
  "4": true,
  "5": true,
  "6": false
}'::jsonb
where work_days is null;

alter table public.execution_day_calendars
drop constraint if exists execution_day_calendars_work_days_shape;

alter table public.execution_day_calendars
add constraint execution_day_calendars_work_days_shape
check (
  jsonb_typeof(work_days) = 'object'
  and work_days ? '0'
  and work_days ? '1'
  and work_days ? '2'
  and work_days ? '3'
  and work_days ? '4'
  and work_days ? '5'
  and work_days ? '6'
  and jsonb_typeof(work_days -> '0') = 'boolean'
  and jsonb_typeof(work_days -> '1') = 'boolean'
  and jsonb_typeof(work_days -> '2') = 'boolean'
  and jsonb_typeof(work_days -> '3') = 'boolean'
  and jsonb_typeof(work_days -> '4') = 'boolean'
  and jsonb_typeof(work_days -> '5') = 'boolean'
  and jsonb_typeof(work_days -> '6') = 'boolean'
);
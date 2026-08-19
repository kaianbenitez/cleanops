-- The employee service-area join table is the sole operational source of
-- truth. Preserve existing primary-area choices before retiring the legacy
-- users.service_location_id column.
insert into employee_service_locations (company_id, user_id, service_location_id)
select company_id, id, service_location_id
from users
where service_location_id is not null
on conflict (company_id, user_id, service_location_id) do nothing;

alter table users drop column service_location_id;

insert into tenants (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Local Tenant', 'local-tenant')
on conflict (slug) do nothing;
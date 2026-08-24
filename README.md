# budget-manager

## Migrations

Existing Supabase databases must run this one-liner in the SQL editor before deploying this version:

```sql
alter table categories add column if not exists deleted_at timestamptz;
```

Category deletion is now a soft delete that syncs across devices via `deleted_at`. Without the column, every sync's categories push fails on boot and no data syncs (the app keeps working locally). Fresh databases created from `supabase/schema.sql` already include it.

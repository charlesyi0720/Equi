# supabase-postgres-best-practices

Best practices for Supabase and PostgreSQL development, including RLS policies, performance optimization, and security patterns.

## When to Use

- Writing database migrations
- Creating RLS policies
- Optimizing queries
- Designing database schemas
- Implementing auth patterns

## Core Principles

### 1. Row Level Security (RLS)

Always enable RLS on tables containing user data:

```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```

Common policy patterns:

```sql
-- Users can only read their own data
CREATE POLICY "Users read own data" ON table_name
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own data
CREATE POLICY "Users insert own data" ON table_name
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own data
CREATE POLICY "Users update own data" ON table_name
  FOR UPDATE USING (auth.uid() = user_id);
```

### 2. Indexes

Create indexes for frequently queried columns:

```sql
-- Single column index
CREATE INDEX idx_table_column ON table_name(column_name);

-- Composite index (order matters!)
CREATE INDEX idx_table_user_time ON table_name(user_id, created_at DESC);

-- Partial index for filtered queries
CREATE INDEX idx_active_users ON users(id) WHERE active = true;
```

### 3. Functions & RPC

Use `SECURITY DEFINER` for functions that need to bypass RLS:

```sql
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS TABLE(stat_name TEXT, stat_value INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller owns the data
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY SELECT ...;
END;
$$;
```

### 4. Triggers

Auto-update timestamps:

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER table_updated_at
  BEFORE UPDATE ON table_name
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 5. JSONB Best Practices

```sql
-- Index JSONB fields for fast queries
CREATE INDEX idx_data_field ON table_name USING GIN ((data->'field'));

-- Query JSONB efficiently
SELECT * FROM table_name WHERE data->>'status' = 'active';
SELECT * FROM table_name WHERE data @> '{"key": "value"}';
```

### 6. Performance Tips

- Use `EXPLAIN ANALYZE` to debug slow queries
- Avoid `SELECT *`, specify columns
- Use `LIMIT` for pagination
- Batch inserts when possible
- Use connection pooling (Supabase does this automatically)

### 7. Security Checklist

- ✅ Enable RLS on all user tables
- ✅ Never expose service_role key in client code
- ✅ Validate input in database functions
- ✅ Use prepared statements (Supabase client does this)
- ✅ Audit policies regularly
- ✅ Use CHECK constraints for data validation

### 8. Common Patterns

**Soft deletes:**
```sql
ALTER TABLE table_name ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_not_deleted ON table_name(id) WHERE deleted_at IS NULL;
```

**Audit trail:**
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Migration Best Practices

1. Always use transactions (migrations are wrapped automatically)
2. Test migrations on staging first
3. Make migrations reversible when possible
4. Avoid breaking changes (add columns as nullable first)
5. Use `IF NOT EXISTS` for idempotency

## Resources

- [Supabase Docs](https://supabase.com/docs)
- [PostgreSQL Performance Tips](https://wiki.postgresql.org/wiki/Performance_Optimization)

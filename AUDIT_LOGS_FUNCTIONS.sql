-- ============================================================
-- AUDIT LOGS - Helper Functions for Statistics
-- ============================================================

-- Get operation statistics
CREATE OR REPLACE FUNCTION get_audit_stats_by_operation(date_range TEXT DEFAULT '')
RETURNS TABLE(operation VARCHAR, count BIGINT) AS $$
BEGIN
    IF date_range = '' THEN
        RETURN QUERY
        SELECT audit_logs.operation, COUNT(*) as count
        FROM audit_logs
        GROUP BY audit_logs.operation
        ORDER BY count DESC;
    ELSE
        RETURN QUERY
        EXECUTE 'SELECT operation, COUNT(*) as count
                 FROM audit_logs ' || date_range || '
                 GROUP BY operation
                 ORDER BY count DESC';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get resource statistics
CREATE OR REPLACE FUNCTION get_audit_stats_by_resource(date_range TEXT DEFAULT '')
RETURNS TABLE(resource_type VARCHAR, count BIGINT) AS $$
BEGIN
    IF date_range = '' THEN
        RETURN QUERY
        SELECT audit_logs.resource_type, COUNT(*) as count
        FROM audit_logs
        GROUP BY audit_logs.resource_type
        ORDER BY count DESC;
    ELSE
        RETURN QUERY
        EXECUTE 'SELECT resource_type, COUNT(*) as count
                 FROM audit_logs ' || date_range || '
                 GROUP BY resource_type
                 ORDER BY count DESC';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get severity statistics
CREATE OR REPLACE FUNCTION get_audit_stats_by_severity(date_range TEXT DEFAULT '')
RETURNS TABLE(severity VARCHAR, count BIGINT) AS $$
BEGIN
    IF date_range = '' THEN
        RETURN QUERY
        SELECT audit_logs.severity, COUNT(*) as count
        FROM audit_logs
        GROUP BY audit_logs.severity
        ORDER BY count DESC;
    ELSE
        RETURN QUERY
        EXECUTE 'SELECT severity, COUNT(*) as count
                 FROM audit_logs ' || date_range || '
                 GROUP BY severity
                 ORDER BY count DESC';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RUN THIS IN SUPABASE SQL EDITOR:
-- 1. Go to SQL Editor
-- 2. Create new query
-- 3. Paste entire content
-- 4. Run query
-- ============================================================

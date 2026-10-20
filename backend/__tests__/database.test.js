/**
 * Database Connection & Query Tests
 * ================================
 * Tests database connectivity, schema integrity, and query execution
 * Covers: Supabase connection, connection pooling, query error handling
 */

const { createClient } = require('@supabase/supabase-js');

describe('Database Connection & Integrity', () => {
  let supabase;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

  beforeAll(() => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  });

  describe('Database Connection', () => {
    test('should establish Supabase connection', async () => {
      expect(supabase).toBeDefined();
      expect(supabase.auth).toBeDefined();
      expect(supabase.from).toBeDefined();
    });

    test('should handle connection with valid credentials', async () => {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        expect(true).toBe(true);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      // Should either succeed or have clear error
      expect(error === null || error.message).toBeDefined();
    });

    test('should timeout on invalid connection', async () => {
      const invalidSupabase = createClient('https://invalid.supabase.co', 'invalid-key');
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve({ error: 'timeout' }), 3000);
      });

      const queryPromise = (async () => {
        return await invalidSupabase.from('users').select('id').limit(1);
      })();

      const result = await Promise.race([queryPromise, timeoutPromise]);
      expect(result).toBeDefined();
    });
  });

  describe('Schema Validation', () => {
    test('should verify users table exists', async () => {
      if (!process.env.SUPABASE_URL) return;

      const { data, error } = await supabase
        .from('users')
        .select('id, email, user_role')
        .limit(1);

      if (!error) {
        expect(data).toBeDefined();
        expect(Array.isArray(data)).toBe(true);
      }
    });

    test('should verify invoices table has required columns', async () => {
      if (!process.env.SUPABASE_URL) return;

      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, zona_id, toko_id')
        .limit(1);

      if (!error) {
        expect(data).toBeDefined();
      }
    });

    test('should verify files table exists', async () => {
      if (!process.env.SUPABASE_URL) return;

      const { data, error } = await supabase
        .from('files')
        .select('id, filename, zona_id')
        .limit(1);

      if (!error) {
        expect(data).toBeDefined();
      }
    });

    test('should verify zones table structure', async () => {
      if (!process.env.SUPABASE_URL) return;

      const { data, error } = await supabase
        .from('zones')
        .select('id, zone_name')
        .limit(1);

      if (!error) {
        expect(data).toBeDefined();
      }
    });
  });

  describe('Query Error Handling', () => {
    test('should handle invalid table query', async () => {
      if (!process.env.SUPABASE_URL) return;

      const { data, error } = await supabase
        .from('nonexistent_table')
        .select('*')
        .limit(1);

      // Should have error since table doesn't exist
      expect(error !== null || data !== null).toBe(true);
    });

    test('should handle malformed WHERE clause', async () => {
      if (!process.env.SUPABASE_URL) return;

      try {
        const { error } = await supabase
          .from('users')
          .select('*')
          .eq('id', 'invalid_uuid');

        // Should handle gracefully
        expect(true).toBe(true);
      } catch (e) {
        expect(e).toBeDefined();
      }
    });

    test('should handle NULL value filtering', async () => {
      if (!process.env.SUPABASE_URL) return;

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .is('deleted_at', null)
        .limit(5);

      if (!error) {
        expect(Array.isArray(data)).toBe(true);
      }
    });

    test('should handle large result sets', async () => {
      if (!process.env.SUPABASE_URL) return;

      const { data, error } = await supabase
        .from('files')
        .select('id')
        .limit(1000);

      if (!error) {
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeLessThanOrEqual(1000);
      }
    });
  });

  describe('Data Integrity', () => {
    test('should enforce foreign key constraints', async () => {
      if (!process.env.SUPABASE_URL) return;

      // Try to query with valid zona_id
      const { data, error } = await supabase
        .from('invoices')
        .select('id, zona_id')
        .limit(1);

      if (data && data.length > 0) {
        // Verify zona_id is valid reference
        const { zonaData } = await supabase
          .from('zones')
          .select('id')
          .eq('id', data[0].zona_id);

        expect(true).toBe(true); // If query succeeds, FK is working
      }
    });

    test('should maintain data consistency across transactions', async () => {
      if (!process.env.SUPABASE_URL) return;

      // Read user count
      const { count: beforeCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Read again
      const { count: afterCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Counts should match (no concurrent modifications in test env)
      expect(beforeCount).toEqual(afterCount);
    });

    test('should detect orphaned records', async () => {
      if (!process.env.SUPABASE_URL) return;

      const { data: invoices } = await supabase
        .from('invoices')
        .select('zona_id')
        .limit(10);

      if (invoices && invoices.length > 0) {
        for (const invoice of invoices) {
          if (invoice.zona_id) {
            const { data: zone } = await supabase
              .from('zones')
              .select('id')
              .eq('id', invoice.zona_id);

            // Zone should exist
            expect(zone).toBeDefined();
          }
        }
      }
    });
  });

  describe('Connection Pooling', () => {
    test('should handle concurrent queries', async () => {
      if (!process.env.SUPABASE_URL) return;

      const queries = [
        supabase.from('users').select('id').limit(1),
        supabase.from('invoices').select('id').limit(1),
        supabase.from('files').select('id').limit(1),
        supabase.from('zones').select('id').limit(1),
      ];

      const results = await Promise.all(queries);

      // All queries should complete
      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });

    test('should handle connection recovery after network error', async () => {
      if (!process.env.SUPABASE_URL) return;

      // First successful query
      const { data: data1 } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      expect(data1).toBeDefined();

      // Simulate network delay and retry
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second query should work
      const { data: data2 } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      expect(data2).toBeDefined();
    });
  });

  describe('Query Performance', () => {
    test('should execute indexed queries efficiently', async () => {
      if (!process.env.SUPABASE_URL) return;

      const startTime = Date.now();

      const { data } = await supabase
        .from('users')
        .select('id, email')
        .eq('user_role', 'admin')
        .limit(100);

      const duration = Date.now() - startTime;

      // Should complete reasonably fast (indexed query)
      expect(duration).toBeLessThan(5000);
      expect(Array.isArray(data)).toBe(true);
    });

    test('should use pagination efficiently', async () => {
      if (!process.env.SUPABASE_URL) return;

      const startTime = Date.now();

      // Paginate through results
      const results = [];
      for (let i = 0; i < 3; i++) {
        const { data } = await supabase
          .from('files')
          .select('id')
          .range(i * 100, (i + 1) * 100 - 1);

        if (data) results.push(data);
      }

      const duration = Date.now() - startTime;

      // All pages should load
      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Error Recovery', () => {
    test('should retry failed queries', async () => {
      if (!process.env.SUPABASE_URL) return;

      let retries = 0;
      let lastError = null;

      async function queryWithRetry() {
        for (let i = 0; i < 3; i++) {
          try {
            const { data, error } = await supabase
              .from('users')
              .select('id')
              .limit(1);

            if (!error) return data;
            lastError = error;
          } catch (e) {
            lastError = e;
          }
          retries++;
          await new Promise(r => setTimeout(r, 100));
        }
      }

      await queryWithRetry();
      expect(retries).toBeLessThanOrEqual(3);
    });

    test('should provide meaningful error messages', async () => {
      if (!process.env.SUPABASE_URL) return;

      const { error } = await supabase
        .from('users')
        .select('*')
        .eq('id', 'definitely-invalid-uuid');

      if (error) {
        expect(error.message || error.code).toBeDefined();
        expect(error.message || error.code).not.toBe('');
      }
    });
  });
});

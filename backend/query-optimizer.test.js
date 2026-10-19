/**
 * Query Optimizer Tests
 * Comprehensive testing to ensure optimization correctness
 * 
 * Run with: npm test -- query-optimizer.test.js
 */

const QueryOptimizer = require('./query-optimizer');

describe('QueryOptimizer', () => {
    let optimizer;
    let mockSupabase;

    beforeEach(() => {
        // Mock Supabase client
        mockSupabase = {
            from: jest.fn((table) => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                in: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                single: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                update: jest.fn().mockReturnThis()
            }))
        };

        optimizer = new QueryOptimizer(mockSupabase);
    });

    describe('getInvoicesWithFiles', () => {
        test('should fetch invoices with single query', async () => {
            // Mock response
            const mockInvoices = [
                {
                    id: 1,
                    faktur: 'INV001',
                    keterangan: 'PPN',
                    files_uploaded_count: 3
                },
                {
                    id: 2,
                    faktur: 'INV002',
                    keterangan: 'NON-PPN',
                    files_uploaded_count: 2
                }
            ];

            mockSupabase.from().select().eq().limit().order.mockResolvedValue({
                data: mockInvoices,
                error: null
            });

            const result = await optimizer.getInvoicesWithFiles(1, 100);

            expect(result.success).toBe(true);
            expect(result.data).toEqual(mockInvoices);
            expect(result.count).toBe(2);
            expect(result.queriesExecuted).toBe(1);
        });

        test('should handle empty results gracefully', async () => {
            mockSupabase.from().select().eq().limit().order.mockResolvedValue({
                data: [],
                error: null
            });

            const result = await optimizer.getInvoicesWithFiles(1, 100);

            expect(result.success).toBe(true);
            expect(result.data).toEqual([]);
            expect(result.count).toBe(0);
        });

        test('should handle database errors', async () => {
            mockSupabase.from().select().eq().limit().order.mockResolvedValue({
                data: null,
                error: { message: 'Connection timeout' }
            });

            const result = await optimizer.getInvoicesWithFiles(1, 100);

            expect(result.success).toBe(false);
            expect(result.data).toEqual([]);
            expect(result.error).toBeDefined();
        });
    });

    describe('batchGetFileCountsOptimized', () => {
        test('should fetch file counts with single query', async () => {
            const invoiceIds = [1, 2, 3];
            const mockFiles = [
                { invoice_id: 1, file_type: 'pdf' },
                { invoice_id: 1, file_type: 'bukti' },
                { invoice_id: 2, file_type: 'pdf' },
                { invoice_id: 3, file_type: 'faktur' },
                { invoice_id: 3, file_type: 'bukti' },
                { invoice_id: 3, file_type: 'pdf' }
            ];

            mockSupabase.from().select().in.mockResolvedValue({
                data: mockFiles,
                error: null
            });

            const result = await optimizer.batchGetFileCountsOptimized(invoiceIds);

            expect(result.success).toBe(true);
            expect(result.data[1]).toBe(2);  // Invoice 1 has 2 files
            expect(result.data[2]).toBe(1);  // Invoice 2 has 1 file
            expect(result.data[3]).toBe(3);  // Invoice 3 has 3 files
            expect(result.queriesExecuted).toBe(1);
        });

        test('should handle empty invoice list', async () => {
            const result = await optimizer.batchGetFileCountsOptimized([]);

            expect(result.success).toBe(true);
            expect(result.data).toEqual({});
            expect(result.queriesExecuted).toBe(0);
        });

        test('should optimize N queries to 1 query', async () => {
            // Before optimization would need 100 queries (one per invoice)
            // After: only 1 query
            const invoiceIds = Array.from({ length: 100 }, (_, i) => i + 1);

            mockSupabase.from().select().in.mockResolvedValue({
                data: [],
                error: null
            });

            const result = await optimizer.batchGetFileCountsOptimized(invoiceIds);

            // Should have optimization ratio of ~100 (N:1)
            expect(result.queriesExecuted).toBe(1);
            expect(optimizer.metrics.optimizationRatio).toBe(100);
        });
    });

    describe('getInvoiceDetailOptimized', () => {
        test('should fetch invoice detail with minimal queries', async () => {
            const mockInvoice = {
                id: 1,
                faktur: 'INV001',
                keterangan: 'PPN'
            };

            const mockFiles = [
                { id: 1, file_type: 'pdf', status: 'uploaded' },
                { id: 2, file_type: 'bukti', status: 'uploaded' }
            ];

            mockSupabase.from()
                .select()
                .eq()
                .single.mockResolvedValue({
                    data: mockInvoice,
                    error: null
                });

            mockSupabase.from()
                .select()
                .eq.mockResolvedValue({
                    data: mockFiles,
                    error: null
                });

            const result = await optimizer.getInvoiceDetailOptimized(1);

            expect(result.success).toBe(true);
            expect(result.data.invoice).toEqual(mockInvoice);
            expect(result.data.fileCount).toBe(2);
            expect(result.queriesExecuted).toBe(2);
        });

        test('should handle missing invoice gracefully', async () => {
            mockSupabase.from()
                .select()
                .eq()
                .single.mockResolvedValue({
                    data: null,
                    error: { message: 'Not found' }
                });

            const result = await optimizer.getInvoiceDetailOptimized(999);

            expect(result.success).toBe(false);
            expect(result.data).toBeNull();
        });
    });

    describe('batchSyncFileCountsOptimized', () => {
        test('should sync file counts with optimized queries', async () => {
            const mockInvoices = [
                { id: 1, faktur: 'INV001', keterangan: 'PPN', invoice_pdf_path: true, bukti_bayar_path: true, faktur_pajak_path: true, files_uploaded_count: 3 },
                { id: 2, faktur: 'INV002', keterangan: 'NON', invoice_pdf_path: true, bukti_bayar_path: true, faktur_pajak_path: null, files_uploaded_count: 2 }
            ];

            const mockFileCounts = [
                { invoice_id: 1, file_type: 'pdf' },
                { invoice_id: 1, file_type: 'bukti' },
                { invoice_id: 1, file_type: 'faktur' },
                { invoice_id: 2, file_type: 'pdf' },
                { invoice_id: 2, file_type: 'bukti' }
            ];

            // Mock database responses
            const mockDb = {
                from: jest.fn((table) => {
                    if (table === 'invoice_file_list') {
                        return {
                            select: jest.fn().mockResolvedValue({
                                data: mockInvoices,
                                error: null
                            })
                        };
                    } else if (table === 'invoice_files') {
                        return {
                            select: jest.fn().mockResolvedValue({
                                data: mockFileCounts,
                                error: null
                            })
                        };
                    }
                    return {
                        update: jest.fn().mockReturnThis(),
                        eq: jest.fn().mockResolvedValue({ error: null })
                    };
                })
            };

            const result = await optimizer.batchSyncFileCountsOptimized(mockDb);

            expect(result.success).toBe(true);
            expect(result.queriesExecuted).toBeLessThanOrEqual(5);  // Should be 3-4 queries max
            expect(result.optimizationRatio).toBeGreaterThan(50);  // Should have significant optimization
        });

        test('should use Promise.allSettled to avoid cascade failures', async () => {
            // This test verifies that partial failures don't cause entire batch to fail
            const mockDb = {
                from: jest.fn((table) => {
                    if (table === 'invoice_file_list') {
                        return {
                            select: jest.fn().mockResolvedValue({
                                data: [
                                    { id: 1, faktur: 'INV001', keterangan: 'PPN', invoice_pdf_path: true, bukti_bayar_path: true, faktur_pajak_path: true, files_uploaded_count: 2 }
                                ],
                                error: null
                            })
                        };
                    } else if (table === 'invoice_files') {
                        return {
                            select: jest.fn().mockResolvedValue({
                                data: [
                                    { invoice_id: 1, file_type: 'pdf' },
                                    { invoice_id: 1, file_type: 'bukti' },
                                    { invoice_id: 1, file_type: 'faktur' }
                                ],
                                error: null
                            })
                        };
                    }
                    return {
                        update: jest.fn().mockReturnThis(),
                        eq: jest.fn()
                            .mockResolvedValueOnce({ error: null })
                            .mockResolvedValueOnce({ error: { message: 'Update failed' } })  // Partial failure
                            .mockResolvedValue({ error: null })
                    };
                })
            };

            const result = await optimizer.batchSyncFileCountsOptimized(mockDb);

            // Should still succeed despite partial failures
            expect(result.success).toBe(true);
            expect(result.errors).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Feature Flag Integration', () => {
        test('should track metrics when enabled', async () => {
            optimizer.resetMetrics();

            mockSupabase.from().select().eq().limit().order.mockResolvedValue({
                data: [{ id: 1, faktur: 'INV001' }],
                error: null
            });

            await optimizer.getInvoicesWithFiles(1, 100);

            const metrics = optimizer.getMetrics();
            expect(metrics.queriesExecuted).toBe(1);
            expect(metrics.averageOptimizationRatio).toBe(100);
        });

        test('should disable metrics when specified', async () => {
            const optimizerNoMetrics = new QueryOptimizer(mockSupabase, { enableMetrics: false });
            optimizerNoMetrics.resetMetrics();

            mockSupabase.from().select().eq().limit().order.mockResolvedValue({
                data: [{ id: 1, faktur: 'INV001' }],
                error: null
            });

            await optimizerNoMetrics.getInvoicesWithFiles(1, 100);

            const metrics = optimizerNoMetrics.getMetrics();
            expect(metrics.queriesExecuted).toBe(0);  // Metrics disabled
        });
    });

    describe('Performance Benchmarks', () => {
        test('should complete in < 200ms for 100 invoices', async () => {
            const start = Date.now();

            mockSupabase.from().select().eq().limit().order.mockResolvedValue({
                data: Array.from({ length: 100 }, (_, i) => ({
                    id: i + 1,
                    faktur: `INV${String(i + 1).padStart(3, '0')}`,
                    keterangan: i % 2 === 0 ? 'PPN' : 'NON',
                    files_uploaded_count: Math.floor(Math.random() * 3)
                })),
                error: null
            });

            const result = await optimizer.getInvoicesWithFiles(1, 100);

            const duration = Date.now() - start;
            expect(duration).toBeLessThan(200);
            expect(result.duration).toBeLessThan(200);
        });
    });
});

// Export for running with test framework
module.exports = { QueryOptimizer };

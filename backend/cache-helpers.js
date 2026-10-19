// ============================================================
// Cache Helper Module - Simplify cache usage in endpoints
// ============================================================

/**
 * Helper functions untuk cache operations
 * Simplify cache usage di endpoints
 */

class CacheHelper {
    constructor(cache) {
        this.cache = cache;
    }

    /**
     * Get dari cache, jika tidak ada execute function dan cache hasilnya
     * 
     * Usage:
     * const invoice = await cacheHelper.rememberInvoice(id, async () => {
     *     return await supabase.from('invoices').select('*').eq('id', id);
     * });
     */
    async rememberInvoice(id, fn, ttl = 3600) {
        if (!this.cache) return await fn();
        
        const key = `invoice:${id}`;
        return await this.cache.remember(key, fn, ttl);
    }

    async rememberInvoices(page, limit, fn, ttl = 3600) {
        if (!this.cache) return await fn();
        
        const key = `invoices:${page}:${limit}`;
        return await this.cache.remember(key, fn, ttl);
    }

    async rememberUser(userId, fn, ttl = 3600) {
        if (!this.cache) return await fn();
        
        const key = `user:${userId}`;
        return await this.cache.remember(key, fn, ttl);
    }

    async rememberFileCount(invoiceId, fn, ttl = 1800) {
        if (!this.cache) return await fn();
        
        const key = `filecount:${invoiceId}`;
        return await this.cache.remember(key, fn, ttl);
    }

    /**
     * Invalidate (delete) cache untuk key tertentu
     */
    async invalidateInvoice(id) {
        if (!this.cache) return;
        await this.cache.delete(`invoice:${id}`);
    }

    async invalidateInvoiceList() {
        if (!this.cache) return;
        await this.cache.deletePattern('invoices:*');
    }

    async invalidateUser(userId) {
        if (!this.cache) return;
        await this.cache.delete(`user:${userId}`);
    }

    async invalidateFileCount(invoiceId) {
        if (!this.cache) return;
        await this.cache.delete(`filecount:${invoiceId}`);
    }

    async invalidateAll() {
        if (!this.cache) return;
        await this.cache.flush();
    }

    /**
     * Batch invalidation untuk common patterns
     */
    async invalidateAfterInvoiceUpdate(invoiceId) {
        await this.invalidateInvoice(invoiceId);
        await this.invalidateInvoiceList();
        await this.invalidateFileCount(invoiceId);
    }

    /**
     * Get cache statistics
     */
    getStats() {
        if (!this.cache) return null;
        return this.cache.getStats();
    }
}

module.exports = CacheHelper;

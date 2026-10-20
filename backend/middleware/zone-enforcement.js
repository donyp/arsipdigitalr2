/**
 * Zone Enforcement Middleware
 * Ensures admin_zona users cannot access other zones
 * Forces zona_id to user's zona on all requests
 * 
 * Security Fix #2: Prevents zone traversal vulnerability
 */

module.exports = function zoneEnforcement(req, res, next) {
    // Skip if no authenticated user
    if (!req.user) {
        return next();
    }

    // Bypass for super_admin and moderator (they can access all zones)
    if (req.user.role === 'super_admin' || req.user.role === 'moderator') {
        console.log(`[Zone Enforcement] ${req.user.role} ${req.user.userId} - bypass all zones`);
        return next();
    }

    // Enforce zona for admin_zona users
    if (req.user.role === 'admin_zona' && req.user.zona_id) {
        const userZonaId = parseInt(req.user.zona_id);
        
        // Get requested zona from query, body, or params
        const requestedZonaQuery = req.query.zona_id ? parseInt(req.query.zona_id) : null;
        const requestedZonaBody = req.body?.zona_id ? parseInt(req.body.zona_id) : null;
        const requestedZonaParams = req.params?.zona_id ? parseInt(req.params.zona_id) : null;
        
        const requestedZona = requestedZonaQuery || requestedZonaBody || requestedZonaParams;
        
        // Check if client supplied different zona_id
        if (requestedZona && requestedZona !== userZonaId) {
            console.log(`[Zone Enforcement] BLOCKED: User ${req.user.userId} (zona ${userZonaId}) tried to access zona ${requestedZona}`);
            
            return res.status(403).json({
                error: 'Akses ditolak: Anda tidak memiliki izin untuk mengakses zona ini.',
                details: {
                    userZona: userZonaId,
                    requestedZona: requestedZona,
                    allowed: false
                }
            });
        }
        
        // Force zona_id to user's zona on all requests (defense in depth)
        if (req.query) req.query.zona_id = userZonaId;
        if (req.body) req.body.zona_id = userZonaId;
        if (req.params) req.params.zona_id = userZonaId;
        
        console.log(`[Zone Enforcement] Enforced zona ${userZonaId} for admin_zona user ${req.user.userId}`);
    }
    
    // Regular users have no zone access
    if (req.user.role === 'user') {
        const requestedZona = req.query.zona_id || req.body?.zona_id || req.params?.zona_id;
        if (requestedZona) {
            console.log(`[Zone Enforcement] BLOCKED: Regular user ${req.user.userId} tried to access zona ${requestedZona}`);
            return res.status(403).json({
                error: 'Anda tidak memiliki akses ke fitur ini.'
            });
        }
    }
    
    next();
};

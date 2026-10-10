/**
 * Authentication Endpoints
 * Simplified login: username/password only (Daily Token system removed)
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

module.exports = function registerAuthEndpoints(app, supabase) {

    /**
     * POST /api/auth/login
     * Simplified login: Verify username and password, return JWT token
     */
    app.post('/api/auth/login', async (req, res) => {
        try {
            console.log('[Auth] POST /api/auth/login received');
            
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Username dan password harus diisi'
                });
            }

            console.log(`[Auth] Login attempt for user: ${username}`);

            // Get user by username
            const { data: users, error: fetchError } = await supabase
                .from('users')
                .select('id, username, email, password_hash, role, zona_id')
                .eq('username', username)
                .single();

            if (fetchError || !users) {
                console.warn(`[Auth] User not found: ${username}`, fetchError?.message);
                return res.status(401).json({
                    success: false,
                    error: 'Username atau password salah'
                });
            }

            // Verify password
            const passwordValid = await bcrypt.compare(password, users.password_hash);
            if (!passwordValid) {
                console.warn(`[Auth] Invalid password for user: ${username}`);
                return res.status(401).json({
                    success: false,
                    error: 'Username atau password salah'
                });
            }

            console.log(`[Auth] ✅ Password verified for user: ${username}`);

            // Issue JWT token directly
            const jwtToken = jwt.sign(
                {
                    userId: users.id,
                    username: users.username,
                    email: users.email,
                    role: users.role || 'user',
                    zona_id: users.zona_id || null,
                    stage: 'authenticated'
                },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
            );

            return res.json({
                success: true,
                message: 'Login berhasil',
                token: jwtToken,
                user: {
                    id: users.id,
                    username: users.username,
                    email: users.email,
                    role: users.role || 'user'
                }
            });


};



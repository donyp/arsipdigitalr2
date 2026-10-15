/**
 * Server-side Device Restriction Middleware
 * Block mobile devices at server level
 */

const deviceCheckMiddleware = (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    
    // Mobile patterns
    const mobilePatterns = [
        /Android/i,
        /webOS/i,
        /iPhone/i,
        /iPad/i,
        /iPod/i,
        /BlackBerry/i,
        /IEMobile/i,
        /Opera Mini/i,
        /Mobile/i,
        /Tablet/i,
        /Windows Phone/i,
        /Kindle/i,
        /Silk/i,
        /PlayBook/i
    ];

    // Check if mobile
    const isMobile = mobilePatterns.some(pattern => pattern.test(userAgent));

    if (isMobile) {
        // Log blocked attempt
        console.warn('[Device Block] Mobile access attempt:', {
            ip: req.ip,
            userAgent: userAgent,
            path: req.path,
            timestamp: new Date().toISOString()
        });

        // Return blocked page
        return res.status(403).send(`
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Akses Ditolak - Desktop Only</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    
                    .container {
                        background: white;
                        border-radius: 20px;
                        padding: 40px;
                        max-width: 500px;
                        width: 100%;
                        text-align: center;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    }
                    
                    .icon {
                        font-size: 72px;
                        margin-bottom: 24px;
                        animation: shake 0.5s ease-in-out;
                    }
                    
                    @keyframes shake {
                        0%, 100% { transform: translateX(0); }
                        25% { transform: translateX(-10px); }
                        75% { transform: translateX(10px); }
                    }
                    
                    h1 {
                        font-size: 28px;
                        font-weight: 700;
                        color: #1e293b;
                        margin-bottom: 16px;
                    }
                    
                    .message {
                        font-size: 16px;
                        color: #64748b;
                        line-height: 1.6;
                        margin-bottom: 32px;
                    }
                    
                    .details {
                        background: #f1f5f9;
                        border-radius: 12px;
                        padding: 20px;
                        text-align: left;
                        font-size: 14px;
                        color: #475569;
                    }
                    
                    .details div {
                        margin: 10px 0;
                        word-break: break-word;
                    }
                    
                    .details strong {
                        color: #1e293b;
                        display: inline-block;
                        min-width: 100px;
                    }
                    
                    .footer {
                        margin-top: 24px;
                        font-size: 13px;
                        color: #94a3b8;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">🖥️🚫📱</div>
                    <h1>Akses Hanya Desktop/Laptop</h1>
                    <p class="message">
                        <strong>Platform Arsip Digital ANKA hanya dapat diakses melalui komputer desktop atau laptop.</strong><br><br>
                        Untuk keamanan dan performa optimal, akses dari perangkat mobile tidak diizinkan.
                    </p>
                    <div class="details">
                        <div><strong>Status:</strong> <span style="color: #dc2626;">❌ Akses Ditolak</span></div>
                        <div><strong>Perangkat:</strong> Mobile Device Detected</div>
                        <div><strong>Waktu:</strong> ${new Date().toLocaleString('id-ID')}</div>
                        <div><strong>IP Address:</strong> ${req.ip}</div>
                    </div>
                    <div class="footer">
                        Silakan gunakan komputer untuk mengakses sistem ini.
                    </div>
                </div>
            </body>
            </html>
        `);
    }

    // Allow desktop access
    next();
};

// API endpoint untuk log blocked attempts
const logBlockedAccess = (req, res) => {
    const data = req.body;
    
    console.warn('[Device Block] Client-side detection:', {
        ...data,
        ip: req.ip,
        headers: req.headers
    });

    // Optionally save to database
    // db.query('INSERT INTO blocked_attempts SET ?', data);

    res.status(200).json({ logged: true });
};

module.exports = {
    deviceCheckMiddleware,
    logBlockedAccess
};

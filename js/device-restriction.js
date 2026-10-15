/**
 * Device Restriction System
 * Block mobile devices (smartphones & tablets)
 * Allow only desktop/laptop access
 */

(function() {
    'use strict';

    const DeviceRestriction = {
        // Strict mobile detection patterns
        mobilePatterns: [
            /Android/i,
            /webOS/i,
            /iPhone/i,
            /iPad/i,
            /iPod/i,
            /BlackBerry/i,
            /IEMobile/i,
            /Opera Mini/i,
            /Mobile/i,
            /mobile/i,
            /Tablet/i,
            /tablet/i
        ],

        // Additional mobile indicators
        mobileKeywords: [
            'Mobile', 'mobile', 'Android', 'iPhone', 'iPad', 'iPod',
            'BlackBerry', 'IEMobile', 'Opera Mini', 'webOS',
            'Windows Phone', 'Kindle', 'Silk', 'PlayBook'
        ],

        init() {
            // Run all checks
            if (this.isMobileDevice()) {
                this.blockAccess();
                return false;
            }

            // Additional runtime checks
            this.setupRuntimeChecks();
            return true;
        },

        isMobileDevice() {
            const ua = navigator.userAgent || navigator.vendor || window.opera;
            
            // Check 1: User agent patterns
            for (let pattern of this.mobilePatterns) {
                if (pattern.test(ua)) {
                    console.warn('[Device Check] Mobile pattern detected:', pattern);
                    return true;
                }
            }

            // Check 2: Touch capability + small screen (likely mobile)
            const hasTouch = ('ontouchstart' in window) || 
                            (navigator.maxTouchPoints > 0) || 
                            (navigator.msMaxTouchPoints > 0);
            
            const smallScreen = window.innerWidth < 768 || window.screen.width < 768;
            
            if (hasTouch && smallScreen) {
                console.warn('[Device Check] Touch + small screen detected');
                return true;
            }

            // Check 3: Screen orientation API (mobile specific)
            if (typeof window.orientation !== 'undefined') {
                console.warn('[Device Check] Orientation API detected (mobile)');
                return true;
            }

            // Check 4: Device pixel ratio (high DPR + small screen = mobile)
            const highDPR = window.devicePixelRatio > 2;
            if (highDPR && smallScreen) {
                console.warn('[Device Check] High DPR + small screen');
                return true;
            }

            // Check 5: Platform check
            const platform = navigator.platform || '';
            const mobilePlatforms = ['iPhone', 'iPad', 'iPod', 'Android', 'Linux armv'];
            for (let mp of mobilePlatforms) {
                if (platform.includes(mp)) {
                    console.warn('[Device Check] Mobile platform:', platform);
                    return true;
                }
            }

            // Check 6: maxTouchPoints (tablets usually have 5+)
            if (navigator.maxTouchPoints > 1 && smallScreen) {
                console.warn('[Device Check] Multi-touch capability detected');
                return true;
            }

            // Check 7: Standalone mode (PWA on mobile)
            if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
                if (smallScreen) {
                    console.warn('[Device Check] PWA standalone mode on small screen');
                    return true;
                }
            }

            return false;
        },

        blockAccess() {
            // Clear page content immediately
            document.body.innerHTML = '';
            document.head.innerHTML = '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Akses Ditolak</title>';

            // Create blocking overlay
            const overlay = document.createElement('div');
            overlay.id = 'device-block-overlay';
            overlay.innerHTML = `
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    #device-block-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100vw;
                        height: 100vh;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 999999;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    }
                    
                    .block-content {
                        background: white;
                        border-radius: 20px;
                        padding: 40px;
                        max-width: 90%;
                        width: 400px;
                        text-align: center;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    }
                    
                    .block-icon {
                        font-size: 64px;
                        margin-bottom: 20px;
                    }
                    
                    .block-title {
                        font-size: 24px;
                        font-weight: 700;
                        color: #1e293b;
                        margin-bottom: 16px;
                    }
                    
                    .block-message {
                        font-size: 16px;
                        color: #64748b;
                        line-height: 1.6;
                        margin-bottom: 24px;
                    }
                    
                    .block-details {
                        background: #f1f5f9;
                        border-radius: 12px;
                        padding: 16px;
                        margin-top: 20px;
                        font-size: 13px;
                        color: #475569;
                        text-align: left;
                    }
                    
                    .block-details div {
                        margin: 8px 0;
                        word-break: break-all;
                    }
                    
                    .block-details strong {
                        color: #1e293b;
                        display: inline-block;
                        min-width: 120px;
                    }
                </style>
                
                <div class="block-content">
                    <div class="block-icon">🚫</div>
                    <h1 class="block-title">Akses Ditolak</h1>
                    <p class="block-message">
                        <strong>Sistem ini hanya dapat diakses melalui Desktop atau Laptop.</strong><br><br>
                        Silakan gunakan komputer untuk mengakses platform Arsip Digital ANKA.
                    </p>
                    <div class="block-details">
                        <div><strong>Perangkat:</strong> ${this.getDeviceType()}</div>
                        <div><strong>Browser:</strong> ${this.getBrowserInfo()}</div>
                        <div><strong>Resolusi:</strong> ${window.screen.width}x${window.screen.height}</div>
                        <div><strong>Alasan:</strong> Mobile/tablet tidak diizinkan</div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            
            // Prevent any interaction
            document.addEventListener('click', (e) => e.stopPropagation(), true);
            document.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
            document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
            
            // Prevent back navigation
            history.pushState(null, null, location.href);
            window.addEventListener('popstate', () => {
                history.pushState(null, null, location.href);
            });

            // Log blocked attempt
            this.logBlockedAttempt();
        },

        setupRuntimeChecks() {
            // Check on resize (if user switches to mobile view)
            let resizeTimer;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    if (this.isMobileDevice()) {
                        this.blockAccess();
                    }
                }, 500);
            });

            // Check orientation change (mobile specific)
            window.addEventListener('orientationchange', () => {
                if (this.isMobileDevice()) {
                    this.blockAccess();
                }
            });
        },

        getDeviceType() {
            const ua = navigator.userAgent;
            if (/iPad/i.test(ua)) return 'iPad';
            if (/iPhone/i.test(ua)) return 'iPhone';
            if (/Android.*Tablet/i.test(ua)) return 'Android Tablet';
            if (/Android/i.test(ua)) return 'Android Phone';
            if (/Mobile/i.test(ua)) return 'Mobile Device';
            return 'Unknown Mobile Device';
        },

        getBrowserInfo() {
            const ua = navigator.userAgent;
            if (/Chrome/i.test(ua)) return 'Chrome Mobile';
            if (/Safari/i.test(ua)) return 'Safari Mobile';
            if (/Firefox/i.test(ua)) return 'Firefox Mobile';
            if (/Edge/i.test(ua)) return 'Edge Mobile';
            return 'Unknown Browser';
        },

        logBlockedAttempt() {
            // Send to server for monitoring
            const data = {
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                screen: `${window.screen.width}x${window.screen.height}`,
                viewport: `${window.innerWidth}x${window.innerHeight}`,
                deviceType: this.getDeviceType(),
                browser: this.getBrowserInfo()
            };

            // Log to console for debugging
            console.warn('[Device Restriction] Access blocked:', data);

            // Send to server (optional)
            try {
                fetch('/api/log-blocked-access', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }).catch(() => {}); // Ignore errors
            } catch (e) {
                // Silent fail
            }
        }
    };

    // Initialize immediately (before page load)
    if (document.readyState === 'loading') {
        DeviceRestriction.init();
    } else {
        DeviceRestriction.init();
    }

    // Also check on DOMContentLoaded as backup
    document.addEventListener('DOMContentLoaded', () => {
        DeviceRestriction.init();
    });

    // Export for manual checks
    window.DeviceRestriction = DeviceRestriction;
})();

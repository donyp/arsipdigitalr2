// ============================================================
// Global Announcement Banner - Appears on all pages
// Version 2.0.0 - Full width scrolling, permanent banner
// ============================================================

(function() {
    function createBanner() {
        const banner = document.createElement('div');
        banner.id = 'global-announcement-banner';
        banner.className = 'global-announcement-banner';
        
        // Get custom headline from localStorage or use default
        const customHeadline = localStorage.getItem('customHeadline') || 'Jika ada kendala, silahkan hubungi admin anka';
        
        // Calculate animation duration based on text length (slower)
        const textLength = customHeadline.length;
        const duration = Math.max(20, Math.ceil((textLength / 45) * 35));
        
        // Dual message for seamless loop
        const message = `📢  ${customHeadline}  •  `;
        
        banner.innerHTML = `
            <div class="announcement-content">
                <div class="announcement-text">
                    <span class="announcement-message" style="animation-duration: ${duration}s;">${message}</span>
                    <span class="announcement-message" style="animation-duration: ${duration}s;">${message}</span>
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #global-announcement-banner {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                width: 100%;
                z-index: 99999;
                background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                padding: 0;
                margin: 0;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                overflow: hidden;
            }

            .announcement-content {
                display: flex;
                align-items: center;
                padding: 14px 0;
                color: white;
                font-size: 16px;
                font-weight: 800;
                letter-spacing: 2.5px;
                width: 100%;
                overflow: hidden;
            }

            .announcement-text {
                display: flex;
                align-items: center;
                width: 100%;
                overflow: hidden;
            }

            .announcement-message {
                display: inline-block;
                animation: scrollText linear infinite;
                white-space: nowrap;
                padding-right: 50px;
                font-weight: 800;
                font-size: 16px;
                letter-spacing: 2.5px;
                min-width: 100%;
            }

            @keyframes scrollText {
                0% {
                    transform: translateX(100%);
                }
                100% {
                    transform: translateX(-100%);
                }
            }

            /* Adjust page layout when banner is present */
            body.has-announcement {
                padding-top: 52px;
            }

            /* Ensure sidebar accounts for banner */
            #sidebar {
                top: 52px !important;
                height: calc(100vh - 52px) !important;
            }

            /* Adjust main content for banner */
            #main-content {
                padding-top: 0 !important;
            }

            @media (max-width: 768px) {
                .announcement-content {
                    padding: 12px 0;
                    font-size: 13px;
                }

                .announcement-message {
                    font-size: 13px;
                    padding-right: 40px;
                }

                body.has-announcement {
                    padding-top: 48px;
                }

                #sidebar {
                    top: 48px !important;
                    height: calc(100vh - 48px) !important;
                }
            }

            @media (max-width: 480px) {
                .announcement-content {
                    padding: 10px 0;
                    font-size: 11px;
                }

                .announcement-message {
                    font-size: 11px;
                    padding-right: 30px;
                }

                body.has-announcement {
                    padding-top: 44px;
                }

                #sidebar {
                    top: 44px !important;
                    height: calc(100vh - 44px) !important;
                }
            }
        `;

        // Insert at the very beginning of body
        document.head.appendChild(style);
        document.body.insertBefore(banner, document.body.firstChild);
        document.body.classList.add('has-announcement');
    }

    // Inject as soon as DOM is ready
    function init() {
        if (document.body) {
            createBanner();
        } else {
            document.addEventListener('DOMContentLoaded', createBanner);
        }
    }

    // Initialize immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

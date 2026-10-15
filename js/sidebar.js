/**
 * Sidebar Component - Clean Implementation
 * Single source of truth for sidebar styling and structure
 * All menu items render with IDENTICAL height, padding, and font-size
 */

(function() {
    console.log('[SIDEBAR] Initializing clean sidebar...');

    // ============================================================
    // INJECT SIDEBAR CSS IMMEDIATELY (Global - all pages)
    // ============================================================
    (function injectGlobalSidebarCSS() {
        if (document.getElementById('sidebar-css-global')) return;
        
        const css = `
            /* Pulsing Heartbeat Animation - GLOBAL */
            @keyframes heartbeat-pulse {
                0%, 100% {
                    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
                }
                50% {
                    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
                }
            }

            /* Ensure active items have position relative for ::before */
            .sidebar-item.active,
            .sidebar-child-item.active {
                position: relative !important;
            }

            /* Active menu item with pulsing heartbeat - applies to all pages */
            .sidebar-item.active::before,
            .sidebar-child-item.active::before {
                content: '';
                position: absolute !important;
                right: 8px !important;
                top: 50% !important;
                transform: translateY(-50%) !important;
                width: 8px !important;
                height: 8px !important;
                background: #3b82f6 !important;
                border-radius: 50% !important;
                animation: heartbeat-pulse 2s infinite ease-in-out !important;
                z-index: 10 !important;
                display: block !important;
                visibility: visible !important;
            }

            /* ANKA Logo styling for sidebar - Light mode */
            .logo-anka-sidebar {
                background-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPCEtLSBHZW5lcmF0b3I6IHZpc2lvbmNvcnRleCBWVHJhY2VyIDAuNi40IC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB3aWR0aD0iNjkyOSIgaGVpZ2h0PSIxNjQ3Ij4KPHBhdGggZD0iTTAgMCBDMTUwLjQ4IDAgMzAwLjk2IDAgNDU2IDAgQzQ1NiAxMzEuMzQgNDU2IDI2Mi42OCA0NTYgMzk4IEM1MTIuOTMgMzk3LjUgNTEyLjkzIDM5Ny41IDU3MSAzOTcgQzYyNS40NCAzOTcuMTQgNjI1LjQ0IDM5Ny4xNCA2NDguNzcgMzk3LjMyIEM2NTYuNTUgMzk2LjY1IDY1OS44NSAzOTMuNCA2NjQuNzMgMzg3LjczIEM2NjUuNDggMzg2LjgzIDY2Ni4yMyAzODUuOTMgNjY3IDM4NSBDNjY4LjM5IDM4My43MiA2NjkuOCAzODIuNDYgNjcxLjI1IDM4MS4yNSBDNjc0LjM3IDM3OC41OSA2NzcuMjUgMzc1Ljc3IDY4MC4xMyAzNzIuODQgQzY4MS45MyAzNzEuMDcgNjgzLjc5IDM2OS40MSA2ODUuNzEgMzY3Ljc2IEM2ODkuOTcgMzY0LjA1IDY5NC4wOSAzNjAuMiA2OTguMTkgMzU2LjMxIEM3MDMuMjkgMzUxLjQ5IDcwOC40IDM0Ni42OSA3MTMuNTYgMzQxLjk0IEM3MTguNCAzMzcuNDkgNzIzLjIxIDMzMyA3MjggMzI4LjUgQzczMy4zNiAzMjMuNDcgNzM4LjczIDMxOC40NiA3NDQuMTQgMzEzLjQ4IEM3NTAuNzkgMzA3LjM2IDc1Ny4zOSAzMDEuMTggNzY0IDI5NSBDNzcxLjY4IDI4Ny44MiA3NzkuMzYgMjgwLjY2IDc4Ny4wOSAyNzMuNTMgQzc5My43NiAyNjcuMzkgODAwLjM4IDI2MS4xOSA4MDcgMjU1IEM4MTQuNjggMjQ3LjgyIDgyMi4zNiAyNDAuNjYgODMwLjA5IDIzMy41MyBDODM2Ljc2IDIyNy4zOSA4NDMuMzggMjIxLjE5IDg1MCAyMTUgQzg1Ny42OCAyMDcuODIgODY1LjM2IDIwMC42NiA4NzMuMDkgMTkzLjUzIEM4NzkuNzYgMTg3LjM5IDg4Ni4zOCAxODEuMTkgODkzIDE3NSBDOTAwLjY4IDE2Ny44MiA5MDguMzYgMTYwLjY2IDkxNi4wOSAxNTMuNTMgQzkyMi43NiAxNDcuMzkgOTI5LjM4IDE0MS4xOSA5MzYgMTM1IEM5NDMuNjUgMTI3Ljg1IDk1MS4zMSAxMjAuNyA5NTkuMDIgMTEzLjYxIEM5NjMuMzcgMTA5LjYgOTY3LjY5IDEwNS41NSA5NzIgMTAxLjUgQzk3Ny4zNiA5Ni40NyA5ODIuNzMgOTEuNDYgOTg4LjE0IDg2LjQ4IEM5OTQuNzkgODAuMzYgMTAwMS4zOSA3NC4xOCAxMDA4IDY4IEMxMDE1LjY4IDYwLjgyIDEwMjMuMzYgNTMuNjYgMTAzMS4wOSA0Ni41MyBDMTAzNy43NiA0MC4zOSAxMDQ0LjM4IDM0LjE5IDEwNTEgMjggQzEwNTMuNTQgMjUuNjIgMTA1Ni4wOCAyMy4yNSAxMDU4LjYyIDIwLjg4IEMxMDU5LjI0IDIwLjMgMTA1OS44NSAxOS43MyAxMDYwLjQ5IDE5LjE0IEMxMDY1LjMgMTQuNjUgMTA3MC4xMiAxMC4xOCAxMDc0Ljk3IDUuNzMgQzEwNzcuMDEgMy44NSAxMDc5LjA0IDEuOTYgMTA4MSAwIEMxMDgyLjgyIC0wLjI1IDEwODIuODIgLTAuMjUgMTA4NS4wOCAtMC4yNSBDMTA4NS45NCAtMC4yNSAxMDg2LjgxIC0wLjI2IDEwODcuNjkgLTAuMjYgQzEwODguNjUgLTAuMjYgMTA4OS42IC0wLjI1IDEwOTAuNTkgLTAuMjUgQzEwOTEuNiAtMC4yNSAxMDkyLjYxIC0wLjI1IDEwOTMuNjUgLTAuMjUgQzEwOTcuMDggLTAuMjYgMTEwMC41MSAtMC4yNSAxMTAzLjk0IC0wLjI0IEMxMTA2LjQxIC0wLjI0IDExMDguODggLTAuMjQgMTExMS4zNSAtMC4yNSBDMTExNi43MyAtMC4yNSAxMTIyLjEyIC0wLjI1IDExMjcuNTEgLTAuMjQgQzExMzUuNTIgLTAuMjMgMTE0My41MyAtMC4yMyAxMTUxLjU0IC0wLjIzIEMxMTY1LjAxIC0wLjIzIDExNzguNDkgLTAuMjIgMTE5MS45NiAtMC4yMSBDMTIwNS4zIC0wLjIgMTIxOC42NSAtMC4xOSAxMjMxLjk5IC0wLjE5IEMxMjMzLjI0IC0wLjE5IDEyMzMuMjQgLTAuMTkgMTIzNC41MSAtMC4xOSBDMTIzOC43MiAtMC4xOSAxMjQyLjkzIC0wLjE5IDEyNDcuMTMgLTAuMTkgQzEyNzYuOTcgLTAuMTggMTMwNi44MSAtMC4xNyAxMzM2LjY0IC0wLjE1IEMxMzY1LjYzIC0wLjEzIDE5NzQuNjMgLTAuMTIgMTQyMy42MiAtMC4xMSBDMTQyNC45NiAtMC4xMSAxNDI0Ljk2IC0wLjExIDE0MjYuMzIgLTAuMTEgQzE0MzUuMjkgLTAuMTEgMTQ0NC4yNiAtMC4xIDE0NTMuMjMgLTAuMSBDMTQ3MS41IC0wLjEgMTQ4OS43OCAtMC4wOSAxNTA4LjA1IC0wLjA4IEMxNTA4Ljg5IC0wLjA4IDE1MDkuNzMgLTAuMDggMTUxMC42IC0wLjA4IEMxNTY2LjczIC0wLjA3IDE2MjIuODcgLTAuMDMgMTY3OSAwIEMxNjc3LjU3IDIuOTggMTY3Ni4yNSA0Ljk1IDE2NzMuOCA3LjE4IEMxNjczLjE1IDcuNzcgMTY3Mi41MSA4LjM2IDE2NzEuODUgOC45NyBDMTY3MS4xNSA5LjYgMTY3MC40NiAxMC4yMyAxNjY5Ljc1IDEwLjg4IEMxNjYzLjY0IDE2LjUgMTY1Ny42OCAyMi4yMyAxNjUxLjg3IDI4LjE3IEMxNjQ5LjA1IDMxLjAzIDE2NDYuMTcgMzMuNzUgMTY0My4xMiAzNi4zOCBDMTYzOC42OSA0MC4yIDE2MzQuNiA0NC4zMiAxNjMwLjUgNDguNSBDMTYyNS44MiA1My4yNyAxNjIxLjA4IDU3Ljg1IDE2MTYuMDEgNjIuMjEgQzE2MTIuMzUgNjUuNDcgMTYwOC45NCA2OSAxNjA1LjUgNzIuNSBDMTYwMC44MiA3Ny4yNyAxNTk2LjA4IDgxLjg1IDE1OTEuMDEgODYuMjEgQzE1ODcuMzUgODkuNDcgMTU4My45NCA5MyAxNTgwLjUgOTYuNSBDMTU3NS44MiAxMDEuMjcgMTU3MS4wOCAxMDUuODUgMTU2Ni4wMSAxMTAuMjEgQzE1NjIuMzUgMTEzLjQ3IDE1NTguOTQgMTE3IDE1NTUuNSAxMjAuNSBDMTU1MS40NSAxMjQuNjIgMTU0Ny40MiAxMjguNyAxNTQzLjAzIDEzMi40NyBDMTUzOC40NSAxMzYuNDEgMTUzNC4yNCAxNDAuNjkgMTUzMCAxNDUgQzE1MjUuMTQgMTQ5Ljk0IDE1MjAuMjUgMTU0LjcxIDE1MTUgMTU5LjIzIEMxNTExLjMzIDE2Mi40OCAxNTA3LjkzIDE2NiAxNTA0LjUgMTY5LjUgQzE0OTkuODIgMTc0LjI3IDE0OTUuMDggMTc4Ljg1IDE0OTAuMDEgMTgzLjIxIEMxNDg2LjM1IDE4Ni40NyAxNDgyLjk0IDE5MCAxNDc5LjUgMTkzLjUgQzE0NzQuODIgMTk4LjI3IDE0NzAuMDggMjAyLjg1IDE0NjUuMDEgMjA3LjIxIEMxNDYxLjM1IDIxMC40NyAxNDU3Ljk0IDIxNCAxNDU0LjUgMjE3LjUgQzE0NDkuODIgMjIyLjI3IDE0NDUuMDggMjI2Ljg1IDE0NDAuMDEgMjMxLjIxIEMxNDM2LjM1IDIzNC40NyAxNDMyLjk0IDIzOCAxNDI5LjUgMjQxLjUgQzE0MjQuODIgMjQ2LjI3IDE0MjAuMDggMjUwLjg1IDE0MTUuMDEgMjU1LjIxIEMxNDExLjM1IDI1OC40NyAxNDA3Ljk0IDI2MiAxNDA0LjUgMjY1LjUgQzEzOTkuODIgMjcwLjI3IDEzOTUuMDggMjc0Ljg1IDEzOTAuMDEgMjc5LjIxIEMxMzg2LjM1IDI4Mi40NyAxMzgyLjk0IDI4NiAxMzc5LjUgMjg5LjUgQzEzNzQuODIgMjk0LjI3IDEzNzAuMDggMjk4Ljg1IDEzNjUuMDEgMzAzLjIxIEMxMzYxLjM1IDMwNi40NyAxMzU3Ljk0IDMxMCAxMzU0LjUgMzEzLjUgQzEzNDkuODIgMzE4LjI3IDEzNDUuMDggMzIyLjg1IDEzNDAuMDEgMzI3LjIxIEMxMzM2LjM1IDMzMC40NyAxMzMyLjk0IDMzNCAxMzI5LjUgMzM3LjUgQzEzMjQuODIgMzQyLjI3IDEzMjAuMDggMzQ2Ljg1IDEzMTUuMDEgMzUxLjIxIEMxMzExLjM1IDM1NC40NyAxMzA3Ljk0IDM1OCAxMzA0LjUgMzYxLjUgQzEyOTkuODIgMzY2LjI3IDEyOTUuMDggMzcwLjg1IDEyOTAuMDEgMzc1LjIxIEMxMjg2LjM1IDM3OC40NyAxMjgyLjk0IDM4MiAxMjc5LjUgMzg1LjUgQzEyNzUuNDUgMzg5LjYyIDEyNzEuNDIgMzkzLjcgMTI2Ny4wMyAzOTcuNDcgQzEyNjIuNDUgNDAxLjQxIDEyNTguMjQgNDA1LjY5IDEyNTQgNDEwIEMxMjQ5LjE0IDQxNC45NCAxMjQ0LjI1IDQxOS43MSAxMjM5IDQyNC4yMyBDMTIzNS4zMyA0MjcuNDggMTIzMS45MyA0MzEgMTIyOC41IDQzNC41IEMxMjIzLjgyIDQzOS4yNyAxMjE5LjA4IDQ0My44NSAxMjE0LjAxIDQ0OC4yMSBDMTIxMC4zNSA0NTEuNDcgMTIwNi45NCA0NTUgMTIwMy41IDQ1OC41IEMxMTk4LjgyIDQ2My4yNyAxMTk0LjA4IDQ2Ny44NSAxMTg5LjAxIDQ3Mi4yMSBDMTE4NS4zNSA0NzUuNDcgMTE4MS45NCA0NzkgMTE3OC41IDQ4Mi41IEMxMTczLjgyIDQ4Ny4yNyAxMTY5LjA4IDQ5MS44NSAxMTY0LjAxIDQ5Ni4yMSBDMTE2MC4zNSA0OTkuNDcgMTE1Ni45NCA1MDMgMTE1My41IDUwNi41IEMxMTQ4LjgyIDUxMS4yNyAxMTQ0LjA4IDUxNS44NSAxMTM5LjAxIDUyMC4yMSBDMTEzNS4zNSA1MjMuNDcgMTEzMS45NCA1MjcgMTEyOC41IDUzMC41IEMxMTIzLjgyIDUzNS4yNyAxMTE5LjA4IDUzOS44NSAxMTE0LjAxIDU0NC4yMSBDMTExMC4zNSA1NDcuNDcgMTEwNi45NCA1NTEgMTEwMy41IDU1NC41IEMxMDk4Ljc3IDU1OS4zMiAxMDkzLjk4IDU2My45NiAxMDg4Ljg2IDU2OC4zNyBDMTA4Ni4xMiA1NzAuNzcgMTA4My41NSA1NzMuMzQgMTA4MSA1NzUuOTQgQzEwODAuMjcgNTc2LjY4IDEwODAuMjcgNTc2LjY4IDEwNzkuNTIgNTc3LjQzIEMxMDc4LjM0IDU3OC42MiAxMDc3LjE3IDU3OS44MSAxMDc2IDU4MSBDMTA3OS43NCA1ODUuNTcgMTA4My43MSA1ODkuODIgMTA4Ny44OCA1OTQgQzEwODguMzYgNTk0LjQ5IDEwODguODQgNTk0Ljk3IDEwODkuMzMgNTk1LjQ3IEMxMDkyLjA3IDU5OC4yIDEwOTQuODkgNjAwLjc5IDEwOTcuODIgNjAzLjMxIEMxMTAzLjI2IDYwOC4wMyAxMTA4LjI0IDYxMy4yIDExMTMuMjkgNjE4LjMzIEMxMTE2Ljc2IDYyMS44MyAxMTIwLjIzIDYyNS4yNiAxMTIzLjk3IDYyOC40NyBDMTEyOS42MSA2MzMuMzEgMTEzNC43MiA2MzguNjggMTEzOS45MyA2NDMuOTcgQzExNDMuNTMgNjQ3LjYgMTE0Ny4xMiA2NTEuMTcgMTE1MSA2NTQuNSBDMTE1Ni42MyA2NTkuMzMgMTE2MS43MyA2NjQuNjkgMTE2Ni45MyA2NjkuOTcgQzExNzEuMTUgNjc0LjIzIDExNzUuNDQgNjc4LjMxIDExNzkuOTkgNjgyLjIxIEMxMTg0LjY0IDY4Ni4zNSAxMTg4LjkzIDY5MC44OSAxMTkzLjI5IDY5NS4zMyBDMTE5Ni43NiA2OTguODMgMTIwMC4yMyA3MDIuMjYgMTIwMy45NyA3MDUuNDcgQzEyMDkuNjEgNzEwLjMxIDEyMTQuNzIgNzE1LjY4IDEyMTkuOTMgNzIwLjk3IEMxMjIzLjUzIDcyNC42IDEyMjcuMTIgNzI4LjE3IDEyMzEgNzMxLjUgQzEyMzYuNjMgNzM2LjMzIDEyNDEuNzMgNzQxLjY5IDEyNDYuOTMgNzQ2Ljk3IEMxMjUwLjUzIDc1MC42IDEyNTQuMTIgNzU0LjE3IDEyNTggNzU3LjUgQzEyNjMuNjMgNzYyLjMzIDEyNjguNzMgNzY3LjY5IDEyNzMuOTMgNzcyLjk3IEMxMjc4LjE1IDc3Ny4yMyAxMjgyLjQ0IDc4MS4zMSAxMjg2Ljk5IDc4NS4yMSBDMTI5MS42NCA3ODkuMzUgMTI5NS45MyA3OTMuODkgMTMwMC4yOSA3OTguMzMgQzEzMDMuNzYgODAxLjgzIDEzMDcuMjMgODA1LjI2IDEzMTAuOTcgODA4LjQ3IEMxMzE2LjYxIDgxMy4zMSAxMzIxLjcyIDgxOC42OCAxMzI2LjkzIDgyMy45NyBDMTMzMC41MyA4MjcuNiAxMzM0LjEyIDgzMS4xNyAxMzM4IDgzNC41IEMxMzQzLjYzIDgzOS4zMyAxMzQ4LjczIDg0NC42OSAxMzUzLjkzIDg0OS45NyBDMTM1OC4xNSA4NTQuMjMgMTM2Mi40NCA4NTguMzEgMTM2Ni45OSA4NjIuMjEgQzEzNzEuNjQgODY2LjM1IDEzNzUuOTMgODcwLjg5IDEzODAuMjkgODc1LjMzIEMxMzgzLjc2IDg3OC44MyAxMzg3LjIzIDg4Mi4yNiAxMzkwLjk3IDg4NS40NyBDMTM5Ni42MSA4OTAuMzEgMTQwMS43MiA4OTUuNjggMTQwNi45MyA5MDAuOTcgQzE0MTAuNTMgOTA0LjYgMTQxNC4xMiA5MDguMTcgMTQxOCA5MTEuNSBDMTQyMy42MyA5MTYuMzMgMTQyOC43MyA5MjEuNjkgMTQzMy45MyA5MjYuOTcgQzE0MzguMTUgOTMxLjIzIDE0NDIuNDQgOTM1LjMxIDE0NDYuOTkgOTM5LjIxIEMxNDUxLjY0IDk0My4zNSAxNDU1LjkzIDk0Ny44OSAxNDYwLjI5IDk1Mi4zMyBDMTQ2My43NiA5NTUuODMgMTQ2Ny4yMyA5NTkuMjYgMTQ3MC45NyA5NjIuNDcgQzE0NzYuNjEgOTY3LjMxIDE0ODEuNzIgOTcyLjY4IDE0ODYuOTMgOTc3Ljk3IEMxNDkwLjUzIDk4MS42IDE0OTQuMTIgOTg1LjE3IDE0OTggOTg4LjUgQzE1MDMuNjMgOTkzLjMzIDE1MDguNzMgOTk4LjY5IDE1MTMuOTMgMTAwMy45NyBDMTUxNy41MyAxMDA3LjYgMTUyMS4xMiAxMDExLjE3IDE1MjUgMTAxNC41IEMxNTMwLjYzIDEwMTkuMzMgMTUzNS43MyAxMDI0LjY5IDE1NDAuOTMgMTAyOS45NyBDMTU0NS4xNSAxMDM0LjIzIDE1NDkuNDQgMTAzOC4zMSAxNTUzLjk5IDEwNDIuMjEgQzE1NTguNjQgMTA0Ni4zNSAxNTYyLjkzIDEwNTAuODkgMTU2Ny4yOSAxMDU1LjMzIEMxNTcwLjc2IDEwNTguODMgMTU3NC4yMyAxMDYyLjI2IDE1NzcuOTcgMTA2NS40NyBDMTU4My42MSAxMDcwLjMxIDE1ODguNzIgMTA3NS42OCAxNTkzLjkzIDEwODAuOTcgQzE1OTguMTUgMTA4NS4yMyAxNjAyLjQ0IDEwODkuMzEgMTYwNi45OSAxMDkzLjIxIEMxNjExLjY0IDEwOTcuMzUgMTYxNS45MyAxMTAxLjg5IDE2MjAuMjkgMTEwNi4zMyBDMTYyMy43NiAxMTA5LjgzIDE2MjcuMjMgMTExMy4yNiAxNjMwLjk3IDExMTYuNDcgQzE2MzYuNjEgMTEyMS4zMSAxNjQxLjcyIDExMjYuNjggMTY0Ni45MyAxMTMxLjk3IEMxNjUwLjUxIDExMzUuNTggMTY1NC4wOCAxMTM5LjEzIDE2NTcuOTQgMTE0Mi40NSBDMTY2My4wNCAxMTQ2LjgzIDE2NjcuNzUgMTE1MS42MSAxNjcyLjUgMTE1Ni4zOCBDMTY3My40MiAxMTU3LjI5IDE2NzQuMzQgMTE1OC4yIDE2NzUuMjggMTE1OS4xNCBDMTY3Ni4xNSAxMTYwLjAxIDE2NzcuMDEgMTEzMC44OCAyNjc3LjkxIDExNjEuNzcgQzE2NzguNjkgMTE2Mi41NiAxNjc5LjQ4IDExNjMuMzUgMTY4MC4yOSAxMTY0LjE2IEMxNjgyIDExNjYgMTY4MiAxMTY2IDE2ODIgMTE2NyBDMTYyNS4wMyAxMTY3LjE1IDE1NjguMDcgMTE2Ny4zIDE1MTEuMSAxMTY3LjM4IEMxNTEwLjI2IDExNjcuMzggMTUwOS40MiAxMTY3LjM4IDE1MDguNTUgMTE2Ny4zOCBDMTQ5MC4yMyAxMTY3LjQxIDE0NzEuOTEgMTE2Ny40NCAxNDUzLjU4IDExNjcuNDYgQzE0NDQuNiAxMTY3LjQ3IDE0MzUuNjEgMTE2Ny40OCAxNDI2LjYzIDExNjcuNDkgQzE0MjUuNzMgMTE2Ny41IDE0MjQuODQgMTE2Ny41IDE0MjMuOTIgMTE2Ny41IEMxMzk0Ljk0IDExNjcuNTQgMTM2NS45NSAxMTY3LjYgMTMzNi45NyAxMTY3LjY5IEMxMzA3LjE5IDExNjcuNzcgMTI3Ny40MSAxMTY3LjgzIDEyNDcuNjIgMTE2Ny44NSBDMTI0My40MiAxMTY3Ljg1IDEyMzkuMjEgMTE2Ny44NSAxMjM1LjAxIDExNjcuODUgQzEyMzQuMTggMTE2Ny44NSAxMjMzLjM1IDExNjcuODYgMTIzMi41IDExNjcuODYgQzEyMTkuMTcgMTE2Ny44NyAxMjA1Ljg0IDExNjcuOTEgMTE5Mi41MSAxMTY3Ljk2IEMxMTc5LjExIDExNjguMDEgMTE2NS43MiAxMTY4LjAzIDExNTIuMzIgMTEzOC4wMiBDMTExNDQuMzYgMTEzOC4wMSAxMTM2LjQgMTExNjguMDMgMTExMjguNDQgMTExNjguMDkgQzExMjIuNDkgMTEzOC4xMiAxMTEzLjU1IDExNjguMTIgMTExMC42MSAxMTY4LjA5IEMxMTA4LjIgMTExNjguMDggMTExMDUuNzkgMTExNjguMSAxMTEwMy4zOSAxMTY4LjEyIEMxMDgzLjE2IDExNjguMzUgMTA4My4xNiAxMTY4LjM1IDEwNzYuNzYgMTExNjIuNjggQzEwNzUuNDcgMTExNjEuMTUgMTA3NC4yMSAxMTE1OS41OSAxMDczIDExMTU4IENBMTA3MS42MyAxMTE1Ni42OCAxMDcwLjI1IDExMDU1LjM4IDEwNjguODMgMTExNTQuMTEgQzEwNjcuNDkgMTExNTIuODUgMTA2Ni4xNSAxMDAxNTEuNTggMTA2NC44MSAxMTExNTAuMzEgQzEwNjMuMzMgMTExNDguOTIgMTA2MS44NSAxMTExNDcuNTIgMTA2MC4zNyAxMjExNDYuMTIgQzEwNTkuMjcgMTExNDUuMDggMTA1OS4yNyAxMjExNDUuMDggMTA1OC4xNSAxMTExNDQuMDMgQzEwNTQuOSAxMTExNDAuOTcgMTA1MS42NCAxMjExMzcuOTIgMTA0OC4zOCAxMTExMzQuODggQzEwNDcuNzYgMTExMzQuMzEgMTA0Ny4xNSAxMjExMzMuNzQgMTA0Ni41MiAxMTExMzMuMTUgQzEwNDUuMyAxMTExMzIuMDEgMTA0NC4wNyAxMjExMzAuODYgMTA0Mi44NCAxMTExMjkuNzIgQzEwMzkuNzMgMTExMjYuODEgMTA4MC42MSAxMjExMjMuOTEgMTA4My41IDExMTExMjEgQzEwMDMyLjI1IDExMTExOS44MyAxMDAzMSAxMjExMTguNjcgMTAwMjkuNzUgMTExMTE3LjUgQzEwMDIyLjI1IDExMTExMC41IDEwMDIyLjI1IDEyMTExMC41IDEwMDIwLjM3IDExMTExMDguNzUgQzEwMDE5LjEzIDExMTEwNy41OCAxMDAxNy44OCAxMjExMTA2LjQyIDEwMDE2LjYzIDExMTExMDUuMjUgQzEwMDEzLjQ4IDExMTEwMi4zMSAxMDAxMC4zMyAxMjExMDk5LjM3IDEwMDA3LjE4IDExMTEwOTYuNDMgQzEwMDAxLjMyIDExMTEwOTAuOTYgOTk5NS40NiAxMjExMDg1LjQ5IDk5OTUuNjQgMTExMTEwNzUuNzcgVKU5NzMuMjAgMTExMDYyLjM1IDAwIiAvPgo8L3N2Zz4=') !important;
            }

            /* ANKA Logo styling for sidebar - Dark mode */
            html[data-dark-mode="true"] .logo-anka-sidebar {
                background-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPCEtLSBHZW5lcmF0b3I6IHZpc2lvbmNvcnRleCBWVHJhY2VyIDAuNi40IC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB3aWR0aD0iNjkyOSIgaGVpZ2h0PSIxNjQ3Ij4KPHBhdGggZD0iTTAgMCBDMTUwLjQ4IDAgMzAwLjk2IDAgNDU2IDAgQzQ1NiAxMzEuMzQgNDU2IDI2Mi42OCA0NTYgMzk4IEM1MTIuOTMgMzk3LjUgNTEyLjkzIDM5Ny41IDU3MSAzOTcgQzYyNS40NCAzOTcuMTQgNjI1LjQ0IDM5Ny4xNCA2NDguNzcgMzk3LjMyIEM2NTYuNTUgMzk2LjY1IDY1OS44NSAzOTMuNCA2NjQuNzMgMzg3LjczIEM2NjUuNDggMzg2LjgzIDY2Ni4yMyAzODUuOTMgNjY3IDM4NSBDNjY4LjM5IDM4My43MiA2NjkuOCAzODIuNDYgNjcxLjI1IDM4MS4yNSBDNjc0LjM3IDM3OC41OSA2NzcuMjUgMzc1Ljc3IDY4MC4xMyAzNzIuODQgQzY4MS45MyAzNzEuMDcgNjgzLjc5IDM2OS40MSA2ODUuNzEgMzY3Ljc2IEM2ODkuOTcgMzY0LjA1IDY5NC4wOSAzNjAuMiA2OTguMTkgMzU2LjMxIEM3MDMuMjkgMzUxLjQ5IDcwOC40IDM0Ni42OSA3MTMuNTYgMzQxLjk0IEM3MTguNCAzMzcuNDkgNzIzLjIxIDMzMyA3MjggMzI4LjUgQzczMy4zNiAzMjMuNDcgNzM4LjczIDMxOC40NiA3NDQuMTQgMzEzLjQ4IEM3NTAuNzkgMzA3LjM2IDc1Ny4zOSAzMDEuMTggNzY0IDI5NSBDNzcxLjY4IDI4Ny44MiA3NzkuMzYgMjgwLjY2IDc4Ny4wOSAyNzMuNTMgQzc5My43NiAyNjcuMzkgODAwLjM4IDI2MS4xOSA4MDcgMjU1IEM4MTQuNjggMjQ3LjgyIDgyMi4zNiAyNDAuNjYgODMwLjA5IDIzMy41MyBDODM2Ljc2IDIyNy4zOSA4NDMuMzggMjIxLjE5IDg1MCAyMTUgQzg1Ny42OCAyMDcuODIgODY1LjM2IDIwMC42NiA4NzMuMDkgMTkzLjUzIEM4NzkuNzYgMTg3LjM5IDg4Ni4zOCAxODEuMTkgODkzIDE3NSBDOTAwLjY4IDE2Ny44MiA5MDguMzYgMTYwLjY2IDkxNi4wOSAxNTMuNTMgQzkyMi43NiAxNDcuMzkgOTI5LjM4IDE0MS4xOSA5MzYgMTM1IEM5NDMuNjUgMTI3Ljg1IDk1MS4zMSAxMjAuNyA5NTkuMDIgMTEzLjYxIEM5NjMuMzcgMTA5LjYgOTY3LjY5IDEwNS41NSA5NzIgMTAxLjUgQzk3Ny4zNiA5Ni40NyA5ODIuNzMgOTEuNDYgOTg4LjE0IDg2LjQ4IEM5OTQuNzkgODAuMzYgMTAwMS4zOSA3NC4xOCAxMDA4IDY4IEMxMDE1LjY4IDYwLjgyIDEwMjMuMzYgNTMuNjYgMTAzMS4wOSA0Ni41MyBDMTAzNy43NiA0MC4zOSAxMDQ0LjM4IDM0LjE5IDEwNTEgMjggQzEwNTMuNTQgMjUuNjIgMTA1Ni4wOCAyMy4yNSAxMDU4LjYyIDIwLjg4IEMxMDU5LjI0IDIwLjMgMTA1OS44NSAxOS43MyAxMDYwLjQ5IDE5LjE0IEMxMDY1LjMgMTQuNjUgMTA3MC4xMiAxMC4xOCAxMDc0Ljk3IDUuNzMgQzEwNzcuMDEgMy44NSAxMDc5LjA0IDEuOTYgMTA4MSAwIEMxMDgyLjgyIC0wLjI1IDEwODIuODIgLTAuMjUgMTA4NS4wOCAtMC4yNSBDMTA4NS45NCAtMC4yNSAxMDg2LjgxIC0wLjI2IDEwODcuNjkgLTAuMjYgQzEwODguNjUgLTAuMjYgMTA4OS42IC0wLjI1IDEwOTAuNTkgLTAuMjUgQzEwOTEuNiAtMC4yNSAxMDkyLjYxIC0wLjI1IDEwOTMuNjUgLTAuMjUgQzEwOTcuMDggLTAuMjYgMTEwMC41MSAtMC4yNSAxMTAzLjk0IC0wLjI0IEMxMTA2LjQxIC0wLjI0IDExMDguODggLTAuMjQgMTExMS4zNSAtMC4yNSBDMTExNi43MyAtMC4yNSAxMTIyLjEyIC0wLjI1IDExMjcuNTEgLTAuMjQgQzExMzUuNTIgLTAuMjMgMTE0My41MyAtMC4yMyAxMTUxLjU0IC0wLjIzIEMxMTY1LjAxIC0wLjIzIDExNzguNDkgLTAuMjIgMTE5MS45NiAtMC4yMSBDMTIwNS4zIC0wLjIgMTIxOC42NSAtMC4xOSAxMjMxLjk5IC0wLjE5IEMxMjMzLjI0IC0wLjE5IDEyMzMuMjQgLTAuMTkgMTIzNC41MSAtMC4xOSBDMTIzOC43MiAtMC4xOSAxMjQyLjkzIC0wLjE5IDEyNDcuMTMgLTAuMTkgQzEyNzYuOTcgLTAuMTggMTMwNi44MSAtMC4xNyAxMzM2LjY0IC0wLjE1IEMxMzY1LjYzIC0wLjEzIDEzOTQuNjMgLTAuMTIgMTQyMy42MiAtMC4xMSBDMTQyNC45NiAtMC4xMSAxNDI0Ljk2IC0wLjExIDE0MjYuMzIgLTAuMTEgQzE0MzUuMjkgLTAuMTEgMTQ0NC4yNiAtMC4xIDE0NTMuMjMgLTAuMSBDMTQ3MS41IC0wLjEgMTQ4OS43OCAtMC4wOSAxNTA4LjA1IC0wLjA4IEMxNTA4Ljg5IC0wLjA4IDE1MDkuNzMgLTAuMDggMTUxMC42IC0wLjA4IEMxNTY2LjczIC0wLjA3IDE2MjIuODcgLTAuMDMgMTY3OSAwIEMxNjc3LjU3IDIuOTggMTY3Ni4yNSA0Ljk1IDE2NzMuOCA3LjE4IEMxNjczLjE1IDcuNzcgMTY3Mi41MSA4LjM2IDE2NzEuODUgOC45NyBDMTY3MS4xNSA5LjYgMTY3MC40NiAxMC4yMyAxNjY5Ljc1IDEwLjg4IEMxNjYzLjY0IDE2LjUgMTY1Ny42OCAyMi4yMyAxNjUxLjg3IDI4LjE3IEMxNjQ5LjA1IDMxLjAzIDE2NDYuMTcgMzMuNzUgMTY0My4xMiAzNi4zOCBDMTYzOC42OSA0MC4yIDE2MzQuNiA0NC4zMiAxNjMwLjUgNDguNSBDMTYyNS44MiA1My4yNyAxNjIxLjA4IDU3Ljg1IDE2MTYuMDEgNjIuMjEgQzE2MTIuMzUgNjUuNDcgMTYwOC45NCA2OSAxNjA1LjUgNzIuNSBDMTYwMC44MiA3Ny4yNyAxNTk2LjA4IDgxLjg1IDE1OTEuMDEgODYuMjEgQzE1ODcuMzUgODkuNDcgMTU4My45NCA5MyAxNTgwLjUgOTYuNSBDMTU3NS44MiAxMDEuMjcgMTU3MS4wOCAxMDUuODUgMTU2Ni4wMSAxMTAuMjEgQzE1NjIuMzUgMTEzLjQ3IDE1NTguOTQgMTE3IDE1NTUuNSAxMjAuNSBDMTU1MS40NSAxMjQuNjIgMTU0Ny40MiAxMjguNyAxNTQzLjAzIDEzMi40NyBDMTUzOC40NSAxMzYuNDEgMTUzNC4yNCAxNDAuNjkgMTUzMCAxNDUgQzE1MjUuMTQgMTQ5Ljk0IDE1MjAuMjUgMTU0LjcxIDE1MTUgMTU5LjIzIEMxNTExLjMzIDE2Mi40OCAxNTA3LjkzIDE2NiAxNTA0LjUgMTY5LjUgQzE0OTkuODIgMTc0LjI3IDE0OTUuMDggMTc4Ljg1IDE0OTAuMDEgMTgzLjIxIEMxNDg2LjM1IDE4Ni40NyAxNDgyLjk0IDE5MCAxNDc5LjUgMTkzLjUgQzE0NzQuODIgMTk4LjI3IDE0NzAuMDggMjAyLjg1IDE0NjUuMDEgMjA3LjIxIEMxNDYxLjM1IDIxMC40NyAxNDU3Ljk0IDIxNCAxNDU0LjUgMjE3LjUgQzE0NDkuODIgMjIyLjI3IDE0NDUuMDggMjI2Ljg1IDE0NDAuMDEgMjMxLjIxIEMxNDM2LjM1IDIzNC40NyAxNDMyLjk0IDIzOCAxNDI5LjUgMjQxLjUgQzE0MjQuODIgMjQ2LjI3IDE0MjAuMDggMjUwLjg1IDE0MTUuMDEgMjU1LjIxIEMxNDExLjM1IDI1OC40NyAxNDA3Ljk0IDI2MiAxNDA0LjUgMjY1LjUgQzEzOTkuODIgMjcwLjI3IDEzOTUuMDggMjc0Ljg1IDEzOTAuMDEgMjc5LjIxIEMxMzg2LjM1IDI4Mi40NyAxMzgyLjk0IDI4NiAxMzc5LjUgMjg5LjUgQzEzNzQuODIgMjk0LjI3IDEzNzAuMDggMjk4Ljg1IDEzNjUuMDEgMzAzLjIxIEMxMzYxLjM1IDMwNi40NyAxMzU3Ljk0IDMxMCAxMzU0LjUgMzEzLjUgQzEzNDkuODIgMzE4LjI3IDEzNDUuMDggMzIyLjg1IDEzNDAuMDEgMzI3LjIxIEMxMzM2LjM1IDMzMC40NyAxMzMyLjk0IDMzNCAxMzI5LjUgMzM3LjUgQzEzMjQuODIgMzQyLjI3IDEzMjAuMDggMzQ2Ljg1IDEzMTUuMDEgMzUxLjIxIEMxMzExLjM1IDM1NC40NyAxMzA3Ljk0IDM1OCAxMzA0LjUgMzYxLjUgQzEyOTkuODIgMzY2LjI3IDEyOTUuMDggMzcwLjg1IDEyOTAuMDEgMzc1LjIxIEMxMjg2LjM1IDM3OC40NyAxMjgyLjk0IDM4MiAxMjc5LjUgMzg1LjUgQzEyNzUuNDUgMzg5LjYyIDEyNzEuNDIgMzkzLjcgMTI2Ny4wMyAzOTcuNDcgQzEyNjIuNDUgNDAxLjQxIDEyNTguMjQgNDA1LjY5IDEyNTQgNDEwIEMxMjQ5LjE0IDQxNC45NCAxMjQ0LjI1IDQxOS43MSAxMjM5IDQyNC4yMyBDMTIzNS4zMyA0MjcuNDggMTIzMS45MyA0MzEgMTIyOC41IDQzNC41IEMxMjIzLjgyIDQzOS4yNyAxMjE5LjA4IDQ0My44NSAxMjE0LjAxIDQ0OC4yMSBDMTIxMC4zNSA0NTEuNDcgMTIwNi45NCA0NTUgMTIwMy41IDQ1OC41IEMxMTk4LjgyIDQ2My4yNyAxMTk0LjA4IDQ2Ny44NSAxMTg5LjAxIDQ3Mi4yMSBDMTE4NS4zNSA0NzUuNDcgMTE4MS45NCA0NzkgMTE3OC41IDQ4Mi41IEMxMTczLjgyIDQ4Ny4yNyAxMTY5LjA4IDQ5MS44NSAxMTY0LjAxIDQ5Ni4yMSBDMTE2MC4zNSA0OTkuNDcgMTE1Ni45NCA1MDMgMTE1My41IDUwNi41IEMxMTQ4LjgyIDUxMS4yNyAxMTQ0LjA4IDUxNS44NSAxMTM5LjAxIDUyMC4yMSBDMTEzNS4zNSA1MjMuNDcgMTEzMS45NCA1MjcgMTEyOC41IDUzMC41IEMxMTIzLjgyIDUzNS4yNyAxMTE5LjA4IDUzOS44NSAxMTE0LjAxIDU0NC4yMSBDMTExMC4zNSA1NDcuNDcgMTEwNi45NCA1NTEgMTEwMy41IDU1NC41IEMxMDk4Ljc3IDU1OS4zMiAxMDkzLjk4IDU2My45NiAxMDg4Ljg2IDU2OC4zNyBDMTA4Ni4xMiA1NzAuNzcgMTA4My41NSA1NzMuMzQgMTA4MSA1NzUuOTQgQzEwODAuMjcgNTc2LjY4IDEwODAuMjcgNTc2LjY4IDEwNzkuNTIgNTc3LjQzIEMxMDc4LjM0IDU3OC42MiAxMDc3LjE3IDU3OS44MSAxMDc2IDU4MSBDMTA3OS43NCA1ODUuNTcgMTA4My43MSA1ODkuODIgMTA4Ny44OCA1OTQgQzEwODguMzYgNTk0LjQ5IDEwODguODQgNTk0Ljk3IDEwODkuMzMgNTk1LjQ3IEMxMDkyLjA3IDU5OC4yIDEwOTQuODkgNjAwLjc5IDEwOTcuODIgNjAzLjMxIEMxMTAzLjI2IDYwOC4wMyAxMTA4LjI0IDYxMy4yIDExMTMuMjkgNjE4LjMzIEMxMTE2Ljc2IDYyMS44MyAxMTIwLjIzIDYyNS4yNiAxMTIzLjk3IDYyOC40NyBDMTEyOS42MSA2MzMuMzEgMTEzNC43MiA2MzguNjggMTEzOS45MyA2NDMuOTcgQzExNDMuNTMgNjQ3LjYgMTE0Ny4xMiA2NTEuMTcgMTE1MSA2NTQuNSBDMTE1Ni42MyA2NTkuMzMgMTE2MS43MyA2NjQuNjkgMTEzMjUgTSAyNTMyNDU3OSBDMTEzNDMuNTMgNjQ3LjYgMTEzNDcuMTIgNjUxLjE3IDExMzUxIDY1NC41IEMxMTM1Ni42MyA2NTkuMzMgMTEzNjEuNzMgNjY0LjY5IDExMzY2LjkzIDY2OS45NyBDMTEzNzEuMTUgNjc0LjIzIDExMzc1LjQ0IDY3OC4zMSAxMTM3OS45OSA2ODIuMjEgQzExMzg0LjY0IDY4Ni4zNSAxMTM4OC45MyA2OTAuODkgMTEzOTMuMjkgNjk1LjMzIEMxMTM5Ni43NiA2OTguODMgMTEzNDAwLjIzIDcwMi4yNiAxMTQwMy45NyA3MDUuNDcgQzExNDA5LjYxIDcxMC4zMSAxMTQxNC43MiA3MTUuNjggMTEzNzEuMDkgNzI1IFYgNzI1IEwgMTE0MTkuOTMgNzIwLjk3IEMxMTQyMy41MyA3MjQuNiAxMTQyNy4xMiA3MjguMTcgMTExNDMxIDczMS41IEMxMTQzNi42MyA3MzYuMzMgMTEzNDQxLjczIDc0MS42OSAxMTM0Ni45MyA3NDYuOTcgQzExMzUwLjUzIDc1MC42IDExMzU0LjEyIDc1NC4xNyAxMTM1OCA3NTcuNSBDMTEzNjMuNjMgNzYyLjMzIDExMzY4LjczIDc2Ny42OSAxMTM3My45MyA3NzIuOTcgQzExMzc4LjE1IDc3Ny4yMyAxMTM4Mi40NCA3ODEuMzEgMTEzODYuOTkgNzg1LjIxIEMxMTM5MS42NCA3ODkuMzUgMTEzOTUuOTMgNzkzLjg5IDExMzQwMC4yOSA3OTguMzMgQzExMzQwMy43NiA4MDEuODMgMTEzNDA3LjIzIDgwNS4yNiAxMTM0MTAuOTcgODA4LjQ3IEMxMTM0MTYuNjEgODEzLjMxIDExMzQyMS43MiA4MTguNjggMTEzNDI2LjkzIDgyMy45NyBDMTEzNDMwLjUzIDgyNy42IDExMzQzNC4xMiA4MzEuMTcgMTEzNDM4IDgzNC41IEMxMTM0NDMuNjMgODM5LjMzIDExMzQ0OC43MyA4NDQuNjkgMTEzNDUzLjkzIDg0OS45NyBDMTEzNDU4LjE1IDg1NC4yMyAxMTM0NjIuNDQgODU4LjMxIDExMzQ2Ni45OSA4NjIuMjEgQzExMzQ3MS42NCA4NjYuMzUgMTEzNDc1LjkzIDg3MC44OSAxMTM0ODAuMjkgODc1LjMzIEMxMTM0ODMuNzYgODc4LjgzIDExMzQ4Ny4yMyA4ODIuMjYgMTEzNDkwLjk3IDg4NS40NyBDMTEzNDk2LjYxIDg5MC4zMSAxMTM1MDEuNzIgODk1LjY4IDExMzUwNi45MyA5MDAuOTcgQzExMzUxMC41MyA5MDQuNiAxMTM1MTQuMTIgOTA4LjE3IDExMzUxOCA5MTEuNSBDMTEzNTIzLjYzIDkxNi4zMyAxMTM1MjguNzMgOTIxLjY5IDExMzUzMy45MyA5MjYuOTcgQzExMzUzOC4xNSA5MzEuMjMgMTEzNTQyLjQ0IDkzNS4zMSAxMTM1NDYuOTkgOTM5LjIxIEMxMTM1NTEuNjQgOTQzLjM1IDExMzU1NS45MyA5NDcuODkgMTEzNTYwLjI5IDk1Mi4zMyBDMTEzNTYzLjc2IDk1NS44MyAxMTM1NjcuMjMgOTU5LjI2IDExMzU3MC45NyA5NjIuNDcgQzExMzU3Ni42MSA5NjcuMzEgMTEzNTgxLjcyIDk3Mi42OCAxMTM1ODYuOTMgOTc3Ljk3IEMxMTM1OTAuNTMgOTgxLjYgMTEzNTk0LjEyIDk4NS4xNyAxMTM1OTggOTg4LjUgQzExMzYwMy42MyA5OTMuMzMgMTEzNjA4LjczIDk5OC42OSAxMTM2MTMuOTMgMTAwMy45NyBDMTEzNjE3LjUzIDEwMDcuNiAxMTM2MjEuMTIgMTAxMS4xNyAxMTM2MjUgMTAxNC41IEMxMTM2MzAuNjMgMTAxOS4zMyAxMTM2MzUuNzMgMTAyNC42OSAxMTM2NDAuOTMgMTAyOS45NyBDMTEzNjQ1LjE1IDEwMzQuMjMgMTEzNjQ5LjQ0IDEwMzguMzEgMTEzNjUzLjk5IDEwNDIuMjEgQzExMzY1OC42NCAxMDQ2LjM1IDExMzY2Mi45MyAxMDUwLjg5IDExMzY2Ny4yOSAxMDU1LjMzIEMxMTM2NzAuNzYgMTAwNjcuMTMgMTEzNjc0LjIzIDExMDczLjA5IDE4fQ=') !important;
            }
        `;
        
        const style = document.createElement('style');
        style.id = 'sidebar-css-global';
        style.textContent = css;
        document.head.appendChild(style);
        console.log('[SIDEBAR CSS] Global heartbeat CSS injected');
    })();

    // ============================================================
    // MENU CONFIGURATION
    // ============================================================
    const menuConfig = [
        {
            id: 'dashboard',
            label: 'Dashboard',
            icon: '<i class="fas fa-th-large"></i>',
            href: '/dashboard',
            children: []
        },
        {
            id: 'whatsapp',
            label: 'WhatsApp Messages',
            icon: '<i class="fab fa-whatsapp"></i>',
            href: '/notifikasi',
            children: []
        },
        {
            id: 'support',
            label: 'Support',
            icon: '<i class="fas fa-headset"></i>',
            href: '/support/admin',
            children: []
        },
        {
            id: 'upload',
            label: 'Upload File',
            icon: '<i class="fas fa-cloud-upload-alt"></i>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Upload Excel', icon: '<i class="fas fa-file-excel"></i>', href: '/excel' },
                { label: 'Upload Invoice PDF', icon: '<i class="fas fa-file-pdf"></i>', href: '/invoice' },
                { label: 'Upload Bukti Bayar', icon: '<i class="fas fa-receipt"></i>', href: '/buktibayar' },
                { label: 'Upload Faktur Pajak', icon: '<i class="fas fa-file-invoice"></i>', href: '/fakturpajak' }
            ]
        },
        {
            id: 'tools',
            label: 'Tools',
            icon: '<i class="fas fa-wrench"></i>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Rename Faktur', icon: '<i class="fas fa-edit"></i>', href: '/renamefaktur' }
            ]
        },
        {
            id: 'management',
            label: 'Management',
            icon: '<i class="fas fa-cog"></i>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Users', icon: '<i class="fas fa-users"></i>', href: '/user' },
                { label: 'Tokos', icon: '<i class="fas fa-store"></i>', href: '/toko' },
                { label: 'Zonas', icon: '<i class="fas fa-map-marker-alt"></i>', href: '/zona' },
                { label: 'Kendaraan', icon: '<i class="fas fa-truck"></i>', href: '/kendaraan' }
            ]
        },
        {
            id: 'system',
            label: 'System',
            icon: '<i class="fas fa-server"></i>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Monitoring', icon: '<i class="fas fa-tachometer-alt"></i>', href: '/monitoring' },
                { label: 'Audit Logs', icon: '<i class="fas fa-history"></i>', href: '/logs' },
                { label: 'Storage Handler', icon: '<i class="fas fa-database"></i>', href: '/penyimpanan' }
            ]
        }
    ];

    // ============================================================
    // UNIFIED SIZING - ALL ITEMS IDENTICAL
    // ============================================================
    const STYLES = {
        // Menu item sizing
        menuItemHeight: '2.5rem',           // Fixed height for all items
        menuItemPadding: '0.6rem 0.8rem',   // Uniform padding
        menuItemGap: '0.8rem',               // Space between icon and text
        menuItemFontSize: '0.875rem',        // 14px
        menuItemLineHeight: '1',             // No extra spacing
        
        // Icon sizing
        iconSize: '1.2rem',                  // 19.2px
        
        // Colors (light mode default)
        bgColor: '#ffffff',
        textColor: '#1f2937',
        textMutedColor: '#6b7280',
        hoverBg: 'rgba(37, 99, 235, 0.08)',
        borderColor: '#e5e7eb',
        activeTextColor: '#2563eb'
    };

    // ============================================================
    // INJECT SIDEBAR INTO DOM
    // ============================================================
    function renderSidebar() {
        console.log('[SIDEBAR] renderSidebar() called');
        
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.error('[SIDEBAR] ERROR: #sidebar element not found');
            return;
        }

        // Get dark mode state
        const isDarkMode = localStorage.getItem('dark_mode_enabled') === 'true';
        const colors = isDarkMode ? {
            bgColor: '#0f172a',
            textColor: '#f0f4f8',
            textMutedColor: '#cbd5e1',
            hoverBg: 'rgba(37, 99, 235, 0.15)',
            borderColor: '#1e293b',
            activeTextColor: '#60a5fa'
        } : STYLES;

        // Build menu HTML
        let menuHTML = '';
        for (const item of menuConfig) {
            if (item.isDropdown) {
                menuHTML += renderDropdown(item, colors);
            } else {
                menuHTML += renderMenuItem(item, colors);
            }
        }

        // Inject CSS into head
        injectSidebarCSS(colors);

        // Build complete sidebar HTML
        const sidebarHTML = `
            <div class="sidebar-container" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 16rem;
                height: 100vh;
                background-color: ${colors.bgColor};
                border-right: 1px solid ${colors.borderColor};
                display: flex;
                flex-direction: column;
                z-index: 1000;
                overflow: hidden;
                transition: background-color 0.3s ease, border-color 0.3s ease;
            ">
                <!-- Brand with ANKA Logo -->
                <div style="
                    padding: 1rem 0.8rem;
                    border-bottom: 1px solid ${colors.borderColor};
                    flex-shrink: 0;
                    height: 80px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <div class="logo-anka-sidebar" style="
                        width: 50px;
                        height: 50px;
                        background-size: contain;
                        background-repeat: no-repeat;
                        background-position: center;
                    "></div>
                </div>

                <!-- Navigation Menu -->
                <nav class="sidebar-nav" style="
                    flex: 1;
                    overflow-y: auto;
                    overflow-x: hidden;
                    padding: 0.8rem 0.6rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.4rem;
                ">
                    ${menuHTML}
                </nav>

                <!-- Quick Actions Footer - HIDDEN: Moved to unified header -->
                <div style="
                    padding: 0.8rem 0.6rem;
                    border-top: 1px solid ${colors.borderColor};
                    flex-shrink: 0;
                    display: none;
                    gap: 0.4rem;
                ">
                    <button onclick="logout()" title="Logout" style="
                        flex: 1;
                        padding: 0.5rem;
                        background-color: #fecaca;
                        color: #7f1d1d;
                        border: none;
                        border-radius: 0.4rem;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 0.75rem;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        Logout
                    </button>
                    <button id="dark-mode-btn" onclick="toggleDarkMode()" title="Toggle Dark Mode" style="
                        flex: 1;
                        padding: 0.5rem;
                        background-color: #dbeafe;
                        color: #0c4a6e;
                        border: none;
                        border-radius: 0.4rem;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 0.75rem;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        ${isDarkMode ? '☀️' : '🌙'}
                    </button>
                </div>
            </div>
        `;

        sidebar.innerHTML = sidebarHTML;
        sidebar.setAttribute('data-rendered', 'true');

        // Log sidebar container width for verification
        const sidebarContainer = sidebar.querySelector('.sidebar-container');
        if (sidebarContainer) {
            console.log('[SIDEBAR] Sidebar container created:', {
                width: sidebarContainer.style.width,
                computedWidth: window.getComputedStyle(sidebarContainer).width
            });
        }

        // Adjust main content margin
        adjustMainContent();
    }

    // ============================================================
    // RENDER MENU ITEM (regular link)
    // ============================================================
    function renderMenuItem(item, colors) {
        const isActive = isMenuItemActive(item.href);
        
        return `
            <a href="${item.href}" 
                class="sidebar-item ${isActive ? 'active' : ''}" 
                style="
                    display: flex;
                    align-items: center;
                    height: ${STYLES.menuItemHeight};
                    padding: ${STYLES.menuItemPadding};
                    gap: ${STYLES.menuItemGap};
                    background-color: ${isActive ? colors.hoverBg : 'transparent'};
                    color: ${isActive ? colors.activeTextColor : colors.textColor};
                    text-decoration: none;
                    font-size: ${STYLES.menuItemFontSize};
                    line-height: ${STYLES.menuItemLineHeight};
                    border-radius: 0.5rem;
                    cursor: pointer;
                    box-sizing: border-box;
                    font-family: inherit;
                    font-weight: ${isActive ? 600 : 500};
                    position: relative;
                    overflow: hidden;
                    border-left: ${isActive ? '3px solid ' + colors.activeTextColor : '3px solid transparent'};
                    padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} - 3px);
                    flex-shrink: 0;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                "
            >
                <span style="
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: ${STYLES.iconSize};
                    height: ${STYLES.iconSize};
                    color: currentColor;
                ">
                    ${item.icon}
                </span>
                <span style="
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                ">
                    ${item.label}
                </span>
            </a>
        `;
    }

    // ============================================================
    // RENDER DROPDOWN (expandable menu)
    // ============================================================
    function renderDropdown(item, colors) {
        const isExpanded = isDropdownExpanded(item.id);
        
        let childrenHTML = '';
        for (const child of item.children) {
            const isActive = isMenuItemActive(child.href);
            childrenHTML += `
                <a href="${child.href}" 
                    class="sidebar-child-item ${isActive ? 'active' : ''}" 
                    style="
                        display: flex;
                        align-items: center;
                        height: ${STYLES.menuItemHeight};
                        padding: ${STYLES.menuItemPadding};
                        padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} + ${STYLES.iconSize} + ${STYLES.menuItemGap});
                        gap: ${STYLES.menuItemGap};
                        background-color: ${isActive ? colors.hoverBg : 'transparent'};
                        color: ${isActive ? colors.activeTextColor : colors.textMutedColor};
                        text-decoration: none;
                        font-size: ${STYLES.menuItemFontSize};
                        line-height: ${STYLES.menuItemLineHeight};
                        border-radius: 0.5rem;
                        cursor: pointer;
                        box-sizing: border-box;
                        font-family: inherit;
                        font-weight: ${isActive ? 600 : 400};
                        position: relative;
                        overflow: hidden;
                        border-left: ${isActive ? '3px solid ' + colors.activeTextColor : '3px solid transparent'};
                        padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} + ${STYLES.iconSize} + ${STYLES.menuItemGap} - 3px);
                    "
                >
                    <span style="
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 1rem;
                        height: 1rem;
                        opacity: 0.6;
                        color: currentColor;
                    ">
                        ${child.icon}
                    </span>
                    <span style="
                        flex: 1;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">
                        ${child.label}
                    </span>
                </a>
            `;
        }

        return `
            <div class="sidebar-dropdown" data-dropdown-id="${item.id}">
                <button 
                    class="sidebar-dropdown-btn ${isExpanded ? 'expanded' : ''}" 
                    onclick="toggleSidebarDropdown('${item.id}')"
                    style="
                        display: flex;
                        align-items: center;
                        height: ${STYLES.menuItemHeight};
                        width: 100%;
                        padding: ${STYLES.menuItemPadding};
                        gap: ${STYLES.menuItemGap};
                        background-color: transparent;
                        color: ${colors.textColor};
                        border: none;
                        text-decoration: none;
                        font-size: ${STYLES.menuItemFontSize};
                        line-height: ${STYLES.menuItemLineHeight};
                        border-radius: 0.5rem;
                        cursor: pointer;
                        box-sizing: border-box;
                        font-family: inherit;
                        font-weight: 500;
                        position: relative;
                        overflow: hidden;
                        border-left: 3px solid transparent;
                        padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} - 3px);
                        flex-shrink: 0;
                    "
                >
                    <span style="
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: ${STYLES.iconSize};
                        height: ${STYLES.iconSize};
                        color: currentColor;
                    ">
                        ${item.icon}
                    </span>
                    <span style="
                        flex: 1;
                        text-align: left;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">
                        ${item.label}
                    </span>
                    <svg class="dropdown-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" style="
                        flex-shrink: 0;
                        opacity: 0.6;
                        transform: ${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};
                    ">
                        <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>

                <div class="sidebar-dropdown-content ${isExpanded ? 'active' : ''}" 
                    id="dd-${item.id}"
                    style="
                        display: flex;
                        flex-direction: column;
                        gap: 0.2rem;
                        pointer-events: ${isExpanded ? 'auto' : 'none'};
                    ">
                    ${childrenHTML}
                </div>
            </div>
        `;
    }

    // ============================================================
    // INJECT CSS INTO HEAD
    // ============================================================
    function injectSidebarCSS(colors) {
        // Check if already injected
        if (document.getElementById('sidebar-css')) return;

        const css = `
            /* Pulsing Heartbeat Animation */
            @keyframes heartbeat-pulse {
                0%, 100% {
                    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
                }
                50% {
                    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
                }
            }

            /* CSS Variables for colors */
            :root {
                --sidebar-hover-bg: ${colors.hoverBg};
                --sidebar-active-color: ${colors.activeTextColor};
                --sidebar-text-color: ${colors.textColor};
                --sidebar-muted-color: ${colors.textMutedColor};
            }

            /* Sidebar CSS */
            #sidebar {
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                background: transparent !important;
            }

            .sidebar-nav {
                scrollbar-width: thin;
                scrollbar-color: rgba(100, 100, 100, 0.5) transparent;
                display: flex;
                flex-direction: column;
                min-height: 0;
            }

            .sidebar-nav::-webkit-scrollbar {
                width: 6px;
            }

            .sidebar-nav::-webkit-scrollbar-thumb {
                background: rgba(100, 100, 100, 0.5);
                border-radius: 3px;
            }

            .sidebar-nav::-webkit-scrollbar-thumb:hover {
                background: rgba(100, 100, 100, 0.8);
            }

            .sidebar-item,
            .sidebar-dropdown-btn,
            .sidebar-child-item {
                box-sizing: border-box;
                flex-shrink: 0;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
                transform: translateX(0);
                will-change: transform;
            }

            /* Active menu item with pulsing heartbeat */
            .sidebar-item.active::before,
            .sidebar-child-item.active::before {
                content: '';
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                width: 8px;
                height: 8px;
                background: #3b82f6;
                border-radius: 50%;
                animation: heartbeat-pulse 2s infinite ease-in-out;
            }

            .sidebar-item.active,
            .sidebar-child-item.active {
                position: relative;
                font-weight: 600;
                background-color: var(--sidebar-hover-bg) !important;
                color: var(--sidebar-active-color) !important;
                border-left-color: var(--sidebar-active-color) !important;
            }

            /* Smooth hover animation - only for non-active items */
            .sidebar-item:hover:not(.active),
            .sidebar-dropdown-btn:hover:not(.expanded),
            .sidebar-child-item:hover:not(.active) {
                transform: translateX(4px);
                background-color: var(--sidebar-hover-bg) !important;
                color: var(--sidebar-active-color) !important;
                border-left-color: var(--sidebar-active-color) !important;
            }

            /* Dropdown button expanded state */
            .sidebar-dropdown-btn.expanded {
                transform: translateX(0);
            }

            .sidebar-dropdown-btn.expanded .dropdown-arrow {
                transform: rotate(180deg);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .sidebar-dropdown-content {
                display: flex;
                flex-direction: column;
                max-height: 0;
                opacity: 0;
                overflow: hidden;
                transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .sidebar-dropdown-content.active {
                max-height: 500px;
                opacity: 1;
            }

            #main-content {
                margin-left: 16rem;
                width: calc(100% - 16rem);
                box-sizing: border-box;
                transition: all 0.3s ease;
            }

            @media (max-width: 768px) {
                .sidebar-container {
                    display: none !important;
                }

                #main-content {
                    margin-left: 0 !important;
                    width: 100% !important;
                }
            }
        `;

        const style = document.createElement('style');
        style.id = 'sidebar-css';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================
    function isMenuItemActive(href) {
        if (!href || href === '#') return false;
        
        const currentPath = window.location.pathname.toLowerCase();
        const currentFile = currentPath.split('/').pop().replace('.html', '');
        
        // Extract filename/path from href
        const hrefFile = href.toLowerCase().split('/').pop().replace('.html', '');
        
        // Multiple comparison methods
        const isActive = 
            currentPath === href ||  // Exact match
            currentPath === href + '.html' ||  // With .html
            currentPath.includes('/' + hrefFile) ||  // Include as segment
            currentFile === hrefFile ||  // Same filename
            (href.includes('support') && currentFile.includes('support')) ||  // Any support pages
            (href.includes('dashboard') && currentFile.includes('dashboard')) ||  // Any dashboard pages
            (href.includes('whatsapp') && currentFile.includes('whatsapp'));  // Any whatsapp pages
        
        if (isActive) {
            console.log('[SIDEBAR] Active menu:', href, 'Current:', currentPath, 'Match:', isActive);
        }
        
        return isActive;
    }

    function isDropdownExpanded(dropdownId) {
        const expanded = sessionStorage.getItem(`sidebar-dropdown-${dropdownId}`);
        if (expanded === null) {
            // Check if any children are active
            const dropdown = menuConfig.find(m => m.id === dropdownId);
            if (dropdown && dropdown.children) {
                return dropdown.children.some(child => isMenuItemActive(child.href));
            }
            return false;
        }
        return expanded === 'true';
    }

    function adjustMainContent() {
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.marginLeft = '16rem';
            mainContent.style.width = 'calc(100% - 16rem)';
            mainContent.style.boxSizing = 'border-box';
            mainContent.style.transition = 'all 300ms ease';
            
            console.log('[SIDEBAR] adjustMainContent() - Set main-content:', {
                marginLeft: mainContent.style.marginLeft,
                width: mainContent.style.width,
                boxSizing: mainContent.style.boxSizing,
                computedWidth: window.getComputedStyle(mainContent).width,
                computedMarginLeft: window.getComputedStyle(mainContent).marginLeft
            });
        }
    }

    // ============================================================
    // GLOBAL FUNCTIONS (exposed for HTML event handlers)
    // ============================================================
    window.toggleSidebarDropdown = function(dropdownId) {
        const dropdownContent = document.getElementById(`dd-${dropdownId}`);
        if (!dropdownContent) return;

        // Get all dropdown contents
        const allDropdownContents = document.querySelectorAll('.sidebar-dropdown-content');
        
        // Check if this dropdown is currently expanded
        const isCurrentlyExpanded = parseFloat(dropdownContent.style.maxHeight) > 0;

        // Close all dropdowns with smooth animation
        allDropdownContents.forEach(content => {
            if (content.id !== `dd-${dropdownId}`) {
                // Close other dropdowns
                content.style.maxHeight = '0px';
                content.style.opacity = '0';
                content.style.pointerEvents = 'none';
                
                // Extract dropdown ID from content's id (format: dd-{dropdownId})
                const otherDropdownId = content.id.replace('dd-', '');
                
                // Update arrow rotation for button
                const btn = content.previousElementSibling;
                if (btn) {
                    const arrow = btn.querySelector('.dropdown-arrow');
                    if (arrow) {
                        arrow.style.transform = 'rotate(0deg)';
                    }
                }
                
                // Update sessionStorage for closed dropdown
                sessionStorage.removeItem(`sidebar-dropdown-${otherDropdownId}`);
            }
        });

        // Toggle current dropdown
        if (isCurrentlyExpanded) {
            // Close current dropdown
            dropdownContent.style.maxHeight = '0px';
            dropdownContent.style.opacity = '0';
            dropdownContent.style.pointerEvents = 'none';
            
            // Rotate arrow back
            const btn = dropdownContent.previousElementSibling;
            if (btn) {
                const arrow = btn.querySelector('.dropdown-arrow');
                if (arrow) {
                    arrow.style.transform = 'rotate(0deg)';
                }
            }
            
            // Update expanded state in sessionStorage
            sessionStorage.removeItem(`sidebar-dropdown-${dropdownId}`);
        } else {
            // Open current dropdown
            dropdownContent.style.maxHeight = '500px';
            dropdownContent.style.opacity = '1';
            dropdownContent.style.pointerEvents = 'auto';
            
            // Rotate arrow
            const btn = dropdownContent.previousElementSibling;
            if (btn) {
                const arrow = btn.querySelector('.dropdown-arrow');
                if (arrow) {
                    arrow.style.transform = 'rotate(180deg)';
                }
            }
            
            // Update expanded state in sessionStorage
            sessionStorage.setItem(`sidebar-dropdown-${dropdownId}`, 'true');
        }
    };

    window.toggleDarkMode = function() {
        const isDark = localStorage.getItem('dark_mode_enabled') === 'true';
        const newDarkState = !isDark;
        localStorage.setItem('dark_mode_enabled', String(newDarkState));
        document.documentElement.setAttribute('data-dark-mode', String(newDarkState));
        
        // Apply CSS variables immediately
        if (window.applyDarkModeInlineStyles) {
            window.applyDarkModeInlineStyles(newDarkState);
        }
        
        // Add transition class for smooth animation
        document.documentElement.classList.remove('no-transition');
        document.documentElement.classList.add('with-transitions');
        
        renderSidebar();
    };

    window.initSidebar = function() {
        console.log('[SIDEBAR] initSidebar() called');
        renderSidebar();
    };

    window.loadSidebar = function(page) {
        console.log('[SIDEBAR] loadSidebar() called for page:', page);
        renderSidebar();
    };

    // ============================================================
    // INITIALIZE ON DOM READY
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[SIDEBAR] DOM loaded, rendering sidebar');
            renderSidebar();
        });
    } else {
        console.log('[SIDEBAR] DOM already loaded, rendering sidebar immediately');
        renderSidebar();
    }

    // Re-render on dark mode toggle from other sources
    window.addEventListener('storage', (e) => {
        if (e.key === 'dark_mode_enabled') {
            console.log('[SIDEBAR] Dark mode changed, re-rendering');
            renderSidebar();
        }
    });

})();

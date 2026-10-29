/**
 * Onboarding Tour — Guided Walkthrough (Driver.js)
 * Target: Dashboard Admin Zona (fase 1)
 *
 * Auto-start untuk first-time user (localStorage flag).
 * Replay manual via window.startOnboardingTour().
 */
(function () {
    'use strict';

    const TOUR_VERSION = 1;
    const STORAGE_KEY = 'onboarding_completed_v' + TOUR_VERSION;

    function isCompleted() {
        try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch (e) { return false; }
    }
    function markCompleted() {
        try { localStorage.setItem(STORAGE_KEY, 'true'); } catch (e) {}
    }
    function resetTour() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }

    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
                const el = document.querySelector(selector);
                if (el) return resolve(el);
                if (Date.now() - start > timeout) return resolve(null);
                setTimeout(check, 100);
            };
            check();
        });
    }

    function getSteps() {
        return [
            {
                // Welcome (center, no element)
                popover: {
                    title: 'Selamat Datang! 👋',
                    description: 'Ini adalah dashboard zona Anda. Mari kita lihat fitur-fitur utama dalam 6 langkah singkat.',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '.stats-grid',
                popover: {
                    title: '📊 Statistik Zona',
                    description: 'Ringkasan invoice zona Anda: Total, Lunas, Belum Lunas, Total Pengambilan, dan Total Harga. Angka ini update otomatis.',
                    side: 'bottom',
                    align: 'start'
                }
            },
            {
                element: '.filter-section',
                popover: {
                    title: '🔍 Pencarian & Filter',
                    description: 'Cari invoice by nomor, filter by Toko, Supplier, Keterangan (PPN/NON PPN), Tahun, Bulan. Tekan Enter atau klik Terapkan.',
                    side: 'bottom',
                    align: 'start'
                }
            },
            {
                element: '.table-container',
                popover: {
                    title: '📋 Tabel Invoice',
                    description: 'Daftar invoice dengan status file. Klik baris untuk detail, atau tombol aksi (download, hapus, dll.) di kolom AKSI.',
                    side: 'top',
                    align: 'start'
                }
            },
            {
                element: '#themeToggle',
                popover: {
                    title: '🌙 Dark / Light Mode',
                    description: 'Ganti tema tampilan sesuai preferensi Anda. Pilihan disimpan otomatis.',
                    side: 'bottom',
                    align: 'end'
                }
            },
            {
                element: '#announcementNotifBtn',
                popover: {
                    title: '🔔 Notifikasi Pengumuman',
                    description: 'Lihat pengumuman dari admin. Badge merah menunjukkan jumlah yang belum dibaca.',
                    side: 'bottom',
                    align: 'end'
                }
            },
            {
                element: '#profileBtn',
                popover: {
                    title: '👤 Profile & Pengaturan',
                    description: 'Lihat profil, preferensi, dan logout di sini. Anda juga bisa mengulang tour ini dari sini.',
                    side: 'bottom',
                    align: 'end'
                }
            },
            {
                // Selesai (center, no element)
                popover: {
                    title: 'Selesai! 🎉',
                    description: 'Anda sudah mengenal dashboard zona. Anda bisa mengulang tour kapan saja dari menu Profile. Selamat bekerja!',
                    side: 'bottom',
                    align: 'center'
                }
            }
        ];
    }

    function startTour() {
        if (!window.driver || !window.driver.js) {
            console.warn('[Onboarding] Driver.js not loaded');
            return;
        }
        const driver = window.driver.js.driver;
        const d = driver({
            showProgress: true,
            allowClose: true,
            overlayColor: 'rgba(0,0,0,0.05)',
            stagePadding: 10,
            stageRadius: 10,
            popoverClass: 'onboarding-popover',
            nextBtnText: 'Lanjut →',
            prevBtnText: '← Kembali',
            doneBtnText: 'Selesai',
            progressText: 'Langkah {{current}} dari {{total}}',
            steps: getSteps(),
            onDestroyed: () => markCompleted()
        });
        d.drive();
    }

    function showWelcomeModal() {
        if (typeof Swal === 'undefined') {
            // Fallback: langsung start tour
            startTour();
            return;
        }
        Swal.fire({
            title: 'Selamat Datang! 👋',
            text: 'Mau lihat tour singkat fitur-fitur utama dashboard zona?',
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'Mulai Tour',
            cancelButtonText: 'Lewati',
            confirmButtonColor: '#3d3b6b',
            cancelButtonColor: '#9ca3af',
            backdrop: 'rgba(0,0,0,0.5)'
        }).then((result) => {
            if (result.isConfirmed) {
                startTour();
            } else {
                markCompleted();
            }
        });
    }

    async function init() {
        if (isCompleted()) return;
        // Tunggu elemen utama siap
        const el = await waitForElement('.stats-grid', 8000);
        if (!el) return;  // halaman belum siap, skip
        // Delay kecil agar UI stabil
        setTimeout(() => {
            if (document.querySelector('.stats-grid')) showWelcomeModal();
        }, 800);
    }

    // Expose untuk replay manual
    window.startOnboardingTour = function () {
        resetTour();
        startTour();
    };
    window.resetOnboardingTour = resetTour;

    // Auto-init setelah auth siap (full page load)
    // Gunakan event 'spa-page-loaded' atau timeout sederhana, TANPA polling berat
    function tryInit() {
        // Jika sudah completed, skip (cepat)
        if (isCompleted()) return;
        // Tunggu elemen utama siap dengan timeout tunggal
        setTimeout(() => {
            if (isCompleted()) return;
            if (document.querySelector('.stats-grid')) init();
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        tryInit();
    }
})();
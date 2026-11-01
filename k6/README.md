# k6 Load Test

## Prasyarat
- Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/

## Jalankan
```bash
# Local
k6 run -e BASE_URL=http://localhost:5000 -e USERNAME=doni -e PASSWORD=... k6/load-test.js

# Production
k6 run -e BASE_URL=https://arsipdigitalanka.cloud -e USERNAME=doni -e PASSWORD=... k6/load-test.js
```

## Catatan
- Jika akun memakai token login harian (2FA), gunakan akun yang tidak memerlukan token atau pastikan token sudah diverifikasi.
- Sesuaikan stages/thresholds sesuai kebutuhan.
- Endpoint yang diuji: `/api/auth/me`, `/api/invoice/list`, `/api/files`, `/api/maintenance/check-session`.
```
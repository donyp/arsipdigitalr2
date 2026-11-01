import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

// Base URL and credentials can be overridden:
//   k6 run -e BASE_URL=https://arsipdigitalanka.cloud -e USERNAME=doni -e PASSWORD=... k6/load-test.js
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const USERNAME = __ENV.USERNAME || 'doni';
const PASSWORD = __ENV.PASSWORD || '';

const errorRate = new Rate('errors');

export const options = {
    stages: [
        { duration: '30s', target: 5 },   // ramp up
        { duration: '1m', target: 10 },   // steady
        { duration: '30s', target: 0 },   // ramp down
    ],
    thresholds: {
        http_req_failed: ['rate<0.05'],
        http_req_duration: ['p(95)<2000'],
        errors: ['rate<0.05'],
    },
};

export function setup() {
    const loginRes = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ username: USERNAME, password: PASSWORD }),
        { headers: { 'Content-Type': 'application/json' } }
    );

    const ok = check(loginRes, {
        'login status 200': (r) => r.status === 200,
        'login has token': (r) => !!r.json('token'),
    });

    if (!ok) {
        console.error('Login failed:', loginRes.status, loginRes.body);
        return { token: null };
    }

    return { token: loginRes.json('token') };
}

export default function (data) {
    if (!data || !data.token) {
        errorRate.add(1);
        sleep(1);
        return;
    }

    const headers = { Authorization: `Bearer ${data.token}` };

    group('Auth - current user', () => {
        const res = http.get(`${BASE_URL}/api/auth/me`, { headers });
        check(res, { 'me 200': (r) => r.status === 200 }) || errorRate.add(1);
    });
    sleep(1);

    group('Invoice - list', () => {
        const res = http.get(`${BASE_URL}/api/invoice/list?limit=20`, { headers });
        check(res, { 'invoice list ok': (r) => r.status === 200 || r.status === 404 }) || errorRate.add(1);
    });
    sleep(1);

    group('Files - list', () => {
        const res = http.get(`${BASE_URL}/api/files?limit=20`, { headers });
        check(res, { 'files list ok': (r) => r.status === 200 || r.status === 404 }) || errorRate.add(1);
    });
    sleep(1);

    group('Session - check', () => {
        const sid = __ENV.SESSION_ID || '';
        const res = http.post(
            `${BASE_URL}/api/maintenance/check-session`,
            JSON.stringify({ sessionId: sid }),
            { headers: { ...headers, 'Content-Type': 'application/json' } }
        );
        check(res, { 'check-session ok': (r) => r.status === 200 || r.status === 401 }) || errorRate.add(1);
    });
    sleep(1);
}

export function teardown(data) {
    // no-op
}

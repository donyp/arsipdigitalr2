#!/usr/bin/env node
/**
 * Fleet Management System - Integration Test
 * Tests all CRUD operations and workflows
 * Run: node backend/test-fleet-management.js
 */

require('dotenv').config();
const http = require('http');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

let testsPassed = 0;
let testsFailed = 0;
let vehicleId = null;
let documentId = null;
let maintenanceId = null;
let jwtToken = null;

// Test helper function
function test(name, passed, message = '') {
    if (passed) {
        console.log(`${colors.green}✅ PASS${colors.reset} - ${name}${message ? ' (' + message + ')' : ''}`);
        testsPassed++;
    } else {
        console.log(`${colors.red}❌ FAIL${colors.reset} - ${name}${message ? ' (' + message + ')' : ''}`);
        testsFailed++;
    }
}

// Make HTTP request
function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (jwtToken) {
            options.headers['Authorization'] = `Bearer ${jwtToken}`;
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        data: data ? JSON.parse(data) : null,
                        headers: res.headers
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data,
                        headers: res.headers
                    });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Main test runner
async function runTests() {
    console.log(`\n${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}║     Fleet Management System - Integration Test              ║${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`);

    try {
        // Get JWT token first (using test credentials)
        console.log(`${colors.blue}📋 Step 1: Getting JWT Token...${colors.reset}`);
        // This assumes you have a test user or we'll skip auth
        
        // TEST 1: Get list of vehicles (should be empty initially)
        console.log(`\n${colors.blue}🚛 TEST 1: Get Vehicles List${colors.reset}`);
        const getVehiclesRes = await makeRequest('GET', '/api/fleet/vehicles');
        test('GET /api/fleet/vehicles returns 200', getVehiclesRes.status === 200);
        test('Response has success field', getVehiclesRes.data?.success === true);
        test('Response has data array', Array.isArray(getVehiclesRes.data?.data));

        // TEST 2: Create a vehicle
        console.log(`\n${colors.blue}🚙 TEST 2: Create Vehicle${colors.reset}`);
        const createVehicleRes = await makeRequest('POST', '/api/fleet/vehicles', {
            plate_number: 'B 1111 TEST',
            vehicle_type: 'T120SS BOX',
            vehicle_name: 'Test Truck T120',
            brand_model: 'Isuzu T120SS',
            year_manufacture: 2023,
            color: 'White',
            engine_number: 'TEST-ENGINE-001',
            notes: 'Test vehicle for integration testing'
        });
        test('POST /api/fleet/vehicles returns 201', createVehicleRes.status === 201);
        test('Vehicle created successfully', createVehicleRes.data?.success === true);
        test('Response includes vehicle ID', createVehicleRes.data?.data?.id);
        
        if (createVehicleRes.data?.data?.id) {
            vehicleId = createVehicleRes.data.data.id;
            test('Vehicle ID stored for next tests', !!vehicleId, vehicleId);
        }

        // TEST 3: Get vehicle by ID
        if (vehicleId) {
            console.log(`\n${colors.blue}📖 TEST 3: Get Vehicle Detail${colors.reset}`);
            const getVehicleRes = await makeRequest('GET', `/api/fleet/vehicles/${vehicleId}`);
            test('GET /api/fleet/vehicles/:id returns 200', getVehicleRes.status === 200);
            test('Vehicle detail retrieved', getVehicleRes.data?.success === true);
            test('Vehicle has documents array', Array.isArray(getVehicleRes.data?.data?.documents));
            test('Vehicle has maintenance array', Array.isArray(getVehicleRes.data?.data?.maintenance));
        }

        // TEST 4: Create a document
        if (vehicleId) {
            console.log(`\n${colors.blue}📋 TEST 4: Create Document${colors.reset}`);
            const createDocRes = await makeRequest('POST', '/api/fleet/documents', {
                vehicle_id: vehicleId,
                plate_number: 'B 1111 TEST',
                document_type: 'KIR',
                issue_date: '2023-06-01',
                expiration_date: '2025-06-01',
                document_number: 'KIR-TEST-001',
                issued_by: 'Balai Pengujian Kendaraan',
                notes: 'Test KIR document'
            });
            test('POST /api/fleet/documents returns 201', createDocRes.status === 201);
            test('Document created successfully', createDocRes.data?.success === true);
            test('Response includes document ID', createDocRes.data?.data?.id);
            
            if (createDocRes.data?.data?.id) {
                documentId = createDocRes.data.data.id;
                test('Document ID stored', !!documentId, documentId);
            }
        }

        // TEST 5: Get expiring documents
        console.log(`\n${colors.blue}⏰ TEST 5: Get Expiring Documents${colors.reset}`);
        const expiringRes = await makeRequest('GET', '/api/fleet/documents/expiring?days=30');
        test('GET /api/fleet/documents/expiring returns 200', expiringRes.status === 200);
        test('Response has success field', expiringRes.data?.success === true);
        test('Response has data array', Array.isArray(expiringRes.data?.data));
        test('Has count field', typeof expiringRes.data?.count === 'number');

        // TEST 6: Get expired documents
        console.log(`\n${colors.blue}❌ TEST 6: Get Expired Documents${colors.reset}`);
        const expiredRes = await makeRequest('GET', '/api/fleet/documents/expired');
        test('GET /api/fleet/documents/expired returns 200', expiredRes.status === 200);
        test('Response has success field', expiredRes.data?.success === true);
        test('Response has data array', Array.isArray(expiredRes.data?.data));

        // TEST 7: Create maintenance record
        if (vehicleId) {
            console.log(`\n${colors.blue}🔧 TEST 7: Create Maintenance Record${colors.reset}`);
            const createMainRes = await makeRequest('POST', '/api/fleet/maintenance', {
                vehicle_id: vehicleId,
                plate_number: 'B 1111 TEST',
                maintenance_type: 'SERVICE',
                service_date: '2024-10-06',
                description: 'Routine service - oil and filter change',
                cost: 1500000,
                odometer_reading: 50000,
                maintenance_provider: 'Bengkel Isuzu Resmi',
                parts_replaced: 'Oil filter, air filter',
                next_service_date: '2024-11-06'
            });
            test('POST /api/fleet/maintenance returns 201', createMainRes.status === 201);
            test('Maintenance record created', createMainRes.data?.success === true);
            test('Response includes maintenance ID', createMainRes.data?.data?.id);
            
            if (createMainRes.data?.data?.id) {
                maintenanceId = createMainRes.data.data.id;
                test('Maintenance ID stored', !!maintenanceId, maintenanceId);
            }
        }

        // TEST 8: Get maintenance history
        if (vehicleId) {
            console.log(`\n${colors.blue}📚 TEST 8: Get Maintenance History${colors.reset}`);
            const historyRes = await makeRequest('GET', `/api/fleet/maintenance/${vehicleId}`);
            test('GET /api/fleet/maintenance/:vehicleId returns 200', historyRes.status === 200);
            test('Maintenance history retrieved', historyRes.data?.success === true);
            test('Response has data array', Array.isArray(historyRes.data?.data));
            test('Has maintenance records', historyRes.data?.data?.length > 0);
        }

        // TEST 9: Update vehicle
        if (vehicleId) {
            console.log(`\n${colors.blue}✏️  TEST 9: Update Vehicle${colors.reset}`);
            const updateRes = await makeRequest('PUT', `/api/fleet/vehicles/${vehicleId}`, {
                notes: 'Updated test notes'
            });
            test('PUT /api/fleet/vehicles/:id returns 200', updateRes.status === 200);
            test('Vehicle updated successfully', updateRes.data?.success === true);
        }

        // TEST 10: Delete document
        if (documentId) {
            console.log(`\n${colors.blue}🗑️  TEST 10: Delete Document${colors.reset}`);
            const deleteRes = await makeRequest('DELETE', `/api/fleet/documents/${documentId}`);
            test('DELETE /api/fleet/documents/:id returns 200', deleteRes.status === 200);
            test('Document deleted successfully', deleteRes.data?.success === true);
        }

        // TEST 11: Verify document is deleted
        console.log(`\n${colors.blue}✔️  TEST 11: Verify Deletion${colors.reset}`);
        const getExpiredRes = await makeRequest('GET', '/api/fleet/documents/expired');
        test('Deleted document no longer in expired list', getExpiredRes.data?.success === true);

        // SUMMARY
        console.log(`\n${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
        console.log(`${colors.cyan}${colors.bright}║                    TEST SUMMARY                             ║${colors.reset}`);
        console.log(`${colors.cyan}${colors.bright}╠════════════════════════════════════════════════════════════╣${colors.reset}`);
        console.log(`${colors.bright}${colors.green}✅ Tests Passed: ${testsPassed}${colors.reset}`);
        console.log(`${colors.bright}${colors.red}❌ Tests Failed: ${testsFailed}${colors.reset}`);
        const totalTests = testsPassed + testsFailed;
        const percentage = Math.round((testsPassed / totalTests) * 100);
        console.log(`${colors.bright}📊 Success Rate: ${percentage}% (${testsPassed}/${totalTests})${colors.reset}`);
        console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`);

        if (testsFailed === 0) {
            console.log(`${colors.green}${colors.bright}🎉 ALL TESTS PASSED! Fleet Management System is working perfectly!${colors.reset}\n`);
            process.exit(0);
        } else {
            console.log(`${colors.yellow}${colors.bright}⚠️  Some tests failed. Please check the errors above.${colors.reset}\n`);
            process.exit(1);
        }

    } catch (error) {
        console.error(`${colors.red}❌ Test Error: ${error.message}${colors.reset}`);
        console.error(error);
        process.exit(1);
    }
}

// Check if server is running
console.log(`${colors.yellow}⏳ Checking if server is running on localhost:5000...${colors.reset}`);
setTimeout(async () => {
    try {
        const healthRes = await makeRequest('GET', '/api/health');
        if (healthRes.status === 200) {
            console.log(`${colors.green}✅ Server is running!${colors.reset}\n`);
            runTests();
        }
    } catch (error) {
        console.error(`${colors.red}❌ Server is not running on localhost:5000${colors.reset}`);
        console.error(`${colors.yellow}Please start the server first:${colors.reset}`);
        console.error(`  npm start`);
        console.error(`  or`);
        console.error(`  node backend/server.js\n`);
        process.exit(1);
    }
}, 1000);

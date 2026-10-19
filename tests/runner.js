process.env.NODE_ENV = 'test';

const http = require('http');
const assert = require('assert');
const mongoose = require('mongoose');
const app = require('../server');

/**
 * Built-in Automated Test Runner for Practical 12
 * Executes integration tests and reports pass/fail status matching GitHub Actions.
 */

const PORT = 5099;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tasksDB_prac12_test';
let server;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(raw);
          } catch (e) {
            data = raw;
          }
          resolve({ status: res.statusCode, data });
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTestSuite() {
  console.log(`========================================================================`);
  console.log(` PRACTICAL 12: AUTOMATED CI/CD TEST SUITE (CI PIPELINE VALIDATION)`);
  console.log(` Target : Automated Testing Job (build-and-test)`);
  console.log(`========================================================================\n`);

  // Connect MongoDB if needed
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
      console.log(`[Test DB] Connected to test database: ${MONGO_URI}\n`);
    }
  } catch (err) {
    console.warn(`[Test DB Warning] MongoDB offline: ${err.message}. Proceeding with memory fallback.\n`);
  }

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`          Error: ${err.message}`);
      failed++;
    }
  }

  server = app.listen(PORT, async () => {
    try {
      // Test 1: Public Health & Metadata Endpoint
      await test('GET / returns 200 and confirms ACTIVE status', async () => {
        const res = await makeRequest('GET', '/');
        assert.strictEqual(res.status, 200, 'Status should be 200');
        assert.strictEqual(res.data.status, 'ACTIVE', 'Should be ACTIVE');
        assert(res.data.pipeline.includes('GitHub Actions'), 'Pipeline name should match');
      });

      // Test 2: Core Task Listing (Syllabus Step 2)
      await test('GET /tasks returns 200 and success response', async () => {
        const res = await makeRequest('GET', '/tasks');
        assert.strictEqual(res.status, 200, 'Status should be 200');
        assert.strictEqual(res.data.success, true, 'Response success should be true');
      });

      // Test 3: Cache Metrics Endpoint
      await test('GET /cache/stats returns 200 and cache metrics', async () => {
        const res = await makeRequest('GET', '/cache/stats');
        assert.strictEqual(res.status, 200, 'Status should be 200');
        assert.strictEqual(res.data.success, true, 'Cache stats should return success');
      });

      // Test 4: Event-driven Error Listener Verification
      await test('POST /tasks/test-error emits error event and responds 200', async () => {
        const res = await makeRequest('POST', '/tasks/test-error', { message: 'CI Pipeline Simulated Error' });
        assert.strictEqual(res.status, 200, 'Status should be 200');
        assert.strictEqual(res.data.success, true, 'Error should be caught cleanly');
      });
    } finally {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
      server.close(() => {
        console.log(`\n------------------------------------------------------------------------`);
        console.log(` Test Suites : 1 passed, 1 total`);
        console.log(` Tests       : ${passed} passed, ${failed} failed, ${passed + failed} total`);
        console.log(` Result      : ${failed === 0 ? 'ALL TESTS PASSED (GREEN CHECKMARK ✓)' : 'TESTS FAILED (RED X ✗)'}`);
        console.log(`------------------------------------------------------------------------\n`);
        process.exit(failed > 0 ? 1 : 0);
      });
    }
  });
}

runTestSuite().catch((e) => {
  if (server) server.close();
  console.error('Fatal test runner error:', e);
  process.exit(1);
});

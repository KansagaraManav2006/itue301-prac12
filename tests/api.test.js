const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');

/**
 * Practical 12: Automated Test Suite for CI/CD Pipeline
 * Tests run automatically in GitHub Actions on every push & pull request.
 */
describe('Practical 12: CI/CD Pipeline Automated Tests (Jest & Supertest)', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const testMongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tasksDB_prac12_test';
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(testMongoUri, { serverSelectionTimeoutMS: 2000 });
      }
    } catch (err) {
      console.warn('[Test Setup] MongoDB offline or unreachable; using in-memory fallbacks.');
    }
  });

  afterAll(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    } catch (err) {
      // Clean teardown
    }
  });

  // Test 1: Public Health Check & CI/CD Metadata
  test('GET / returns 200 and confirms active CI/CD status', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.pipeline).toContain('GitHub Actions');
  });

  // Test 2: Step 2 from Lab Manual - GET /tasks returns status 200
  test('GET /tasks returns 200 (Core Endpoint Test)', async () => {
    const res = await request(app).get('/tasks');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Test 3: Cache Metrics Endpoint
  test('GET /cache/stats returns 200 with cache metrics', async () => {
    const res = await request(app).get('/cache/stats');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Test 4: Event-driven Error Listener Verification
  test('POST /tasks/test-error emits error event and responds 200 safely', async () => {
    const res = await request(app)
      .post('/tasks/test-error')
      .send({ message: 'CI Pipeline Simulated Error' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

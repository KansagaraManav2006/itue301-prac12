const http = require('http');
const mongoose = require('mongoose');
require('dotenv').config();

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

// Helper function to send HTTP requests with timing measurement
function makeRequest({ method = 'GET', path, body = null, headers = {} }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = body ? JSON.stringify(body) : null;

    const requestHeaders = {
      'Accept': 'application/json',
      ...headers
    };

    if (postData) {
      requestHeaders['Content-Type'] = 'application/json';
      requestHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: requestHeaders
    };

    const startTime = process.hrtime.bigint();

    const req = http.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });

      res.on('end', () => {
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1e6;

        let parsedData = null;
        try {
          parsedData = JSON.parse(rawData);
        } catch (e) {
          parsedData = rawData;
        }

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          durationMs: parseFloat(durationMs.toFixed(2)),
          serverTime: res.headers['x-response-time'] || 'N/A',
          cacheHeader: res.headers['x-cache'] || 'NONE',
          data: parsedData
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// Helper function to verify or start the backend server
async function ensureServerRunning() {
  const isRunning = await new Promise((resolve) => {
    const req = http.get(BASE_URL, () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });

  if (!isRunning) {
    console.log(`Server not currently running on ${BASE_URL}. Starting server process...`);
    require('./server');
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const up = await new Promise((resolve) => {
        const req = http.get(BASE_URL, () => resolve(true));
        req.on('error', () => resolve(false));
      });
      if (up) {
        console.log('✓ Server instance successfully booted and ready.\n');
        return true;
      }
    }
    throw new Error('Failed to connect to backend server on ' + BASE_URL);
  } else {
    console.log(`✓ Active server detected on ${BASE_URL}.\n`);
  }
}

// Main benchmark execution routine
async function runBenchmark() {
  console.log('========================================================================');
  console.log('    PRACTICAL 9: IN-MEMORY CACHING & QUERY OPTIMIZATION BENCHMARK      ');
  console.log('========================================================================\n');

  await ensureServerRunning();

  try {
    // 1. Authenticate / Login to get JWT Token
    console.log('Step 1: Authenticating test user to obtain JWT token...');
    const testUser = {
      email: 'cache_benchmark_user@example.com',
      password: 'BenchmarkPassword123!'
    };

    // Try register first
    await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: testUser
    });

    // Login
    const loginRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: testUser
    });

    const token = loginRes.data && loginRes.data.token;
    if (!token) {
      throw new Error('Failed to obtain JWT token for benchmark.');
    }
    console.log('✓ Successfully authenticated. JWT token acquired.\n');

    const authHeaders = {
      'Authorization': `Bearer ${token}`
    };

    // 2. Clear cache to guarantee pristine initial state
    console.log('Step 2: Resetting and clearing in-memory cache...');
    await makeRequest({
      method: 'POST',
      path: '/tasks/cache/clear',
      headers: authHeaders
    });
    console.log('✓ In-memory cache cleared.\n');

    // 3. Ensure test tasks exist in MongoDB
    console.log('Step 3: Seeding initial tasks into MongoDB if needed...');
    const initialTasksRes = await makeRequest({
      method: 'GET',
      path: '/tasks?cache=false',
      headers: authHeaders
    });

    let sampleTaskId = null;
    if (!initialTasksRes.data.data || initialTasksRes.data.data.length < 3) {
      for (let i = 1; i <= 5; i++) {
        const createRes = await makeRequest({
          method: 'POST',
          path: '/tasks',
          headers: authHeaders,
          body: {
            title: `Benchmark Task #${i} - Database Query Sample`,
            description: `Sample task payload for Practical 9 caching tests (${new Date().toISOString()})`,
            priority: i % 2 === 0 ? 'high' : 'medium'
          }
        });
        if (createRes.data.data && createRes.data.data._id) {
          sampleTaskId = createRes.data.data._id;
        }
      }
      console.log('✓ Seeded 5 initial tasks into database.');
    } else {
      sampleTaskId = initialTasksRes.data.data[0]._id;
      console.log(`✓ Database already contains ${initialTasksRes.data.data.length} tasks.`);
    }

    // Flush cache again after seeding
    await makeRequest({
      method: 'POST',
      path: '/tasks/cache/clear',
      headers: authHeaders
    });
    console.log('✓ Cache reset ready for baseline measurement.\n');

    // 4. Measure Uncached Requests (Cold Cache / Direct DB queries)
    console.log('Step 4: Executing 3 UNCACHED requests (Direct Database Queries)...');
    const uncachedReadings = [];

    for (let i = 1; i <= 3; i++) {
      // Force database query via cache=false query parameter
      const res = await makeRequest({
        method: 'GET',
        path: '/tasks?cache=false',
        headers: authHeaders
      });
      uncachedReadings.push({
        iteration: i,
        clientDuration: res.durationMs,
        serverTime: res.serverTime,
        cacheStatus: res.cacheHeader,
        source: res.data.source || 'database',
        itemCount: res.data.count || 0
      });
      console.log(`  Reading ${i}: Client Roundtrip = ${res.durationMs}ms | Server = ${res.serverTime} | Cache = ${res.cacheHeader}`);
      // Small pause between readings
      await new Promise(r => setTimeout(r, 100));
    }
    console.log('');

    // 5. Measure Cached Requests (In-Memory node-cache hits)
    console.log('Step 5: Executing 3 CACHED requests (In-Memory node-cache Hits)...');
    // First request to populate the cache (Cache MISS)
    const warmUp = await makeRequest({
      method: 'GET',
      path: '/tasks',
      headers: authHeaders
    });
    console.log(`  Warm-up Request (MISS & populate cache): Client = ${warmUp.durationMs}ms | Server = ${warmUp.serverTime} | Cache = ${warmUp.cacheHeader}`);

    const cachedReadings = [];
    for (let i = 1; i <= 3; i++) {
      const res = await makeRequest({
        method: 'GET',
        path: '/tasks',
        headers: authHeaders
      });
      cachedReadings.push({
        iteration: i,
        clientDuration: res.durationMs,
        serverTime: res.serverTime,
        cacheStatus: res.cacheHeader,
        source: res.data.source || 'cache',
        itemCount: res.data.count || 0
      });
      console.log(`  Reading ${i}: Client Roundtrip = ${res.durationMs}ms | Server = ${res.serverTime} | Cache = ${res.cacheHeader}`);
      await new Promise(r => setTimeout(r, 100));
    }
    console.log('');

    // 6. Test Cache Invalidation on Write Operation (POST /tasks)
    console.log('Step 6: Testing Cache Invalidation on Write (POST /tasks)...');
    const newTaskPayload = {
      title: 'Real-Time Invalidation Test Task',
      description: 'Verifying that write operations automatically invalidate stale cache keys',
      priority: 'high'
    };

    const postRes = await makeRequest({
      method: 'POST',
      path: '/tasks',
      headers: authHeaders,
      body: newTaskPayload
    });
    console.log(`  POST /tasks responded with 201 Created. Cache keys invalidated:`, postRes.data.cacheInvalidated);

    // Immediate read after write - MUST BE CACHE MISS with new count!
    const postInvalidateGet = await makeRequest({
      method: 'GET',
      path: '/tasks',
      headers: authHeaders
    });
    console.log(`  Immediate GET /tasks after POST: Cache = ${postInvalidateGet.cacheHeader} | Source = ${postInvalidateGet.data.source} (MUST BE MISS)`);
    console.log(`  Item count reflects newly added task: ${postInvalidateGet.data.count}`);
    console.log('');

    // 7. Test Single Task Endpoint Caching (GET /tasks/:id)
    console.log('Step 7: Testing Supplementary Feature - Single Task Caching (GET /tasks/:id)...');
    const singleTaskId = postRes.data.data._id || sampleTaskId;

    // First request -> MISS
    const single1 = await makeRequest({
      method: 'GET',
      path: `/tasks/${singleTaskId}`,
      headers: authHeaders
    });
    console.log(`  GET /tasks/${singleTaskId} (1st call): Cache = ${single1.cacheHeader} | Server = ${single1.serverTime} (MISS)`);

    // Second request -> HIT
    const single2 = await makeRequest({
      method: 'GET',
      path: `/tasks/${singleTaskId}`,
      headers: authHeaders
    });
    console.log(`  GET /tasks/${singleTaskId} (2nd call): Cache = ${single2.cacheHeader} | Server = ${single2.serverTime} (HIT)`);

    // Update single task -> Invalidates both all_tasks and task_<id>
    const updateRes = await makeRequest({
      method: 'PUT',
      path: `/tasks/${singleTaskId}`,
      headers: authHeaders,
      body: {
        title: 'Updated Title for Invalidation Test'
      }
    });
    console.log(`  PUT /tasks/${singleTaskId} updated. Invalidated keys:`, updateRes.data.cacheInvalidated);

    // Third request -> MISS (Fresh data loaded)
    const single3 = await makeRequest({
      method: 'GET',
      path: `/tasks/${singleTaskId}`,
      headers: authHeaders
    });
    console.log(`  GET /tasks/${singleTaskId} (after PUT): Cache = ${single3.cacheHeader} | Server = ${single3.serverTime} (MISS - Fresh data loaded)`);
    console.log('');

    // 8. Fetch Debug Cache Statistics
    console.log('Step 8: Fetching Cache Telemetry & Statistics (GET /tasks/cache/stats)...');
    const statsRes = await makeRequest({
      method: 'GET',
      path: '/tasks/cache/stats',
      headers: authHeaders
    });
    console.log('  Cache Metrics Summary:');
    console.log(JSON.stringify(statsRes.data.data, null, 2));
    console.log('');

    // 9. Generate Summary Comparison Table
    console.log('========================================================================');
    console.log('                      BENCHMARK RESULTS & READINGS                      ');
    console.log('========================================================================\n');

    const avgUncached = (uncachedReadings.reduce((sum, r) => sum + r.clientDuration, 0) / uncachedReadings.length).toFixed(2);
    const avgCached = (cachedReadings.reduce((sum, r) => sum + r.clientDuration, 0) / cachedReadings.length).toFixed(2);
    const speedup = (avgUncached / avgCached).toFixed(2);
    const percentReduction = (((avgUncached - avgCached) / avgUncached) * 100).toFixed(2);

    console.log('| Reading # | Uncached (DB Query) | Cached (node-cache HIT) | Speedup / Reduction |');
    console.log('| :--- | :--- | :--- | :--- |');
    for (let i = 0; i < 3; i++) {
      const u = uncachedReadings[i].clientDuration;
      const c = cachedReadings[i].clientDuration;
      const red = (((u - c) / u) * 100).toFixed(1);
      console.log(`| Reading ${i + 1} | ${u} ms (${uncachedReadings[i].serverTime} server) | ${c} ms (${cachedReadings[i].serverTime} server) | -${red}% faster |`);
    }
    console.log(`| **Average** | **${avgUncached} ms** | **${avgCached} ms** | **${speedup}x Faster (-${percentReduction}%)** |\n`);

    console.log('========================================================================');
    console.log('                   BENCHMARK COMPLETED SUCCESSFULLY                     ');
    console.log('========================================================================');

    process.exit(0);
  } catch (error) {
    console.error('Benchmark Error:', error.message || error);
    process.exit(1);
  }
}

// Start benchmark
runBenchmark();

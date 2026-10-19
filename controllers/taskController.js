const Task = require('../models/Task');
const cache = require('../utils/cache');
const taskEvents = require('../events');
const { eventHistory } = require('../listeners');

// Helper to determine if caching is bypassed via query param or header
const isCachingDisabled = (req) => {
  if (process.env.ENABLE_CACHE === 'false') return true;
  if (req.query && req.query.cache === 'false') return true;
  if (req.headers && req.headers['x-no-cache'] === 'true') return true;
  return false;
};

// @desc    Get all tasks (Cached with TTL)
// @route   GET /tasks OR GET /api/tasks
exports.getAllTasks = async (req, res, next) => {
  try {
    const bypassCache = isCachingDisabled(req);
    const cacheKey = 'all_tasks';

    // 1. Check in-memory cache if not bypassed
    if (!bypassCache) {
      const cachedTasks = cache.get(cacheKey);
      if (cachedTasks) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json({
          success: true,
          source: 'cache',
          cacheStatus: 'HIT',
          count: cachedTasks.length,
          data: cachedTasks
        });
      }
    }

    // 2. Cache MISS or BYPASS: Query MongoDB
    const tasks = await Task.find().sort({ createdAt: -1 });

    // 3. Store in cache for subsequent requests (if caching is active)
    if (!bypassCache) {
      cache.set(cacheKey, tasks);
      res.setHeader('X-Cache', 'MISS');
    } else {
      res.setHeader('X-Cache', 'BYPASS');
    }

    return res.status(200).json({
      success: true,
      source: 'database',
      cacheStatus: bypassCache ? 'BYPASS' : 'MISS',
      count: tasks.length,
      data: tasks
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single task by ID (Cached separately with key: task_<id>)
// @route   GET /tasks/:id OR GET /api/tasks/:id
exports.getTaskById = async (req, res, next) => {
  try {
    const bypassCache = isCachingDisabled(req);
    const cacheKey = `task_${req.params.id}`;

    // 1. Check cache for single task
    if (!bypassCache) {
      const cachedTask = cache.get(cacheKey);
      if (cachedTask) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json({
          success: true,
          source: 'cache',
          cacheStatus: 'HIT',
          data: cachedTask
        });
      }
    }

    // 2. Query MongoDB
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: `Task not found with id ${req.params.id}`
      });
    }

    // 3. Store in cache under specific task key
    if (!bypassCache) {
      cache.set(cacheKey, task);
      res.setHeader('X-Cache', 'MISS');
    } else {
      res.setHeader('X-Cache', 'BYPASS');
    }

    return res.status(200).json({
      success: true,
      source: 'database',
      cacheStatus: bypassCache ? 'BYPASS' : 'MISS',
      data: task
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a new task with Event-Driven Background Processing
// @route   POST /tasks OR POST /api/tasks
// @notes   Demonstrates synchronous vs asynchronous processing via ?mode=sync or default async
exports.createTask = async (req, res, next) => {
  try {
    const { title, description, priority, assignedUser, simulateError } = req.body;
    const mode = (req.query.mode || req.headers['x-execution-mode'] || 'async').toLowerCase();

    // Determine assigned user from payload, JWT token, or default
    const resolvedUser = assignedUser || (req.user ? req.user.email : 'admin@example.com');

    // 1. Save task to MongoDB
    const task = await Task.create({
      title,
      description,
      priority,
      assignedUser: resolvedUser
    });

    // 2. Cache Invalidation: invalidate 'all_tasks' so stale listing is never served
    const invalidatedCount = cache.del('all_tasks');
    console.log(`[Cache Invalidation] Cleared 'all_tasks' cache key (${invalidatedCount} key deleted)`);

    // --- DEMONSTRATION OF SYNCHRONOUS VS ASYNCHRONOUS HANDLING ---
    if (mode === 'sync') {
      // Synchronous handling: Notification executed directly inside POST route (BLOCKING)
      const delayMs = parseInt(process.env.NOTIFICATION_DELAY_MS || '2000', 10);
      console.log(`\n------------------------------------------------------------`);
      console.log(`[SYNCHRONOUS EXECUTION DEMO] Processing notification inline inside route...`);
      console.log(`[SYNCHRONOUS EXECUTION DEMO] Blocking API response for ${delayMs}ms...`);
      
      // Simulate slow notification logic blocking the event loop / response
      await new Promise(resolve => setTimeout(resolve, delayMs));

      const syncCompleteTime = new Date().toISOString();
      console.log(`[Notification] Task "${task.title}" created at ${syncCompleteTime}`);
      console.log(`[API] Response sent at ${syncCompleteTime} (BLOCKED by synchronous notification)`);
      console.log(`------------------------------------------------------------\n`);

      return res.status(201).json({
        success: true,
        executionMode: 'synchronous (blocking)',
        message: `Task created and notification processed synchronously. Response was blocked for ${delayMs}ms!`,
        apiResponseTimestamp: syncCompleteTime,
        data: task
      });
    }

    // Step 3 of Lab Session:
    // "Inside the POST /tasks route, emit the event right after saving the task, then respond immediately:
    //  const task = await Task.create(req.body);
    //  console.log(`[API] Response sent at ${new Date().toISOString()}`);
    //  res.status(201).json(task);
    //  taskEvents.emit('task-created', task);"
    const apiResponseTimestamp = new Date().toISOString();
    console.log(`\n[API] Response sent at ${apiResponseTimestamp}`);

    res.status(201).json({
      success: true,
      executionMode: 'asynchronous (non-blocking)',
      message: 'Task created successfully. Background notification dispatched asynchronously.',
      apiResponseTimestamp,
      data: task
    });

    // Emit event asynchronously; event listener processes notification without blocking client response
    const eventPayload = task.toObject ? task.toObject() : { ...task };
    if (simulateError) {
      eventPayload.simulateError = true;
    }
    taskEvents.emit('task-created', eventPayload);

  } catch (err) {
    next(err);
  }
};

// @desc    Update an existing task (Invalidates 'all_tasks' AND 'task_<id>')
// @route   PUT /tasks/:id OR PUT /api/tasks/:id
exports.updateTask = async (req, res, next) => {
  try {
    // 1. Write to MongoDB
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: `Task not found with id ${req.params.id}`
      });
    }

    // 2. Cache Invalidation: invalidate both all_tasks and single task cache
    const keysToInvalidate = ['all_tasks', `task_${req.params.id}`];
    const invalidatedCount = cache.del(keysToInvalidate);
    console.log(`[Cache Invalidation] Cleared keys [${keysToInvalidate.join(', ')}] (${invalidatedCount} key(s) deleted)`);

    res.status(200).json({
      success: true,
      message: 'Task updated successfully and cache invalidated',
      cacheInvalidated: keysToInvalidate,
      data: task
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete a task & emit 'task-deleted' event (Supplementary Problem 1)
// @route   DELETE /tasks/:id OR DELETE /api/tasks/:id
exports.deleteTask = async (req, res, next) => {
  try {
    // 1. Write to MongoDB
    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: `Task not found with id ${req.params.id}`
      });
    }

    // 2. Cache Invalidation: invalidate both all_tasks and single task cache
    const keysToInvalidate = ['all_tasks', `task_${req.params.id}`];
    const invalidatedCount = cache.del(keysToInvalidate);
    console.log(`[Cache Invalidation] Cleared keys [${keysToInvalidate.join(', ')}] (${invalidatedCount} key(s) deleted)`);

    const apiResponseTimestamp = new Date().toISOString();
    console.log(`[API] Task deleted. Response sent at ${apiResponseTimestamp}`);

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully and background audit event emitted',
      apiResponseTimestamp,
      cacheInvalidated: keysToInvalidate,
      data: {}
    });

    // Supplementary Problem 1: Emit task-deleted event
    taskEvents.emit('task-deleted', task);
  } catch (err) {
    next(err);
  }
};

// @desc    Supplementary Problem 2: Trigger error event to test error listener
// @route   POST /tasks/test-error OR POST /api/tasks/test-error
exports.triggerErrorEvent = (req, res) => {
  const errorMessage = req.body.message || 'Simulated asynchronous background job failure';
  
  // Emitting 'error' event on TaskEvents
  taskEvents.emit('error', new Error(errorMessage));

  res.status(200).json({
    success: true,
    message: 'Simulated error event emitted. Handled gracefully by error listener without crashing server.',
    emittedError: errorMessage,
    timestamp: new Date().toISOString()
  });
};

// @desc    Get processed events history (for testing and verification)
// @route   GET /tasks/events/history OR GET /api/tasks/events/history
exports.getEventHistory = (req, res) => {
  res.status(200).json({
    success: true,
    count: eventHistory.length,
    data: eventHistory
  });
};

// @desc    Debug endpoint: Get cache metrics and hit/miss statistics
// @route   GET /tasks/cache/stats OR GET /api/tasks/cache/stats
exports.getCacheStats = (req, res) => {
  const metrics = cache.getMetrics();
  res.status(200).json({
    success: true,
    data: metrics
  });
};

// @desc    Debug endpoint: Clear/flush in-memory cache
// @route   POST /tasks/cache/clear OR POST /api/tasks/cache/clear
exports.clearCache = (req, res) => {
  cache.flush();
  cache.resetMetrics();
  console.log('[Cache Management] In-memory cache cleared & metrics reset');
  res.status(200).json({
    success: true,
    message: 'In-memory cache cleared and metrics reset successfully'
  });
};

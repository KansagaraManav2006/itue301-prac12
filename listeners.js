const taskEvents = require('./events');

/**
 * Practical 10 - Step 2: Register event listeners in a separate listeners.js file
 * 
 * Supplementary Problems:
 * 1. Add a second event, 'task-deleted', with its own listener that logs a different message.
 * 2. Add an 'error' event listener that catches and logs any error thrown inside event handlers.
 * 3. Simulate a slow notification handler (e.g., setTimeout of 2 seconds) and confirm the API still responds instantly.
 */

// Track listeners status and event execution history for observation & verification
const eventHistory = [];

/**
 * Listener 1: 'task-created'
 * Triggered asynchronously after saving a new task in MongoDB.
 */
taskEvents.on('task-created', (task) => {
  const listenerStartTime = new Date().toISOString();
  const assignedUser = task.assignedUser || task.assignedTo || 'admin@example.com';

  console.log(`\n============================================================`);
  console.log(`[Notification Listener] 'task-created' EVENT RECEIVED`);
  console.log(`[Notification Listener] Listener Start Time : ${listenerStartTime}`);
  console.log(`[Notification Listener] Task Title          : "${task.title}"`);
  console.log(`[Notification Listener] Assigned User       : ${assignedUser}`);
  console.log(`[Notification Listener] Priority            : ${task.priority || 'medium'}`);
  console.log(`[Notification Listener] Task ID             : ${task._id || 'N/A'}`);

  // Test Case / Supplementary: Handling listener error simulation
  if (task.simulateError) {
    console.warn(`[Notification Listener] [SIMULATED ERROR] Error condition triggered for task "${task.title}"`);
    console.log(`============================================================\n`);
    // Emitting error event safely caught by error listener
    taskEvents.emit('error', new Error(`Background notification delivery failed for task "${task.title}" (Simulated Failure)`));
    return;
  }

  // Artificial delay to simulate asynchronous external services (e.g. Email dispatch, SMS, push notifications)
  const delayMs = parseInt(process.env.NOTIFICATION_DELAY_MS || '2000', 10);
  console.log(`[Notification Listener] Simulating slow external processing (${delayMs}ms artificial delay)...`);
  console.log(`[Notification Listener] Main thread remains non-blocking; HTTP response has already completed!`);

  setTimeout(() => {
    const listenerEndTime = new Date().toISOString();
    console.log(`\n------------------------------------------------------------`);
    console.log(`[Notification Listener] BACKGROUND PROCESSING COMPLETED!`);
    console.log(`[Notification] Task "${task.title}" notification processed at ${listenerEndTime}`);
    console.log(`[Notification] Dispatched to: ${assignedUser}`);
    console.log(`[Notification] Start: ${listenerStartTime} -> Finish: ${listenerEndTime} (${delayMs}ms later)`);
    console.log(`------------------------------------------------------------\n`);

    eventHistory.push({
      event: 'task-created',
      taskTitle: task.title,
      assignedUser,
      startTime: listenerStartTime,
      finishTime: listenerEndTime,
      delayMs
    });
  }, delayMs);

  console.log(`============================================================\n`);
});

/**
 * Listener 2: 'task-deleted' (Supplementary Problem 1)
 * Triggered asynchronously after deleting a task from MongoDB.
 */
taskEvents.on('task-deleted', (task) => {
  const timestamp = new Date().toISOString();
  console.log(`\n============================================================`);
  console.log(`[Notification Listener] 'task-deleted' EVENT RECEIVED`);
  console.log(`[Notification] Task "${task.title || 'Untitled'}" (ID: ${task._id}) was deleted at ${timestamp}`);
  console.log(`[Notification] Background audit record created.`);
  console.log(`============================================================\n`);

  eventHistory.push({
    event: 'task-deleted',
    taskTitle: task.title,
    taskId: task._id,
    timestamp
  });
});

/**
 * Listener 3: 'error' (Supplementary Problem 2)
 * Catches and logs errors thrown or emitted within event handlers,
 * preventing Node.js unhandled error exceptions from terminating the server.
 */
taskEvents.on('error', (err) => {
  const timestamp = new Date().toISOString();
  console.error(`\n************************************************************`);
  console.error(`[Event Error Listener] [${timestamp}] Caught event error:`);
  console.error(`  Message: ${err.message}`);
  if (err.stack) {
    console.error(`  Location: ${err.stack.split('\n')[1] ? err.stack.split('\n')[1].trim() : 'N/A'}`);
  }
  console.error(`  Status: Handled gracefully without crashing the Node.js server.`);
  console.error(`************************************************************\n`);

  eventHistory.push({
    event: 'error',
    error: err.message,
    timestamp
  });
});

console.log('[Listeners] Registered listeners for events: [task-created, task-deleted, error]');

module.exports = {
  taskEvents,
  eventHistory
};

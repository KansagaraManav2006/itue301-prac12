const EventEmitter = require('events');

/**
 * TaskEvents class extending Node.js native EventEmitter
 * Step 1 of Practical 10 Lab Session:
 * "Create a dedicated events.js module:
 *  const EventEmitter = require('events');
 *  class TaskEvents extends EventEmitter {}
 *  module.exports = new TaskEvents();"
 */
class TaskEvents extends EventEmitter {
  constructor() {
    super();
    // Allow higher listener capacity if multiple modules subscribe
    this.setMaxListeners(25);
  }
}

// Export singleton instance of TaskEvents
module.exports = new TaskEvents();

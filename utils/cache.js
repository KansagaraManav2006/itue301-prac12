const NodeCache = require('node-cache');
require('dotenv').config();

// Default TTL is 60 seconds (configurable via process.env.CACHE_TTL)
// checkperiod: 120 seconds (automatic cleanup of expired keys)
const defaultTTL = parseInt(process.env.CACHE_TTL, 10) || 60;

const nodeCacheInstance = new NodeCache({
  stdTTL: defaultTTL,
  checkperiod: 120,
  useClones: false // performance boost for read-only caching
});

// Custom statistics counters
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0,
  startedAt: new Date().toISOString()
};

// Event listeners to monitor cache activity
nodeCacheInstance.on('set', (key, value) => {
  stats.sets += 1;
});

nodeCacheInstance.on('del', (key, value) => {
  stats.invalidations += 1;
});

nodeCacheInstance.on('expired', (key, value) => {
  stats.invalidations += 1;
});

// Cache wrapper object providing extended telemetry and helper methods
const cache = {
  // Direct access to underlying NodeCache instance
  instance: nodeCacheInstance,

  // Get item from cache
  get: (key) => {
    const value = nodeCacheInstance.get(key);
    if (value !== undefined) {
      stats.hits += 1;
      return value;
    }
    stats.misses += 1;
    return undefined;
  },

  // Set item in cache with optional custom TTL
  set: (key, value, ttl = defaultTTL) => {
    return nodeCacheInstance.set(key, value, ttl);
  },

  // Delete one or multiple keys (cache invalidation)
  del: (keys) => {
    const count = nodeCacheInstance.del(keys);
    return count;
  },

  // Flush all cached data
  flush: () => {
    nodeCacheInstance.flushAll();
  },

  // Get list of all active cache keys
  keys: () => {
    return nodeCacheInstance.keys();
  },

  // Get TTL for a specific key
  getTtl: (key) => {
    return nodeCacheInstance.getTtl(key);
  },

  // Get combined statistics (custom counters + node-cache internal stats)
  getMetrics: () => {
    const internalStats = nodeCacheInstance.getStats();
    const totalRequests = stats.hits + stats.misses;
    const hitRatio = totalRequests > 0 ? ((stats.hits / totalRequests) * 100).toFixed(2) + '%' : '0.00%';

    return {
      defaultTTL: `${defaultTTL}s`,
      totalRequests,
      hits: stats.hits,
      misses: stats.misses,
      hitRatio,
      sets: stats.sets,
      invalidations: stats.invalidations,
      currentKeysCount: nodeCacheInstance.keys().length,
      currentKeys: nodeCacheInstance.keys(),
      nodeCacheStats: internalStats,
      startedAt: stats.startedAt
    };
  },

  // Reset statistics counters
  resetMetrics: () => {
    stats.hits = 0;
    stats.misses = 0;
    stats.sets = 0;
    stats.invalidations = 0;
    stats.startedAt = new Date().toISOString();
  }
};

module.exports = cache;

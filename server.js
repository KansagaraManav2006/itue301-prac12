const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// Initialize event listeners module
require('./listeners');

const logger = require('./middleware/logger');
const responseTiming = require('./middleware/responseTiming');
const requireJsonContentType = require('./middleware/requireJsonContentType');
const errorHandler = require('./middleware/errorHandler');
const taskRoutes = require('./routes/taskRoutes');
const authRoutes = require('./routes/authRoutes');
const cache = require('./utils/cache');
const taskEvents = require('./events');

const app = express();

// Middleware pipeline
app.use(cors());
app.use(express.json());
app.use(responseTiming);
app.use(logger);
app.use(requireJsonContentType);

// Public Health & CI/CD Metadata endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Practical 12: CI/CD Pipeline with GitHub Actions',
    status: 'ACTIVE',
    pipeline: 'GitHub Actions Automated CI Workflow',
    environment: process.env.NODE_ENV || 'development',
    testing: {
      framework: 'Jest & Supertest',
      automatedJob: 'build-and-test'
    },
    caching: {
      enabled: process.env.ENABLE_CACHE !== 'false',
      ttl: `${process.env.CACHE_TTL || 60} seconds`
    }
  });
});

// Public Cache Health & Metrics preview endpoint
app.get('/cache/stats', (req, res) => {
  res.status(200).json({
    success: true,
    data: cache.getMetrics()
  });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// Task routes
app.use('/tasks', taskRoutes);
app.use('/api/tasks', taskRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.originalUrl}`
  });
});

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tasksDB_prac12';

// Only bind HTTP listener and connect MongoDB when executed directly (not when required by tests)
if (require.main === module) {
  mongoose
    .connect(MONGO_URI)
    .then(() => {
      console.log('MongoDB connected successfully to', MONGO_URI);
      app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(` Prac 12 Server running on http://localhost:${PORT}`);
        console.log(` CI/CD Pipeline : GitHub Actions (.github/workflows/ci.yml)`);
        console.log(` Test Suite     : Jest & Supertest`);
        console.log(`====================================================`);
      });
    })
    .catch((err) => {
      console.error('MongoDB connection error:', err.message);
      process.exit(1);
    });
}

module.exports = app;

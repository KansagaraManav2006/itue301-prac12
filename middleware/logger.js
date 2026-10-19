const logger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const cacheStatus = res.getHeader('X-Cache') || '-';
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | Time: ${duration}ms | Cache: ${cacheStatus}`
    );
  });

  next();
};

module.exports = logger;

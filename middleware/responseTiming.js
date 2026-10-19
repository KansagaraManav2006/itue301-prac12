const responseTiming = (req, res, next) => {
  const start = process.hrtime.bigint();

  // Intercept writeHead / send to append X-Response-Time header
  const originalSend = res.send;
  res.send = function (body) {
    const end = process.hrtime.bigint();
    const durationInMs = Number(end - start) / 1e6;
    res.setHeader('X-Response-Time', `${durationInMs.toFixed(2)}ms`);
    return originalSend.call(this, body);
  };

  next();
};

module.exports = responseTiming;

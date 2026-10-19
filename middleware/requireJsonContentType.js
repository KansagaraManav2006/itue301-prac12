const requireJsonContentType = (req, res, next) => {
  // If request has a body (Content-Length > 0 or chunked transfer) and is POST/PUT/PATCH
  const hasBody = req.headers['content-length'] && parseInt(req.headers['content-length'], 10) > 0;
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && hasBody) {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(415).json({
        success: false,
        error: 'Unsupported Media Type: Content-Type must be application/json'
      });
    }
  }
  next();
};

module.exports = requireJsonContentType;

const validateTask = (req, res, next) => {
  const { title, priority } = req.body;

  if (req.method === 'POST' || (req.method === 'PUT' && title !== undefined)) {
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Task title is required and cannot be empty.'
      });
    }
  }

  if (priority !== undefined) {
    const validPriorities = ['low', 'medium', 'high'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        error: `Priority must be one of: ${validPriorities.join(', ')}`
      });
    }
  }

  next();
};

module.exports = validateTask;

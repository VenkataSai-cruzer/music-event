const { body, validationResult } = require('express-validator');

/**
 * Middleware to check validation results and return errors if any.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

/**
 * Validation rules for creating a ticket.
 */
const createTicketValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ max: 255 }).withMessage('Name must be at most 255 characters'),
  body('gender')
    .trim()
    .notEmpty().withMessage('Gender is required')
    .isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format'),
  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required')
    .matches(/^\+?[\d\s\-()]{7,20}$/).withMessage('Invalid mobile number format'),
  body('event_date')
    .trim()
    .notEmpty().withMessage('Event date is required')
    .isISO8601().withMessage('Invalid date format (use YYYY-MM-DD)'),
  body('event_address')
    .trim()
    .notEmpty().withMessage('Event address is required'),
  handleValidationErrors,
];

/**
 * Validation rules for login.
 */
const loginValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required'),
  body('password')
    .notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];

module.exports = { createTicketValidation, loginValidation };

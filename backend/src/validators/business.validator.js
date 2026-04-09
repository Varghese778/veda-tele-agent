/**
 * @file backend/src/validators/business.validator.js
 * @description Joi validation schemas for business profile operations (MOD-02).
 *
 * Exports:
 *   - createProfileSchema : Full validation for POST /api/business/profile.
 *                           All three fields are mandatory.
 *   - updateProfileSchema : Partial validation for PUT /api/business/profile.
 *                           All fields are optional but individually validated.
 *   - validate            : Generic middleware factory that wraps a Joi schema
 *                           and returns structured 400 errors on failure.
 *
 * Constants:
 *   - MIN_VALUE_PROP_LENGTH : 50 — ensures the core_value_prop provides
 *                             sufficient context density for the AI prompt
 *                             builder (MOD-08).
 */

const Joi = require('joi');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Minimum character length for `core_value_prop`.
 * This threshold guarantees enough context for Gemini's system prompt
 * built by PromptBuilderModule (MOD-08).
 */
const MIN_VALUE_PROP_LENGTH = 50;

/** Maximum sane upper bound for free-text fields (prevents abuse). */
const MAX_TEXT_LENGTH = 2000;

/** Maximum length for short identifier fields. */
const MAX_SHORT_LENGTH = 200;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shared Field Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Reusable field schemas. `.trim()` is applied to all string fields to
 * sanitize leading/trailing whitespace and prevent trivial injection vectors.
 */
const fields = {
  business_name: Joi.string()
    .trim()
    .min(1)
    .max(MAX_SHORT_LENGTH)
    .messages({
      'string.empty': 'Business name cannot be empty.',
      'string.max': `Business name must not exceed ${MAX_SHORT_LENGTH} characters.`,
      'any.required': 'Business name is required.',
    }),

  industry: Joi.string()
    .trim()
    .min(1)
    .max(MAX_SHORT_LENGTH)
    .messages({
      'string.empty': 'Industry cannot be empty.',
      'string.max': `Industry must not exceed ${MAX_SHORT_LENGTH} characters.`,
      'any.required': 'Industry is required.',
    }),

  core_value_prop: Joi.string()
    .trim()
    .min(MIN_VALUE_PROP_LENGTH)
    .max(MAX_TEXT_LENGTH)
    .messages({
      'string.empty': 'Core value proposition cannot be empty.',
      'string.min': `Core value proposition must be at least ${MIN_VALUE_PROP_LENGTH} characters to provide sufficient AI context.`,
      'string.max': `Core value proposition must not exceed ${MAX_TEXT_LENGTH} characters.`,
      'any.required': 'Core value proposition is required.',
    }),

  contact_email: Joi.string()
    .trim()
    .email({ tlds: { allow: false } })
    .max(MAX_SHORT_LENGTH)
    .messages({
      'string.email': 'Contact email must be a valid email address.',
    }),
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Schemas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * POST /api/business/profile — Create Profile (Onboarding).
 * All three core fields are mandatory.
 */
const createProfileSchema = Joi.object({
  business_name: fields.business_name.required(),
  industry: fields.industry.required(),
  core_value_prop: fields.core_value_prop.required(),
  contact_email: fields.contact_email.optional(),
}).options({ stripUnknown: true });
// `stripUnknown: true` silently removes any extra keys the client sends,
// preventing unexpected fields from reaching Firestore.

/**
 * PUT /api/business/profile — Update Profile.
 * All fields are optional individually, but at least one must be provided.
 */
const updateProfileSchema = Joi.object({
  business_name: fields.business_name.optional(),
  industry: fields.industry.optional(),
  core_value_prop: fields.core_value_prop.optional(),
  contact_email: fields.contact_email.optional(),
})
  .min(1) // At least one field must be present in the update payload.
  .options({ stripUnknown: true })
  .messages({
    'object.min': 'Update body must contain at least one field to update.',
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Middleware Factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * validate — Express middleware factory that validates `req.body` against
 * a given Joi schema.
 *
 * On validation success:
 *   - Replaces `req.body` with the sanitized (trimmed, stripped) output.
 *   - Calls `next()`.
 *
 * On validation failure:
 *   - Returns 400 with structured error details per the MOD-02 error spec.
 *
 * @param {Joi.ObjectSchema} schema — The Joi schema to validate against.
 * @returns {import('express').RequestHandler}
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Collect ALL errors, not just the first.
    });

    if (error) {
      // Map Joi details into a concise, client-friendly structure.
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        error: 'Bad Request',
        message: 'Validation failed. Check the details array for specifics.',
        details,
      });
    }

    // Replace body with sanitized values (trimmed strings, unknown keys stripped).
    req.body = value;
    return next();
  };
};

module.exports = {
  createProfileSchema,
  updateProfileSchema,
  validate,
  MIN_VALUE_PROP_LENGTH,
};

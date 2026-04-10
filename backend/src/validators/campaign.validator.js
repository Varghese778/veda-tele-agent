/**
 * @file backend/src/validators/campaign.validator.js
 * @description Joi validation schemas for campaign operations (MOD-03).
 *
 * Exports:
 *   - createCampaignSchema : Full validation for POST /api/campaigns.
 *                            All six content fields are mandatory.
 *   - updateCampaignSchema : Partial validation for PUT /api/campaigns/:id.
 *                            All content fields are optional; at least one required.
 *
 * Reuses the `validate` middleware factory from `business.validator.js`
 * (same Joi library already in the dependency tree — no new validator introduced).
 */

const Joi = require('joi');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Maximum characters for short fields (campaign_name, target_audience). */
const MAX_SHORT_LENGTH = 300;

/** Maximum characters for long free-text fields (purpose, script_guidelines, etc.). */
const MAX_LONG_LENGTH = 3000;

/** Default retry limit assigned on campaign creation (PRS §5 — campaigns schema). */
const DEFAULT_RETRY_LIMIT = 2;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shared Field Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fields = {
  campaign_name: Joi.string()
    .trim()
    .min(1)
    .max(MAX_SHORT_LENGTH)
    .messages({
      'string.empty': 'Campaign name cannot be empty.',
      'string.max': `Campaign name must not exceed ${MAX_SHORT_LENGTH} characters.`,
      'any.required': 'Campaign name is required.',
    }),

  purpose: Joi.string()
    .trim()
    .min(1)
    .max(MAX_LONG_LENGTH)
    .messages({
      'string.empty': 'Campaign purpose cannot be empty.',
      'string.max': `Purpose must not exceed ${MAX_LONG_LENGTH} characters.`,
      'any.required': 'Campaign purpose is required.',
    }),

  script_guidelines: Joi.string()
    .trim()
    .min(1)
    .max(MAX_LONG_LENGTH)
    .messages({
      'string.empty': 'Script guidelines cannot be empty.',
      'string.max': `Script guidelines must not exceed ${MAX_LONG_LENGTH} characters.`,
      'any.required': 'Script guidelines are required.',
    }),

  product_description: Joi.string()
    .trim()
    .min(1)
    .max(MAX_LONG_LENGTH)
    .messages({
      'string.empty': 'Product description cannot be empty.',
      'string.max': `Product description must not exceed ${MAX_LONG_LENGTH} characters.`,
      'any.required': 'Product description is required.',
    }),

  target_audience: Joi.string()
    .trim()
    .min(1)
    .max(MAX_SHORT_LENGTH)
    .messages({
      'string.empty': 'Target audience cannot be empty.',
      'string.max': `Target audience must not exceed ${MAX_SHORT_LENGTH} characters.`,
      'any.required': 'Target audience is required.',
    }),

  key_details: Joi.string()
    .trim()
    .min(1)
    .max(MAX_LONG_LENGTH)
    .messages({
      'string.empty': 'Key details cannot be empty.',
      'string.max': `Key details must not exceed ${MAX_LONG_LENGTH} characters.`,
      'any.required': 'Key details are required.',
    }),
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Schemas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * POST /api/campaigns — Create Campaign.
 * All six content fields are required.
 */
const createCampaignSchema = Joi.object({
  campaign_name: fields.campaign_name.required(),
  purpose: fields.purpose.required(),
  script_guidelines: fields.script_guidelines.optional(),
  product_description: fields.product_description.required(),
  target_audience: fields.target_audience.required(),
  key_details: fields.key_details.required(),
}).options({ stripUnknown: true });

/**
 * PUT /api/campaigns/:id — Update Campaign (draft only).
 * All content fields are optional individually; at least one must be present.
 * Status is NOT settable via this endpoint — lifecycle is via /start and /pause.
 */
const updateCampaignSchema = Joi.object({
  campaign_name: fields.campaign_name.optional(),
  purpose: fields.purpose.optional(),
  script_guidelines: fields.script_guidelines.optional(),
  product_description: fields.product_description.optional(),
  target_audience: fields.target_audience.optional(),
  key_details: fields.key_details.optional(),
})
  .min(1)
  .options({ stripUnknown: true })
  .messages({
    'object.min': 'Update body must contain at least one field to update.',
  });

module.exports = {
  createCampaignSchema,
  updateCampaignSchema,
  DEFAULT_RETRY_LIMIT,
};

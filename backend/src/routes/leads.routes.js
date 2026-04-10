/**
 * @file backend/src/routes/leads.routes.js
 * @description Lead ingestion routes (MOD-04).
 *
 * Mounts:
 *   POST /api/campaigns/:id/upload  →  verifyToken → multer → uploadLeads
 *
 * Multer configuration:
 *   - Memory storage (no disk writes — security best practice).
 *   - Single file field: "contacts".
 *   - Max file size: 2 MB.
 *   - MIME type filter: only text/csv and application/vnd.ms-excel accepted.
 *
 * Note: This router is mounted on `/api/campaigns` in index.js alongside
 * the campaign routes. Since Express merges routers at the same prefix,
 * both `campaigns.routes.js` and `leads.routes.js` coexist cleanly.
 */

const { Router } = require('express');
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const { uploadLeads, listLeads } = require('../controllers/lead.controller');

const router = Router();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Multer Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Accepted MIME types for CSV files. */
const ALLOWED_MIMETYPES = [
  'text/csv',
  'application/vnd.ms-excel',       // Some systems send CSV as this.
  'application/csv',                // Alternative MIME type.
  'text/plain',                     // Fallback — some clients use this for .csv.
];

const upload = multer({
  storage: multer.memoryStorage(), // Store in memory — no disk path injection.
  limits: {
    fileSize: 2 * 1024 * 1024,    // 2 MB max.
    files: 1,                     // Only one file per request.
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only CSV files are accepted.`), false);
    }
  },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Multer Error Handler Middleware
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * handleMulterError — Catches multer-specific errors (file too large,
 * wrong MIME type, etc.) and returns clean 400 responses instead of
 * letting them bubble to the global error handler.
 */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'File size exceeds the 2 MB limit.',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Unexpected file field. Use "contacts" as the field name.',
      });
    }
    return res.status(400).json({
      error: 'Bad Request',
      message: `Upload error: ${err.message}`,
    });
  }

  // Non-multer errors from the fileFilter callback.
  if (err) {
    return res.status(400).json({
      error: 'Bad Request',
      message: err.message,
    });
  }

  return next();
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Route
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// POST /api/campaigns/:id/upload
// Auth → Multer (memory, 2MB, CSV only) → Error handler → Controller
router.post(
  '/:id/upload',
  verifyToken,
  upload.single('contacts'),
  handleMulterError,
  uploadLeads
);

// GET /api/campaigns/:id/leads
router.get('/:id/leads', verifyToken, listLeads);

module.exports = router;

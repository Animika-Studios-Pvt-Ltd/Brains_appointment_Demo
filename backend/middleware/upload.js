// backend/middleware/upload.js
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinaryConfig');

// Cloudinary storage for patient avatars
const patientStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'patients/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }],
    public_id: (req, file) => `patient_${Date.now()}`,
  },
});


function imageFilter(_req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (!allowed.includes(file.mimetype)) {
    const err = new Error('Only image files allowed');
    err.name = 'MulterError';
    return cb(err, false);
  }
  cb(null, true);
}

const uploadPatientAvatar = multer({
  storage: patientStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

module.exports = { uploadPatientAvatar };

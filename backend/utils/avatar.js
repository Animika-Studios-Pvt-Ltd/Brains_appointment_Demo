const cloudinary = require('../config/cloudinaryConfig');

function generateInitialsAvatar(name) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return 'https://ui-avatars.com/api/?name=U&background=random&color=fff&size=500';
  }
  const initials = name.trim().split(' ').filter(n => n.length > 0).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=random&color=fff&size=500&bold=true`;
}

/**
 * Determine best profile image based on priority
 * (Preserved for compatibility/legacy references)
 */
function getBestProfileImage({ current, google, name }) {
  if (current && (current.includes('cloudinary.com') || current.includes('res.cloudinary.com'))) {
    return current;
  }
  if (google && google.startsWith('http')) {
    return google;
  }
  if (current && current.startsWith('http') && !current.includes('ui-avatars.com')) {
    return current;
  }
  return generateInitialsAvatar(name);
}

/**
 * Assures a profile image is uploaded to Cloudinary.
 * If empty, generates an initials-based avatar, then uploads it to Cloudinary.
 * If it's already a Cloudinary URL, returns it directly.
 */
async function ensureCloudinaryAvatar(imageUrl, name, folder = 'healthapp/avatars') {
  let targetUrl = imageUrl;
  
  if (
    !targetUrl || 
    typeof targetUrl !== 'string' || 
    targetUrl.trim() === '' || 
    targetUrl.startsWith('/') || 
    targetUrl.includes('default-avatar.png')
  ) {
    targetUrl = generateInitialsAvatar(name);
  }

  // If already hosted on Cloudinary, return it directly
  if (targetUrl.includes('cloudinary.com') || targetUrl.includes('res.cloudinary.com')) {
    return targetUrl;
  }

  try {
    console.log(`[Cloudinary Avatar] Uploading remote image to Cloudinary: ${targetUrl}`);
    const result = await cloudinary.uploader.upload(targetUrl, {
      folder: folder,
      resource_type: 'image',
    });
    console.log(`[Cloudinary Avatar] Upload success: ${result.secure_url}`);
    return result.secure_url;
  } catch (error) {
    console.error(`[Cloudinary Avatar] Upload failed for ${targetUrl}:`, error.message);
    // Fall back to targetUrl to prevent blocking user actions
    return targetUrl;
  }
}

/**
 * Registers Mongoose hooks on a schema to enforce Cloudinary-only avatars
 */
function registerCloudinaryAvatarHooks(schema, folder) {
  // Pre-save hook: runs on doc.save() and Model.create()
  schema.pre('save', async function(next) {
    try {
      const needsUpload = !this.profileImage || 
                          this.profileImage === '' || 
                          this.profileImage.startsWith('/') || 
                          this.profileImage.includes('default-avatar.png') || 
                          (!this.profileImage.includes('cloudinary.com') && !this.profileImage.includes('res.cloudinary.com'));

      if (needsUpload || this.isModified('profileImage')) {
        this.profileImage = await ensureCloudinaryAvatar(this.profileImage, this.name, folder);
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  // Pre-update hook: runs on findOneAndUpdate, findByIdAndUpdate, updateOne, etc.
  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], async function(next) {
    try {
      const update = this.getUpdate();
      if (!update) return next();

      let profileImage;
      let hasProfileImage = false;

      if (typeof update.profileImage !== 'undefined') {
        profileImage = update.profileImage;
        hasProfileImage = true;
      } else if (update.$set && typeof update.$set.profileImage !== 'undefined') {
        profileImage = update.$set.profileImage;
        hasProfileImage = true;
      }

      if (hasProfileImage) {
        const needsUpload = !profileImage || 
                            profileImage === '' || 
                            profileImage.startsWith('/') || 
                            profileImage.includes('default-avatar.png') || 
                            (!profileImage.includes('cloudinary.com') && !profileImage.includes('res.cloudinary.com'));

        if (needsUpload) {
          let name = '';
          if (update.name) name = update.name;
          else if (update.$set && update.$set.name) name = update.$set.name;

          const newUrl = await ensureCloudinaryAvatar(profileImage, name, folder);
          
          if (typeof update.profileImage !== 'undefined') {
            update.profileImage = newUrl;
          }
          if (update.$set && typeof update.$set.profileImage !== 'undefined') {
            update.$set.profileImage = newUrl;
          }
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  getBestProfileImage,
  generateInitialsAvatar,
  ensureCloudinaryAvatar,
  registerCloudinaryAvatarHooks
};

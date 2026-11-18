const BACKEND = (import.meta.env.VITE_BACKEND_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);

/** Fallback when no image path — never relies on missing /avatar-placeholder.png */
export function initialsAvatarUrl(name = "User", size = 400) {
  const label = String(name || "User").trim() || "User";
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    initials
  )}&background=134e97&color=fff&size=${size}&bold=true`;
}

/**
 * Resolve profile/doctor image for <img src>.
 * Supports Cloudinary, ui-avatars, and backend /uploads paths.
 */
export function getImageUrl(path, fallbackName = "User") {
  const p = typeof path === "string" ? path.trim() : "";
  if (!p) return initialsAvatarUrl(fallbackName);
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith("//")) return `https:${p}`;
  const normalized = p.startsWith("/") ? p : `/${p}`;
  return `${BACKEND}${normalized}`;
}

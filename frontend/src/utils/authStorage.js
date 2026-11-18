/** Fired after `patchStoredUser` updates `localStorage.user` (same-tab; `storage` only fires cross-tab). */
export const USER_STORAGE_UPDATED = "brains:user-storage-updated";

export function parseStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

/**
 * Merge fields into `localStorage.user` and notify listeners (e.g. Header).
 * @param {Record<string, unknown>} partial
 */
export function patchStoredUser(partial) {
  if (!partial || typeof partial !== "object") return;
  const delta = Object.fromEntries(
    Object.entries(partial).filter(([, v]) => v !== undefined && v !== null)
  );
  if (Object.keys(delta).length === 0) return;
  const prev = parseStoredUser() || {};
  const next = { ...prev, ...delta };
  localStorage.setItem("user", JSON.stringify(next));
  window.dispatchEvent(new Event(USER_STORAGE_UPDATED));
}

/** Call after replacing `localStorage.user` without using `patchStoredUser`. */
export function notifyUserStorageUpdated() {
  window.dispatchEvent(new Event(USER_STORAGE_UPDATED));
}

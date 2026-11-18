// backend/middleware/requireFields.js
module.exports = function requireFields(required = []) {
    // required: array of field names (top-level only) or dot paths (e.g. 'emergencyContact.name')
    return (req, res, next) => {
        if (!Array.isArray(required) || required.length === 0) return next();

        const missing = [];

        for (const key of required) {
            const parts = String(key).split('.');
            let cur = req.body;

            // If body is undefined (e.g. content-type not JSON) treat as missing
            if (cur == null) {
                missing.push(key);
                continue;
            }

            for (let i = 0; i < parts.length; i++) {
                const p = parts[i];
                if (cur == null || typeof cur !== 'object' || !(p in cur)) {
                    cur = undefined;
                    break;
                }
                cur = cur[p];
            }

            // consider empty string, null, undefined as missing
            const isEmpty =
                cur === undefined ||
                cur === null ||
                (typeof cur === 'string' && cur.trim() === '') ||
                (Array.isArray(cur) && cur.length === 0);

            if (isEmpty) missing.push(key);
        }

        if (missing.length > 0) {
            // one friendly message, plus list of missing fields
            const label = missing.length === 1 ? 'field' : 'fields';
            return res.status(400).json({
                status: 'error',
                // human-friendly text for frontend snackbars/Swal
                message: `Please fill the required ${label}: ${missing.join(', ')}`,
                missingFields: missing,
            });
        }

        return next();
    };
};

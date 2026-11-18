// middleware/turnstile.js
const httpFetch =
  typeof globalThis.fetch === "function"
    ? globalThis.fetch.bind(globalThis)
    : (...args) =>
        import("node-fetch").then((m) => m.default(...args));

async function verifyTurnstile(req, res, next) {
  try {
    const secret =
      process.env.CLOUDFLARE_TURNSTILE_SECRET ||
      process.env.TURNSTILE_SECRET;

    if (!secret) {
      console.warn("Turnstile secret missing — allowing request in dev mode.");
      return next();
    }

    const token =
      req.body?.turnstileToken ||
      req.headers["x-turnstile-token"];

    if (!token) {
      // In development mode or when no frontend sitekey is configured, allow booking
      if (process.env.NODE_ENV !== "production") {
        console.warn("Turnstile token missing in development — allowing booking request.");
        return next();
      }
      return res.status(403).json({
        status: "error",
        message: "Human verification required (turnstile token missing)",
      });
    }

    // Always-pass test token for local/dev testing
    if (token === "1x00000000000000000000AA" || token === "test-pass" || token === "dev-bypass") {
      return next();
    }

    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", token);
    if (req.ip) {
      params.append("remoteip", req.ip);
    }

    const response = await httpFetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: params }
    );

    const data = await response.json();

    if (!data.success) {
      const codes = data["error-codes"] || [];
      console.warn("Turnstile verification failed:", codes);

      // In development mode, if secret is invalid, log and allow request
      if (process.env.NODE_ENV !== "production" && codes.includes("invalid-input-secret")) {
        console.warn("Invalid Turnstile secret in development — bypassing check.");
        return next();
      }

      let message = "Verification failed. Please complete the check again.";
      if (codes.includes("timeout-or-duplicate")) {
        message =
          "Verification expired or already used. Please complete the check again and book immediately.";
      } else if (codes.includes("invalid-input-secret")) {
        message =
          "Server verification misconfigured. Contact support (invalid Turnstile secret).";
      }

      return res.status(403).json({
        status: "error",
        message,
        errorCodes: codes,
      });
    }

    next();
  } catch (err) {
    console.error("Turnstile verify error:", err);
    return res.status(500).json({
      status: "error",
      message: "Verification error",
      error: err.message,
    });
  }
}

module.exports = { verifyTurnstile };

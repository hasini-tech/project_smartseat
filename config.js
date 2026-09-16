const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET || "smartseat-development-secret-change-me";

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured in production");
}

module.exports = {
  authCookieName: process.env.AUTH_COOKIE_NAME || "smartseat_token",
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  isProduction,
  defaultTenantName: process.env.DEFAULT_TENANT_NAME || "ABC COLLEGE",
};

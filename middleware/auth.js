const jwt = require("jsonwebtoken");
const Staff = require("../models/Staff");
const { authCookieName, jwtSecret } = require("../config");

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  const item = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function getToken(req) {
  const authorization = req.headers.authorization || "";
  if (authorization.startsWith("Bearer ")) return authorization.slice(7);
  return readCookie(req, authCookieName);
}

async function requireAuth(req, res, next) {
  let token;
  try {
    token = getToken(req);
  } catch (err) {
    return res.status(401).json({ error: "Invalid session cookie" });
  }
  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    const payload = jwt.verify(token, jwtSecret);
    const staff = await Staff.findById(payload.sub).populate("department", "name").lean();
    if (!staff || !staff.isActive || String(staff.tenant) !== String(payload.tenantId)) {
      return res.status(401).json({ error: "Your session is no longer valid" });
    }

    req.auth = {
      staffId: String(staff._id),
      staffName: staff.staffName,
      tenantId: String(staff.tenant),
      departmentId: String(staff.department._id),
      departmentName: staff.department.name,
      role: staff.role,
      isTenantAdmin: staff.role === "tenant_admin",
    };
    req.staff = staff;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action" });
    }
    next();
  };
}

function tenantScope(req, extra = {}) {
  return { tenant: req.auth.tenantId, ...extra };
}

function departmentScope(req, extra = {}) {
  if (req.auth.isTenantAdmin) return tenantScope(req, extra);
  return tenantScope(req, { department: req.auth.departmentId, ...extra });
}

module.exports = { requireAuth, requireRole, tenantScope, departmentScope };

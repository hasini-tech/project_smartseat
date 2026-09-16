const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Tenant = require("../models/Tenant");
const Department = require("../models/Department");
const Staff = require("../models/Staff");
const { authCookieName, jwtSecret, jwtExpiresIn, isProduction } = require("../config");
const { requireAuth } = require("../middleware/auth");
const { normalizeName, getOrCreateTenant, getOrCreateDepartment } = require("../services/tenancy");

const router = express.Router();
const passwordRounds = 12;
const authCookieMaxAge = 8 * 60 * 60;

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validateCredentials({ staffName, departmentName, organizationName, password, confirmPassword }, isRegistration) {
  if (!clean(staffName) || !clean(departmentName) || !clean(organizationName) || !password) {
    return "Organization, staff name, department, and password are required";
  }
  if (isRegistration && password !== confirmPassword) return "Password and confirm password must match";
  if (password.length < 8) return "Password must be at least 8 characters long";
  if (clean(staffName).length > 100 || clean(departmentName).length > 100 || clean(organizationName).length > 120) {
    return "Organization, staff name, and department must be within the allowed length";
  }
  return null;
}

function publicStaff(staff) {
  const department = staff.department && staff.department.name ? staff.department : null;
  return {
    id: String(staff._id),
    staffName: staff.staffName,
    departmentName: department ? department.name : staff.departmentName,
    tenantId: String(staff.tenant),
    organizationName: staff.tenantName,
    role: staff.role,
  };
}

function issueSession(res, staff) {
  const token = jwt.sign(
    {
      tenantId: String(staff.tenant),
      departmentId: String(staff.department._id || staff.department),
      role: staff.role,
    },
    jwtSecret,
    { subject: String(staff._id), expiresIn: jwtExpiresIn }
  );

  const cookie = [
    `${authCookieName}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${authCookieMaxAge}`,
  ];
  if (isProduction) cookie.push("Secure");
  res.setHeader("Set-Cookie", cookie.join("; "));
}

router.post("/register", async (req, res) => {
  try {
    const { organizationName, staffName, departmentName, password, confirmPassword } = req.body || {};
    const validationError = validateCredentials(req.body || {}, true);
    if (validationError) return res.status(400).json({ error: validationError });

    const tenant = await getOrCreateTenant(organizationName);
    if (!tenant.isActive) return res.status(403).json({ error: "This organization is inactive" });

    const department = await getOrCreateDepartment(tenant._id, departmentName);
    const normalizedStaffName = normalizeName(staffName);
    const existing = await Staff.exists({ tenant: tenant._id, department: department._id, normalizedStaffName });
    if (existing) return res.status(409).json({ error: "A staff account with these details already exists" });

    const staffCount = await Staff.countDocuments({ tenant: tenant._id });
    const passwordHash = await bcrypt.hash(password, passwordRounds);
    const staff = await Staff.create({
      tenant: tenant._id,
      department: department._id,
      staffName: clean(staffName),
      normalizedStaffName,
      passwordHash,
      role: staffCount === 0 ? "tenant_admin" : "staff",
    });

    staff.department = department;
    staff.tenant = tenant._id;
    issueSession(res, staff);
    res.status(201).json({ staff: { ...publicStaff(staff), organizationName: tenant.name } });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "A matching staff account or organization already exists" });
    res.status(500).json({ error: "Could not create staff account" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { organizationName, staffName, departmentName, password } = req.body || {};
    const validationError = validateCredentials(req.body || {}, false);
    if (validationError) return res.status(400).json({ error: validationError });

    const tenant = await Tenant.findOne({ normalizedName: normalizeName(organizationName), isActive: true });
    if (!tenant) return res.status(401).json({ error: "Invalid organization, staff name, department, or password" });

    const department = await Department.findOne({
      tenant: tenant._id,
      normalizedName: normalizeName(departmentName),
      isActive: true,
    });
    if (!department) return res.status(401).json({ error: "Invalid organization, staff name, department, or password" });
    const staff = await Staff.findOne({
      tenant: tenant._id,
      department: department._id,
      normalizedStaffName: normalizeName(staffName),
      isActive: true,
    }).select("+passwordHash").populate("department", "name");

    if (!staff || !(await bcrypt.compare(password, staff.passwordHash))) {
      return res.status(401).json({ error: "Invalid organization, staff name, department, or password" });
    }

    staff.lastLoginAt = new Date();
    await staff.save();
    issueSession(res, staff);
    res.json({ staff: { ...publicStaff(staff), organizationName: tenant.name } });
  } catch (err) {
    res.status(500).json({ error: "Could not sign in" });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({
    staff: {
      id: req.auth.staffId,
      staffName: req.auth.staffName,
      departmentName: req.auth.departmentName,
      tenantId: req.auth.tenantId,
      role: req.auth.role,
    },
  });
});

router.post("/logout", (req, res) => {
  const cookie = [`${authCookieName}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (isProduction) cookie.push("Secure");
  res.setHeader("Set-Cookie", cookie.join("; "));
  res.json({ ok: true });
});

module.exports = router;

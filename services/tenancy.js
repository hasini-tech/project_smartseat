const Tenant = require("../models/Tenant");
const Department = require("../models/Department");
const Student = require("../models/Student");
const Hall = require("../models/Hall");
const Exam = require("../models/Exam");
const Seating = require("../models/Seat");
const { defaultTenantName } = require("../config");

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function slugify(value) {
  return normalizeName(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "smartseat";
}

async function getOrCreateTenant(name) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const normalizedName = normalizeName(cleanName);
  if (!normalizedName) throw new Error("Organization name is required");

  let tenant = await Tenant.findOne({ normalizedName });
  if (tenant) return tenant;

  const baseSlug = slugify(cleanName);
  let slug = baseSlug;
  let suffix = 2;
  while (await Tenant.exists({ slug })) slug = `${baseSlug}-${suffix++}`;

  try {
    tenant = await Tenant.create({ name: cleanName, normalizedName, slug });
    return tenant;
  } catch (err) {
    if (err.code === 11000) return Tenant.findOne({ normalizedName });
    throw err;
  }
}

async function getOrCreateDepartment(tenantId, name) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const normalizedName = normalizeName(cleanName);
  if (!normalizedName) throw new Error("Department name is required");

  try {
    return await Department.findOneAndUpdate(
      { tenant: tenantId, normalizedName },
      { $setOnInsert: { tenant: tenantId, name: cleanName, normalizedName } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code === 11000) return Department.findOne({ tenant: tenantId, normalizedName });
    throw err;
  }
}

async function migrateLegacyData() {
  const tenant = await getOrCreateTenant(defaultTenantName);
  const departmentNames = await Student.distinct("dept", { dept: { $exists: true, $nin: [null, ""] } });
  if (departmentNames.length === 0) departmentNames.push("General");

  const departments = new Map();
  for (const name of departmentNames) {
    const department = await getOrCreateDepartment(tenant._id, name);
    departments.set(normalizeName(name), department);
  }

  const legacyStudents = await Student.find({ $or: [{ tenant: { $exists: false } }, { department: { $exists: false } }] }).select("dept").lean();
  for (const student of legacyStudents) {
    const department = departments.get(normalizeName(student.dept)) || departments.get("general");
    await Student.updateOne({ _id: student._id }, { $set: { tenant: tenant._id, department: department._id } });
  }

  const generalDepartment = departments.get("general") || departments.values().next().value;
  await Student.updateMany({ tenant: { $exists: false } }, { $set: { tenant: tenant._id, department: generalDepartment._id } });
  await Hall.updateMany({ tenant: { $exists: false } }, { $set: { tenant: tenant._id } });
  await Exam.updateMany(
    { $or: [{ tenant: { $exists: false } }, { department: { $exists: false } }] },
    { $set: { tenant: tenant._id, department: generalDepartment._id } }
  );
  await Seating.updateMany({ tenant: { $exists: false } }, { $set: { tenant: tenant._id } });
  const legacySeating = await Seating.find({ department: { $exists: false } }).populate("exam", "department").lean();
  for (const seating of legacySeating) {
    await Seating.updateOne(
      { _id: seating._id },
      { $set: { tenant: seating.tenant || tenant._id, department: seating.exam?.department || generalDepartment._id } }
    );
  }

  return tenant;
}

module.exports = { normalizeName, slugify, getOrCreateTenant, getOrCreateDepartment, migrateLegacyData };

const express = require("express");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const Student = require("../models/Student");
const { departmentScope } = require("../middleware/auth");
const { getOrCreateDepartment } = require("../services/tenancy");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveDepartment(req, name) {
  if (!req.auth.isTenantAdmin) {
    return { _id: req.auth.departmentId, name: req.auth.departmentName };
  }
  if (!name || !String(name).trim()) throw new Error("Department is required");
  return getOrCreateDepartment(req.auth.tenantId, name);
}

function studentFields(body) {
  return {
    rollNo: String(body.rollNo || "").trim(),
    name: String(body.name || "").trim(),
    class: String(body.class || "").trim(),
    dept: String(body.dept || body.department || "").trim(),
  };
}

// GET students belonging to the current tenant and, for regular staff, department.
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    const query = departmentScope(req);
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      query.$or = [{ rollNo: pattern }, { name: pattern }];
    }
    const students = await Student.find(query).sort({ class: 1, rollNo: 1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: "Could not load students" });
  }
});

// POST single student. Regular staff can only add students to their own department.
router.post("/", async (req, res) => {
  try {
    const fields = studentFields(req.body || {});
    const department = await resolveDepartment(req, fields.dept);
    if (!fields.rollNo || !fields.name || !fields.class) {
      return res.status(400).json({ error: "Roll number, name, class, and department are required" });
    }

    const student = await Student.create({
      ...fields,
      dept: department.name,
      tenant: req.auth.tenantId,
      department: department._id,
    });
    res.status(201).json(student);
  } catch (err) {
    res.status(400).json({ error: err.code === 11000 ? "That roll number already exists in this organization" : err.message });
  }
});

// POST bulk CSV import - expects columns: rollNo,name,class,dept
router.post("/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const records = parse(req.file.buffer.toString("utf-8"), {
      columns: (header) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
    });
    if (records.length === 0) return res.status(400).json({ error: "CSV had no rows" });

    const ops = [];
    for (const record of records) {
      const fields = studentFields({
        rollNo: record.rollno || record.roll_no || record["roll no"],
        name: record.name,
        class: record.class,
        dept: record.dept || record.department,
      });
      const department = await resolveDepartment(req, fields.dept);
      if (!fields.rollNo || !fields.name || !fields.class) continue;

      const filter = { tenant: req.auth.tenantId, rollNo: fields.rollNo };
      if (!req.auth.isTenantAdmin) filter.department = req.auth.departmentId;
      ops.push({
        updateOne: {
          filter,
          update: {
            $set: { ...fields, dept: department.name, department: department._id },
            $setOnInsert: { tenant: req.auth.tenantId },
          },
          upsert: true,
        },
      });
    }

    if (ops.length === 0) return res.status(400).json({ error: "CSV had no valid rows" });
    const result = await Student.bulkWrite(ops);
    res.json({ imported: ops.length, inserted: result.upsertedCount, updated: result.modifiedCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update student within the current tenant/department scope.
router.put("/:id", async (req, res) => {
  try {
    const current = await Student.findOne({ _id: req.params.id, ...departmentScope(req) });
    if (!current) return res.status(404).json({ error: "Student not found" });

    const fields = studentFields({ ...current.toObject(), ...req.body });
    const department = await resolveDepartment(req, fields.dept);
    const student = await Student.findByIdAndUpdate(
      current._id,
      { $set: { ...fields, dept: department.name, department: department._id } },
      { new: true, runValidators: true }
    );
    res.json(student);
  } catch (err) {
    res.status(400).json({ error: err.code === 11000 ? "That roll number already exists in this organization" : err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const result = await Student.deleteOne({ _id: req.params.id, ...departmentScope(req) });
    if (!result.deletedCount) return res.status(404).json({ error: "Student not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "Could not remove student" });
  }
});

module.exports = router;

const express = require("express");
const Exam = require("../models/Exam");
const Hall = require("../models/Hall");
const Student = require("../models/Student");
const Seating = require("../models/Seat");
const { generateSeating } = require("../services/allocator");
const { departmentScope, tenantScope, requireRole } = require("../middleware/auth");
const { getOrCreateDepartment } = require("../services/tenancy");

const router = express.Router();

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveExamDepartment(req, departmentName) {
  if (!req.auth.isTenantAdmin) {
    return { _id: req.auth.departmentId, name: req.auth.departmentName };
  }
  return getOrCreateDepartment(req.auth.tenantId, departmentName || req.auth.departmentName);
}

function examScope(req) {
  return departmentScope(req);
}

async function getExam(req, id) {
  return Exam.findOne({ _id: id, ...examScope(req) }).populate({
    path: "hallIds",
    match: { tenant: req.auth.tenantId },
  });
}

async function getTenantHalls(req, hallIds) {
  const ids = Array.isArray(hallIds) ? hallIds : [];
  const halls = await Hall.find({ _id: { $in: ids }, ...tenantScope(req) });
  if (halls.length !== ids.length) throw new Error("One or more selected halls are not in your organization");
  return halls;
}

// ---- Exam CRUD ----
router.get("/", async (req, res) => {
  try {
    const exams = await Exam.find(examScope(req)).populate({ path: "hallIds", match: { tenant: req.auth.tenantId } }).sort({ createdAt: -1 });
    res.json(exams);
  } catch (err) {
    res.status(500).json({ error: "Could not load exams" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const exam = await getExam(req, req.params.id);
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    res.json(exam);
  } catch (err) {
    res.status(400).json({ error: "Invalid exam" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, subject, date, startTime, endTime, college, departmentName } = req.body || {};
    const department = await resolveExamDepartment(req, departmentName);
    const exam = await Exam.create({
      tenant: req.auth.tenantId,
      department: department._id,
      name,
      subject,
      date,
      startTime,
      endTime,
      college,
    });
    res.status(201).json(exam);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const exam = await getExam(req, req.params.id);
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    const update = {};
    for (const field of ["name", "subject", "date", "startTime", "endTime", "college", "status"]) {
      if (req.body[field] !== undefined) update[field] = req.body[field];
    }

    if (req.body.hallIds !== undefined) {
      const halls = await getTenantHalls(req, req.body.hallIds);
      update.hallIds = halls.map((hall) => hall._id);
    }
    if (req.auth.isTenantAdmin && req.body.departmentName) {
      const department = await resolveExamDepartment(req, req.body.departmentName);
      update.department = department._id;
    }

    const updated = await Exam.findOneAndUpdate(
      { _id: exam._id, ...examScope(req) },
      { $set: update },
      { new: true, runValidators: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requireRole("tenant_admin"), async (req, res) => {
  try {
    const exam = await Exam.findOneAndDelete({ _id: req.params.id, ...tenantScope(req) });
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    await Seating.deleteMany({ exam: exam._id, ...tenantScope(req) });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "Could not delete exam" });
  }
});

// ---- Generate seating for an exam ----
router.post("/:id/generate", async (req, res) => {
  try {
    const exam = await getExam(req, req.params.id);
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    if (!exam.hallIds || exam.hallIds.length === 0) {
      return res.status(400).json({ error: "Assign at least one hall to this exam first" });
    }

    const halls = await getTenantHalls(req, exam.hallIds.map((hall) => hall._id));
    // Tenant administrators retain the original SmartSeat behavior and can
    // allocate every student in their organization. Regular staff remain
    // restricted to their own department.
    const studentScope = req.auth.isTenantAdmin
      ? { tenant: req.auth.tenantId }
      : { tenant: req.auth.tenantId, department: req.auth.departmentId };
    const { studentIds } = req.body || {};
    if (studentIds && studentIds.length) studentScope._id = { $in: studentIds };
    const students = await Student.find(studentScope);

    if (students.length === 0) {
      return res.status(400).json({ error: "No students to seat in this department. Import students first." });
    }

    const result = generateSeating(students, halls);
    await Seating.deleteMany({ exam: exam._id, ...tenantScope(req) });
    const docs = result.perHall.map((hall) => ({
      tenant: req.auth.tenantId,
      department: exam.department,
      exam: exam._id,
      hall: hall.hallId,
      hallName: hall.hallName,
      rows: hall.rows,
      columns: hall.columns,
      grid: hall.grid,
      seatedCount: hall.seatedCount,
    }));
    await Seating.insertMany(docs);

    exam.status = "generated";
    await exam.save();

    res.json({
      totalStudents: result.totalStudents,
      totalCapacity: result.totalCapacity,
      unseatedCount: result.unseated.length,
      halls: docs.map((hall) => ({ hallName: hall.hallName, capacity: hall.rows * hall.columns, seated: hall.seatedCount })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- View seating for an exam (all halls) ----
router.get("/:id/seating", async (req, res) => {
  try {
    const exam = await getExam(req, req.params.id);
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    const seating = await Seating.find({ exam: exam._id, ...tenantScope(req) }).sort({ hallName: 1 });
    res.json(seating);
  } catch (err) {
    res.status(400).json({ error: "Could not load seating" });
  }
});

// ---- Search a student's seat within an exam ----
router.get("/:id/search", async (req, res) => {
  try {
    const { rollNo } = req.query;
    if (!rollNo) return res.status(400).json({ error: "rollNo query param required" });
    const exam = await getExam(req, req.params.id);
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    const student = await Student.findOne({
      tenant: req.auth.tenantId,
      ...(req.auth.isTenantAdmin ? {} : { department: req.auth.departmentId }),
      rollNo: new RegExp(`^${escapeRegex(rollNo)}$`, "i"),
    });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const seatingDocs = await Seating.find({ exam: exam._id, ...tenantScope(req) });
    for (const doc of seatingDocs) {
      const cell = doc.grid.find((seat) => seat.rollNo === student.rollNo);
      if (cell) {
        return res.json({ student, hallName: doc.hallName, row: cell.row, col: cell.col, seatLabel: cell.seatLabel });
      }
    }
    res.status(404).json({ error: "Student has no seat allocated for this exam" });
  } catch (err) {
    res.status(500).json({ error: "Could not search seating" });
  }
});

module.exports = router;

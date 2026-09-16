require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const authRoutes = require("./routes/auth");
const studentRoutes = require("./routes/students");
const hallRoutes = require("./routes/halls");
const examRoutes = require("./routes/exams");
const { requireAuth } = require("./middleware/auth");
const { migrateLegacyData } = require("./services/tenancy");
const Student = require("./models/Student");
const Hall = require("./models/Hall");
const Exam = require("./models/Exam");
const Seating = require("./models/Seat");
const Tenant = require("./models/Tenant");
const Department = require("./models/Department");
const Staff = require("./models/Staff");

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Authentication is public only for registration, sign-in, and logout.
app.use("/api/auth", authRoutes);
app.use("/api", requireAuth);
app.use("/api/students", studentRoutes);
app.use("/api/halls", hallRoutes);
app.use("/api/exams", examRoutes);

// simple dashboard stats
app.get("/api/dashboard", async (req, res) => {
  try {
    const tenantFilter = { tenant: req.auth.tenantId };
    const departmentFilter = req.auth.isTenantAdmin
      ? tenantFilter
      : { ...tenantFilter, department: req.auth.departmentId };

    const totalStudents = await Student.countDocuments(departmentFilter);
    const halls = await Hall.find(tenantFilter);
    const totalHalls = halls.length;
    const totalSeats = halls.reduce((s, h) => s + h.rows * h.columns, 0);
    const totalExams = await Exam.countDocuments(departmentFilter);

    const latestExam = await Exam.findOne({ ...departmentFilter, status: "generated" }).sort({ updatedAt: -1 });
    let allocated = 0;
    let hallUtilization = [];
    if (latestExam) {
      const seatingDocs = await Seating.find({ ...tenantFilter, exam: latestExam._id });
      allocated = seatingDocs.reduce((s, d) => s + d.seatedCount, 0);
      hallUtilization = seatingDocs.map((d) => ({
        hallName: d.hallName,
        percent: Math.round((d.seatedCount / (d.rows * d.columns)) * 100),
      }));
    }

    res.json({
      totalStudents,
      totalHalls,
      totalSeats,
      totalExams,
      allocated,
      remaining: Math.max(totalStudents - allocated, 0),
      latestExam: latestExam ? { id: latestExam._id, name: latestExam.name } : null,
      hallUtilization,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
// Support both the documented name and the name used by the Atlas-generated .env file.
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/smartseat";

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    await migrateLegacyData();
    // Replace the old global roll-number and hall-name indexes with tenant-scoped indexes.
    await Promise.all([
      Tenant.syncIndexes(),
      Department.syncIndexes(),
      Staff.syncIndexes(),
      Student.syncIndexes(),
      Hall.syncIndexes(),
      Exam.syncIndexes(),
      Seating.syncIndexes(),
    ]);
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`SmartSeat server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

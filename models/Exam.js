const mongoose = require("mongoose");

const ExamSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    name: { type: String, required: true, trim: true }, // e.g. Cycle Test - I
    subject: { type: String, required: true, trim: true },
    date: { type: String, required: true }, // yyyy-mm-dd
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    college: { type: String, default: "ABC COLLEGE" },
    // rules chosen for the seating generation
    rules: {
      noSameClassAdjacent: { type: Boolean, default: true },
      alternateDeptSameRow: { type: Boolean, default: true },
      gapAfterSameClass: { type: Boolean, default: true },
      balanceAcrossHalls: { type: Boolean, default: true },
    },
    hallIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Hall" }],
    status: {
      type: String,
      enum: ["draft", "generated"],
      default: "draft",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Exam", ExamSchema);

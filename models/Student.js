const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    rollNo: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    class: { type: String, required: true, trim: true }, // e.g. CSE-A
    dept: { type: String, required: true, trim: true }, // e.g. CSE
  },
  { timestamps: true }
);

StudentSchema.index({ tenant: 1, rollNo: 1 }, { unique: true });

module.exports = mongoose.model("Student", StudentSchema);

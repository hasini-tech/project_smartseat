const mongoose = require("mongoose");

const StaffSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    staffName: { type: String, required: true, trim: true },
    normalizedStaffName: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["staff", "tenant_admin"], default: "staff" },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

StaffSchema.index({ tenant: 1, department: 1, normalizedStaffName: 1 }, { unique: true });

module.exports = mongoose.model("Staff", StaffSchema);

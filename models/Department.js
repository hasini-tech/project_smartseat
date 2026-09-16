const mongoose = require("mongoose");

const DepartmentSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DepartmentSchema.index({ tenant: 1, normalizedName: 1 }, { unique: true });

module.exports = mongoose.model("Department", DepartmentSchema);

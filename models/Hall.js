const mongoose = require("mongoose");

const HallSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true }, // e.g. Hall 101
    rows: { type: Number, required: true, min: 1 },
    columns: { type: Number, required: true, min: 1 }, // = number of benches/desks per row
  },
  { timestamps: true }
);

HallSchema.index({ tenant: 1, name: 1 }, { unique: true });

// capacity is always derived, never stored, so it can never drift out of sync
HallSchema.virtual("capacity").get(function () {
  return this.rows * this.columns;
});
HallSchema.set("toJSON", { virtuals: true });
HallSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Hall", HallSchema);

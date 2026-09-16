const mongoose = require("mongoose");

// One cell in a hall's seating grid
const SeatCellSchema = new mongoose.Schema(
  {
    row: { type: Number, required: true }, // 1-indexed
    col: { type: Number, required: true }, // 1-indexed
    seatLabel: { type: String, required: true }, // e.g. A1, B3
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null },
    rollNo: { type: String, default: null },
    name: { type: String, default: null },
    class: { type: String, default: null },
    dept: { type: String, default: null },
    empty: { type: Boolean, default: true },
  },
  { _id: false }
);

const SeatingSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    hall: { type: mongoose.Schema.Types.ObjectId, ref: "Hall", required: true },
    hallName: { type: String, required: true },
    rows: { type: Number, required: true },
    columns: { type: Number, required: true },
    grid: [SeatCellSchema],
    seatedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

SeatingSchema.index({ exam: 1, hall: 1 }, { unique: true });

module.exports = mongoose.model("Seating", SeatingSchema);

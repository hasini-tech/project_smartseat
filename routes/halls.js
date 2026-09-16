const express = require("express");
const Hall = require("../models/Hall");
const { tenantScope, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const halls = await Hall.find(tenantScope(req)).sort({ name: 1 });
    res.json(halls);
  } catch (err) {
    res.status(500).json({ error: "Could not load halls" });
  }
});

router.post("/", requireRole("tenant_admin"), async (req, res) => {
  try {
    const { name, rows, columns } = req.body || {};
    const hall = await Hall.create({
      tenant: req.auth.tenantId,
      name: String(name || "").trim(),
      rows,
      columns,
    });
    res.status(201).json(hall);
  } catch (err) {
    res.status(400).json({ error: err.code === 11000 ? "A hall with that name already exists" : err.message });
  }
});

router.put("/:id", requireRole("tenant_admin"), async (req, res) => {
  try {
    const { name, rows, columns } = req.body || {};
    const hall = await Hall.findOneAndUpdate(
      { _id: req.params.id, ...tenantScope(req) },
      { $set: { name: String(name || "").trim(), rows, columns } },
      { new: true, runValidators: true }
    );
    if (!hall) return res.status(404).json({ error: "Hall not found" });
    res.json(hall);
  } catch (err) {
    res.status(400).json({ error: err.code === 11000 ? "A hall with that name already exists" : err.message });
  }
});

router.delete("/:id", requireRole("tenant_admin"), async (req, res) => {
  try {
    const result = await Hall.deleteOne({ _id: req.params.id, ...tenantScope(req) });
    if (!result.deletedCount) return res.status(404).json({ error: "Hall not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "Could not remove hall" });
  }
});

module.exports = router;

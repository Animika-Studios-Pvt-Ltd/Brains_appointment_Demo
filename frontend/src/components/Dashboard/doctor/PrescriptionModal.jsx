// src/components/Dashboard/doctor/PrescriptionModal.jsx
import React, { useState, useEffect } from "react";
import { Button } from "../../ui/button";

export default function PrescriptionModal({
  isOpen,
  onClose,
  onSave,
  patientName = "",
  loading = false,
}) {
  const [prescription, setPrescription] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setPrescription("");
      setNotes("");
      setError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prescription.trim()) {
      setError("Please enter a prescription before saving.");
      return;
    }
    try {
      await onSave(prescription.trim(), notes.trim());
    } catch (err) {
      setError(err?.message || "Failed to save prescription.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-lg">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Complete Consultation</h3>
          <p className="text-sm text-gray-600">
            Patient: <span className="font-medium">{patientName || "—"}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-2 text-sm bg-red-50 border border-red-200 text-red-700 rounded-md">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Prescription *</label>
            <textarea
              className="w-full border rounded-md px-3 py-2 min-h-[120px]"
              value={prescription}
              onChange={(e) => setPrescription(e.target.value)}
              placeholder="Medicines, dosage, duration…"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Doctor Notes (optional)</label>
            <textarea
              className="w-full border rounded-md px-3 py-2 min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Follow-up instructions, lifestyle advice…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save & Complete"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

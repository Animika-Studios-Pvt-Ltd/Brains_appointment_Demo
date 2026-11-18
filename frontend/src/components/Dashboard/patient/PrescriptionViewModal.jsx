import React, { useState } from "react";
import { X, FileText } from "lucide-react";
import { Button } from "../../ui/button";

export default function PrescriptionViewModal({ appointment, userType = "patient", trigger }) {
  const [open, setOpen] = useState(false);

  // Allow both: a custom trigger element or a default button
  const Trigger = () => {
    if (trigger) {
      // clone to inject onClick
      return React.cloneElement(trigger, {
        onClick: (e) => {
          trigger.props?.onClick?.(e);
          setOpen(true);
        },
      });
    }
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileText className="w-4 h-4 mr-2" />
        View Prescription
      </Button>
    );
  };

  const prescription = appointment?.prescription || {};
  const {
    diagnosis,
    notes,
    medicines = [],
    tests = [],
    followUpDate,
    createdAt,
    doctorName = appointment?.doctorId?.name,
    patientName = appointment?.patientId?.name,
  } = prescription;

  return (
    <>
      <Trigger />

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          aria-modal="true"
          role="dialog"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          {/* Modal */}
          <div className="relative z-[61] w-[95vw] max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold">Prescription</h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto px-5 py-4 space-y-4">
              {/* Header info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700">
                <div>
                  <p><span className="font-semibold">Doctor:</span> {doctorName || "-"}</p>
                  <p><span className="font-semibold">Patient:</span> {patientName || "-"}</p>
                </div>
                <div className="sm:text-right">
                  <p><span className="font-semibold">Date:</span> {createdAt ? new Date(createdAt).toLocaleString() : "-"}</p>
                  <p><span className="font-semibold">Follow-up:</span> {followUpDate ? new Date(followUpDate).toLocaleDateString() : "-"}</p>
                </div>
              </div>

              {/* Diagnosis */}
              {diagnosis && (
                <section>
                  <h4 className="font-semibold mb-1">Diagnosis</h4>
                  <p className="text-gray-700 whitespace-pre-wrap">{diagnosis}</p>
                </section>
              )}

              {/* Medicines */}
              {Array.isArray(medicines) && medicines.length > 0 && (
                <section>
                  <h4 className="font-semibold mb-1">Medicines</h4>
                  <ul className="list-disc pl-5 space-y-1 text-gray-700">
                    {medicines.map((m, i) => (
                      <li key={i}>
                        <span className="font-medium">{m.name || m}</span>
                        {m.dose ? <> — {m.dose}</> : null}
                        {m.frequency ? <> — {m.frequency}</> : null}
                        {m.duration ? <> — {m.duration}</> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Tests */}
              {Array.isArray(tests) && tests.length > 0 && (
                <section>
                  <h4 className="font-semibold mb-1">Recommended Tests</h4>
                  <ul className="list-disc pl-5 space-y-1 text-gray-700">
                    {tests.map((t, i) => <li key={i}>{t.name || t}</li>)}
                  </ul>
                </section>
              )}

              {/* Notes */}
              {notes && (
                <section>
                  <h4 className="font-semibold mb-1">Notes</h4>
                  <p className="text-gray-700 whitespace-pre-wrap">{notes}</p>
                </section>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <Button variant="outline" onClick={() => window.print()}>Print</Button>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

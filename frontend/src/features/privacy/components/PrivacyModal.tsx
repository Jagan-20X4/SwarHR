// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Modal } from "@/shared/components/ui/Modal";
export function PrivacyModal({ onClose, coolingMonths, dpo }) {
  const cm = coolingMonths ?? 3;
  const d = dpo || { name: "DPO", email: "", phone: "" };
  return (
    <Modal title="Privacy Policy" onClose={onClose} wide>
      <p className="text-xs text-slate-400 mb-4">DPDPA 2023 & DPDP Rules 2025</p>
      {[
        ["1. Data Fiduciary", "Indira IVF Hospital Pvt. Ltd."],
        ["2. Legal Basis", "Explicit consent for recruitment and employment legitimate use."],
        ["3. Third-Party Sharing", "Anthropic, Inc. (USA) via Claude API for AI screening only. Not retained."],
        ["4. Talent Pool", `CVs stored independently. Authorized HR SPOCs only. Access logged.`],
        ["5. Cooling Period", `${cm}-month cooling period between applications to the same role.`],
        ["6. Your Rights", " Access · Correction & Erasure · Withdrawal · Grievance · Nominate."],
        ["7. Grievance Officer", `${d.name} · ${d.email} · ${d.phone}. 7-day SLA. Escalate to dpb.gov.in.`],
      ].map(([h, b]) => <div key={h} className="mb-4"><h3 className="font-bold text-slate-900 text-sm mb-1">{h}</h3><p className="text-slate-600 text-sm leading-relaxed">{b}</p></div>)}
    </Modal>
  );
}


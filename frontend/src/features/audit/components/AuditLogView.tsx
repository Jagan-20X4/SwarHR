// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  resolveActorLabel,
  formatAuditDate,
  formatAuditTime,
  humanizeAuditEntry,
  AUDIT_TONE_CLASSES,
} from "@/legacy/helpersModule";
export function AuditLogView({ auditLog, candidates, hrUsers, onRefresh, onBack }) {
  const [filter, setFilter] = useState("");
  const candidatesMap = useMemo(
    () => Object.fromEntries((candidates || []).map((c) => [c.id, c.name])),
    [candidates],
  );
  const hrUsersMap = hrUsers || {};
  const rows = useMemo(
    () =>
      (auditLog || []).map((a) => ({
        entry: a,
        humanized: humanizeAuditEntry(a, hrUsersMap, candidatesMap),
        actorLabel: resolveActorLabel(a.actor, hrUsersMap, candidatesMap),
        dateLabel: formatAuditDate(a.timestamp),
        timeLabel: formatAuditTime(a.timestamp),
      })),
    [auditLog, hrUsersMap, candidatesMap],
  );
  const q = filter.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        `${r.humanized.label} ${r.actorLabel} ${r.entry.action} ${r.humanized.sentence} ${r.dateLabel} ${r.timeLabel}`
          .toLowerCase()
          .includes(q),
      )
    : rows;
  const sorted = [...filtered].sort((a, b) => new Date(b.entry.timestamp) - new Date(a.entry.timestamp));
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm">← Back</button>
        <span className="font-bold">Audit Log</span>
        <span className="text-xs text-indigo-300 bg-indigo-900/50 px-2 py-0.5 rounded-full">{auditLog.length}</span>
        {onRefresh ? <button type="button" onClick={onRefresh} className="ml-auto text-xs text-slate-300 hover:text-white border border-slate-700 rounded-lg px-3 py-1">↻ Refresh names</button> : null}
      </div>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-black text-slate-900 mb-1">Access & Action Audit</h1>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by name, action, application, date…" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl mb-5 shadow-sm"/>
        {sorted.length === 0 ? <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center"><p className="text-slate-400">No entries.</p></div> : (
          <div className="space-y-2">{sorted.map(({ entry: a, humanized: h, actorLabel, dateLabel, timeLabel }) => (
            <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs font-black px-2 py-0.5 rounded ${AUDIT_TONE_CLASSES[h.tone] || AUDIT_TONE_CLASSES.slate}`}>{h.label}</span>
                  <span className="text-xs font-bold text-slate-600">{actorLabel}</span>
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">{a.action}</span>
                </div>
                <p className="text-sm text-slate-700">{h.sentence}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-slate-500">{dateLabel}</p>
                <p className="text-xs text-slate-400">{timeLabel}</p>
              </div>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}

const CV_ANALYSER_MAX = 20;
const CV_ANALYSER_MB = 5;


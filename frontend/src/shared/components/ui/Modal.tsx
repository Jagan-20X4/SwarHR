// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
export function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-screen overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-slate-800">{title}</h2>
          {onClose && <button onClick={onClose} className="text-slate-400 hover:text-slate-700 w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">✕</button>}
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}


// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
export function Done({ onDash, isHR }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 text-3xl">✓</div>
      <h1 className="text-3xl font-black text-slate-900 mb-2">Interview Completed</h1>
      <p className="text-slate-500 mb-5 max-w-md">Transcript recorded.</p>
      <button onClick={onDash} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">{isHR ? "HR Dashboard" : "Dashboard"}</button>
    </div>
  );
}


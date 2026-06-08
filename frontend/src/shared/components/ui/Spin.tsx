// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
export function Spin({ label = "Loading…" }) { return <div className="flex flex-col items-center justify-center py-20 gap-4"><div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"/><p className="text-slate-500 text-sm animate-pulse">{label}</p></div>; }


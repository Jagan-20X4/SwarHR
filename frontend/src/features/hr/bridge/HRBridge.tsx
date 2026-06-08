// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  getHrExternalConfig,
} from "@/legacy/helpersModule";
import { HRRedirectOnce } from "@/features/hr/bridge/HRRedirectOnce";
import { HRIframeShell } from "@/features/hr/bridge/HRIframeShell";
export function HRBridge({ children, onLogout }) {
  const { useExternal, mode, url } = getHrExternalConfig();
  if (!useExternal) return children;
  if (mode === "redirect") return <HRRedirectOnce href={url} />;
  return <HRIframeShell baseUrl={url} onLogout={onLogout} />;
}


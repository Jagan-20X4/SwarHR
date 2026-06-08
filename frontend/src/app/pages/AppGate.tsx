// @ts-nocheck
import { Outlet } from "react-router-dom";
import { useAppState } from "@/app/state/AppStateProvider";
import { LoadingScreen } from "@/app/pages/LoadingScreen";

export function AppGate() {
  const { storageReady } = useAppState();
  if (!storageReady) return <LoadingScreen />;
  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      <Outlet />
    </div>
  );
}

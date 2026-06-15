// @ts-nocheck
import { Outlet } from "react-router-dom";
import { useAppState } from "@/app/state/AppStateProvider";
import { LoadingScreen } from "@/app/pages/LoadingScreen";
import { SplashScreen } from "@/app/pages/SplashScreen";

export function AppGate() {
  const { storageReady } = useAppState();
  if (!storageReady) return <LoadingScreen />;
  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      <SplashScreen />
      <Outlet />
    </div>
  );
}

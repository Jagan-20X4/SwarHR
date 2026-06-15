import { useEffect, useState } from "react";

export function SplashScreen() {
  const [gone, setGone] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const fadeTimer = setTimeout(() => setFading(true), 1400);
    const goneTimer = setTimeout(() => {
      setGone(true);
      document.body.style.overflow = "";
    }, 1750);
    return () => {
      document.body.style.overflow = "";
      clearTimeout(fadeTimer);
      clearTimeout(goneTimer);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-white transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <div
        className="splash-heartbeat text-center leading-none text-black"
        style={{ fontFamily: "'Poppins', sans-serif" }}
      >
        <div className="text-6xl md:text-8xl font-black tracking-tight">
          Indira<span className="text-brand-red">IVF</span>
        </div>
        <div className="text-5xl md:text-7xl font-extrabold tracking-tight mt-1">
          Careers
        </div>
      </div>
    </div>
  );
}

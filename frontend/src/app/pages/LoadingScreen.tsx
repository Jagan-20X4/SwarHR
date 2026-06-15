export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white">
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

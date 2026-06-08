// @ts-nocheck
import { authHeaders, LS_ROLE } from "@/legacy/helpersModule";
import { TalentPoolSubmit } from "@/features/talent-pool/components/TalentPoolSubmit";
import { useAppState } from "@/app/state/AppStateProvider";

export function TalentPoolPage() {
  const {
    active,
    authCandidate,
    maxCvMb,
    cmCooling,
    navigate,
    tpFromPortal,
    tpGuestEntryRef,
    setTpGuestRegPrefill,
    setRegisterPhase,
    setTalentPool,
  } = useAppState();

  return (
    <TalentPoolSubmit
      candidate={active}
      guestMode={!authCandidate}
      maxCvMb={maxCvMb}
      coolingMonths={cmCooling}
      onSubmit={async (entry) => {
        try {
          const res = await fetch("/api/talent-pool", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify(entry),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            alert(data.error || "Could not submit to talent pool.");
            return false;
          }
          const saved = { ...entry, id: data.id || entry.id };
          if (localStorage.getItem(LS_ROLE) === "hr") {
            setTalentPool((p) => [...p, saved]);
          }
          return true;
        } catch (e) {
          alert("Could not reach server.");
          return false;
        }
      }}
      onGuestContinue={(entry) => {
        tpGuestEntryRef.current = entry;
        setTpGuestRegPrefill({ name: entry.name, email: entry.email });
        setRegisterPhase("consent");
        navigate("/register");
      }}
      onBack={() => {
        tpGuestEntryRef.current = null;
        setTpGuestRegPrefill(null);
        if (tpFromPortal) navigate("/portal");
        else navigate("/");
      }}
    />
  );
}

export function TalentPoolDonePage() {
  const { navigate } = useAppState();
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 text-3xl">
        ✓
      </div>
      <h1 className="text-3xl font-black text-slate-900 mb-2">Added to Talent Pool</h1>
      <p className="text-slate-500 mb-5 max-w-md">
        HR SPOCs will reach out when a matching role opens.
      </p>
      <button
        type="button"
        onClick={() => navigate("/")}
        className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold"
      >
        Done
      </button>
    </div>
  );
}

// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  resolveTalentPoolCityPick,
  fmtSize,
  fileIcon,
  processResumeFile,
  TP_SOURCE_OPTIONS,
  TALENT_POOL_NOTICE_PERIOD_OPTIONS,
  QUALIFICATION_LEVELS,
  QUALIFICATION_BY_LEVEL,
  formatTalentPoolQualification,
  INDIAN_CITIES_FALLBACK,
} from "@/legacy/helpersModule";
import { Badge } from "@/shared/components/ui/Badge";
export function TalentPoolSubmit({ candidate, onSubmit, onGuestContinue, guestMode, onBack, maxCvMb, coolingMonths }) {
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    name: candidate?.name || "",
    email: candidate?.email || "",
    phone: "",
    desiredRoles: "",
    skills: "",
    experience: "",
    locationCity: "",
    locationOther: "",
    keywords: "",
    qualificationLevel: "",
    qualificationDegree: "",
    currentCtc: "",
    currentEmployer: "",
    source: "",
    applicationDate: todayIso(),
    coolingPeriod: "",
    pref1City: "",
    pref1Other: "",
    pref2City: "",
    pref2Other: "",
    pref3City: "",
    pref3Other: "",
  });
  const [cityList, setCityList] = useState(() => [...INDIAN_CITIES_FALLBACK].sort((a, b) => a.localeCompare(b)));
  const [file, setFile] = useState(null), [error, setError] = useState(""), [processing, setProcessing] = useState(false), [ack, setAck] = useState(false), [done, setDone] = useState(false), [formErr, setFormErr] = useState(""), [submitting, setSubmitting] = useState(false);
  const ref = useRef();
  const mb = typeof maxCvMb === "number" ? maxCvMb : 5;
  useEffect(() => {
    fetch("/indian-cities.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        if (Array.isArray(arr) && arr.length > 0)
          setCityList([...new Set(arr.map((x) => String(x).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (done) return;
    if (typeof IntersectionObserver === "undefined") {
      document.querySelectorAll(".talent-side-img").forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const imgs = document.querySelectorAll(".talent-side-img");
    if (!imgs.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    imgs.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [done]);
  const handleFile = async (f) => { if (!f) return; setError(""); setProcessing(true); try { setFile(await processResumeFile(f, mb)); } catch (e) { setError(e.message); setFile(null); } finally { setProcessing(false); } };
  const resolvedLocation = () => {
    const c = form.locationCity;
    if (!c) return "";
    if (c === "__OTHER__") return (form.locationOther || "").trim() || "Other";
    return c;
  };
  const submit = async () => {
    setFormErr("");
    if (!form.name.trim() || !form.email.trim() || !file || !ack) return;
    if (!form.source) { setFormErr("Please select how you heard about us (Source)."); return; }
    if (!form.locationCity) { setFormErr("Please select your current city (or Other)."); return; }
    if (form.locationCity === "__OTHER__" && !(form.locationOther || "").trim()) { setFormErr("Please type your city when you select Other."); return; }
    for (const [ci, oi] of [["pref1City", "pref1Other"], ["pref2City", "pref2Other"], ["pref3City", "pref3Other"]]) {
      if (form[ci] === "__OTHER__" && !(form[oi] || "").trim()) {
        setFormErr("Please type the city when you select Other for preferred cities.");
        return;
      }
    }
    if (form.qualificationLevel && !form.qualificationDegree) {
      setFormErr("Please select your degree / qualification.");
      return;
    }
    if (!form.qualificationLevel && form.qualificationDegree) {
      setFormErr("Please select qualification level.");
      return;
    }
    const p1 = resolveTalentPoolCityPick(form.pref1City, form.pref1Other);
    const p2 = resolveTalentPoolCityPick(form.pref2City, form.pref2Other);
    const p3 = resolveTalentPoolCityPick(form.pref3City, form.pref3Other);
    const entry = {
      id: "TP-" + Date.now(), candidateId: candidate?.id || null,
      name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim(),
      desiredRoles: form.desiredRoles.split(",").map(s => s.trim()).filter(Boolean),
      skills: form.skills.split(",").map(s => s.trim()).filter(Boolean),
      experience: parseInt(form.experience, 10) || 0,
      location: resolvedLocation(),
      qualification: formatTalentPoolQualification(form.qualificationLevel, form.qualificationDegree),
      currentCtc: form.currentCtc.trim(),
      currentEmployer: form.currentEmployer.trim(),
      source: form.source,
      applicationDate: form.applicationDate || todayIso(),
      coolingPeriod: (form.coolingPeriod || "").trim(),
      preferredCity1: p1,
      preferredCity2: p2,
      preferredCity3: p3,
      keywords: form.keywords.trim(),
      cvText: file.cvText, cvFile: file, submittedAt: new Date().toISOString(), mappedToJobs: []
    };
    if (guestMode && typeof onGuestContinue === "function") {
      onGuestContinue(entry);
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onSubmit(entry);
      if (ok !== false) setDone(true);
    } catch (e) {
      setFormErr(e?.message || "Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };
  if (done) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 text-3xl">✓</div>
      <h1 className="text-3xl font-black text-slate-900 mb-2">Added to Talent Pool</h1>
      <p className="text-slate-500 mb-5 max-w-md">HR SPOCs will reach out when a matching role opens.</p>
      <button onClick={onBack} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">Done</button>
    </div>
  );
  return (
    <div className="talent-watermark min-h-screen bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3"><button onClick={onBack} className="text-slate-400 hover:text-white text-sm">←</button><span className="font-bold">Join Talent Pool</span><Badge/></div>
      <div className="talent-3col">
        <aside className="talent-side talent-side--left" aria-hidden="true">
          <img src="/Vision.png" alt="" className="talent-side-img" loading="eager"/>
          <img src="/Values.png" alt="" className="talent-side-img" loading="lazy"/>
        </aside>
        <main className="talent-center">
          <h1 className="text-3xl font-black text-slate-900 mb-1">Join Our Talent Community</h1>
          <p className="text-slate-500 mb-5">Share your profile and we’ll reach out when the right opportunity comes up.</p>
        {formErr ? <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{formErr}</div> : null}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          {[["Full Name *", "name", "text"], ["Email *", "email", "email"], ["Phone", "phone", "tel"]].map(([l, k, t]) => <div key={k}><label className="block text-xs font-bold text-slate-500 uppercase mb-1">{l}</label><input type={t} value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400"/></div>)}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Current city *</label>
            <div className="flex flex-col sm:flex-row gap-2 items-stretch">
              <select value={form.locationCity} onChange={e => setForm(p => ({ ...p, locationCity: e.target.value, locationOther: e.target.value === "__OTHER__" ? p.locationOther : "" }))} className="flex-1 min-w-0 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white">
                <option value="">— Select city —</option>
                {cityList.map((city) => <option key={city} value={city}>{city}</option>)}
                <option value="__OTHER__">Other</option>
              </select>
              {form.locationCity === "__OTHER__" ? (
                <input type="text" value={form.locationOther} onChange={e => setForm(p => ({ ...p, locationOther: e.target.value }))} placeholder="Type city" className="flex-1 min-w-0 px-4 py-2.5 border border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400" />
              ) : null}
            </div>
          </div>
          {[1, 2, 3].map((n) => {
            const ck = `pref${n}City`;
            const ok = `pref${n}Other`;
            return (
              <div key={n}>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Preferred city {n} <span className="text-slate-400 normal-case font-normal"></span></label>
                <div className="flex flex-col sm:flex-row gap-2 items-stretch">
                  <select value={form[ck]} onChange={e => setForm(p => ({ ...p, [ck]: e.target.value, [ok]: e.target.value === "__OTHER__" ? p[ok] : "" }))} className="flex-1 min-w-0 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white">
                    <option value="">— Select city —</option>
                    {cityList.map((city) => <option key={city} value={city}>{city}</option>)}
                    <option value="__OTHER__">Other</option>
                  </select>
                  {form[ck] === "__OTHER__" ? (
                    <input type="text" value={form[ok]} onChange={e => setForm(p => ({ ...p, [ok]: e.target.value }))} placeholder="Type city" className="flex-1 min-w-0 px-4 py-2.5 border border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400" />
                  ) : null}
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Qualification level</label>
              <select
                value={form.qualificationLevel}
                onChange={e => setForm(p => ({ ...p, qualificationLevel: e.target.value, qualificationDegree: "" }))}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-indigo-400"
              >
                <option value="">— Select level —</option>
                {QUALIFICATION_LEVELS.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Degree / qualification</label>
              <select
                value={form.qualificationDegree}
                disabled={!form.qualificationLevel}
                onChange={e => setForm(p => ({ ...p, qualificationDegree: e.target.value }))}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">— Select degree —</option>
                {(QUALIFICATION_BY_LEVEL[form.qualificationLevel] || []).map((deg) => (
                  <option key={deg} value={deg}>{deg}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Current CTC</label><input value={form.currentCtc} onChange={e => setForm(p => ({ ...p, currentCtc: e.target.value }))} placeholder="e.g. 12 LPA" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Current employer</label><input value={form.currentEmployer} onChange={e => setForm(p => ({ ...p, currentEmployer: e.target.value }))} placeholder="Company name" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Source *</label>
            <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-indigo-400">
              {TP_SOURCE_OPTIONS.map((o) => <option key={o.value || "blank"} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of application</label><input type="date" value={form.applicationDate} onChange={e => setForm(p => ({ ...p, applicationDate: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notice period</label>
              <select value={form.coolingPeriod} onChange={e => setForm(p => ({ ...p, coolingPeriod: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-indigo-400">
                <option value="">— Select —</option>
                {TALENT_POOL_NOTICE_PERIOD_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Years of Experience</label><input type="number" min="0" value={form.experience} onChange={e => setForm(p => ({ ...p, experience: e.target.value }))} placeholder="0" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Desired Roles <span className="text-slate-400 normal-case font-normal">(comma-separated)</span></label><input value={form.desiredRoles} onChange={e => setForm(p => ({ ...p, desiredRoles: e.target.value }))} placeholder="e.g. Senior Embryologist" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Skills <span className="text-slate-400 normal-case font-normal">(comma-separated)</span></label><input value={form.skills} onChange={e => setForm(p => ({ ...p, skills: e.target.value }))} placeholder="ICSI, Vitrification" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"/></div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notes / Keywords</label><textarea rows={3} value={form.keywords} onChange={e => setForm(p => ({ ...p, keywords: e.target.value }))} placeholder="Anything else…" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm resize-none"/></div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Upload Resume *</label>
            <div onClick={() => ref.current?.click()} className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer ${error ? "border-red-300 bg-red-50" : file ? "border-green-300 bg-green-50" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"}`}>
              {processing ? <><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"/><p className="text-slate-500 text-sm">Processing…</p></> :
               file ? <><div className="text-2xl mb-1">{fileIcon(file.ext)}</div><p className="text-slate-700 text-sm font-semibold">{file.name}</p><p className="text-slate-500 text-xs">{file.ext.toUpperCase()} · {fmtSize(file.size)}</p></> :
               <><p className="text-slate-700 text-sm font-semibold">Click to upload</p><p className="text-slate-500 text-xs mt-1">JPG · JPEG · PDF · DOC · DOCX (max {mb} MB)</p></>}
            </div>
            <input ref={ref} type="file" accept=".jpg,.jpeg,.pdf,.doc,.docx" onChange={e => handleFile(e.target.files?.[0])} className="hidden"/>
            {error && <p className="text-red-600 text-xs mt-2">⚠ {error}</p>}
          </div>
          <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer ${ack ? "border-indigo-300 bg-indigo-50" : "border-slate-200"}`}><input type="checkbox" checked={ack} onChange={() => setAck(!ack)} className="mt-0.5 w-4 h-4 accent-indigo-500 shrink-0"/><p className="text-xs text-slate-600">I consent to my profile being stored in the talent pool.</p></label>
          <button onClick={submit} disabled={submitting || !form.name.trim() || !form.email.trim() || !file || !ack} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 text-white font-bold rounded-xl">{submitting ? "Submitting…" : "Submit →"}</button>
        </div>
        </main>
        <aside className="talent-side talent-side--right" aria-hidden="true">
          <img src="/Mission.png" alt="" className="talent-side-img" loading="lazy"/>
        </aside>
      </div>
    </div>
  );
}

const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js";


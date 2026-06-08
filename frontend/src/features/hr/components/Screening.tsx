// @ts-nocheck
import React, { useState, useEffect } from "react";
import { callClaude } from "@/legacy/helpersModule";
import { Spin } from "@/shared/components/ui/Spin";
import {
  fetchAllConsentedWithCv,
  bulkUpdateCandidateStatus,
} from "@/shared/api/candidatesApi";

export function Screening({ jobs, onShortlist, onBack }) {
  const [phase, setPhase] = useState("chat");
  const [criteria, setCriteria] = useState("");
  const [scored, setScored] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loadingPool, setLoadingPool] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchAllConsentedWithCv();
        if (!cancelled) setCandidates(list);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoadingPool(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const consented = candidates.filter((c) => c.consent);

  useEffect(() => {
    if (loadingPool) return;
    (async () => {
      setBusy(true);
      const r = await callClaude(
        [{ role: "user", content: `${consented.length} candidates to screen.` }],
        "You are Swar HR. Be concise.",
      );
      setMsgs([{ role: "ai", text: r }]);
      setHist([
        { role: "user", content: "Hi." },
        { role: "assistant", content: r },
      ]);
      setBusy(false);
    })();
  }, [loadingPool, consented.length]);

  const send = async () => {
    if (!input.trim() || busy) return;
    const u = input.trim();
    setInput("");
    const h = [...hist, { role: "user", content: u }];
    setMsgs((p) => [...p, { role: "user", text: u }]);
    setBusy(true);
    const r = await callClaude(h, "Be concise.");
    setMsgs((p) => [...p, { role: "ai", text: r }]);
    setHist([...h, { role: "assistant", content: r }]);
    setCriteria((p) => p + " " + u);
    setBusy(false);
  };

  const analyze = async () => {
    setPhase("analyzing");
    const results = [];
    for (const c of consented.filter((c) => c.jobId && c.cv)) {
      const job = jobs.find((j) => j.id === c.jobId) || {};
      const r = await callClaude(
        [
          {
            role: "user",
            content: `Score CV for "${job.title}". Req: ${job.requirements}. Extra: ${criteria}. CV: ${c.cv}. JSON: {"overallScore":0-100,"summary":"...","recommendation":"shortlist|reject"}`,
          },
        ],
        "Return only JSON.",
        true,
      );
      results.push({
        ...c,
        sr: r || {
          overallScore: 50,
          summary: "—",
          recommendation: "shortlist",
        },
      });
    }
    const s = results.sort(
      (a, b) => (b.sr?.overallScore || 0) - (a.sr?.overallScore || 0),
    );
    setScored(s);
    setSel(
      new Set(
        s.filter((c) => c.sr?.recommendation === "shortlist").map((c) => c.id),
      ),
    );
    setPhase("results");
  };

  const confirmShortlist = async () => {
    const updates = [...sel].map((id) => ({ id, status: "SHORTLISTED" }));
    if (updates.length) {
      try {
        await bulkUpdateCandidateStatus(updates);
      } catch (e) {
        console.error(e);
        alert("Could not save shortlist status.");
        return;
      }
    }
    onShortlist();
  };

  if (loadingPool) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Spin label="Loading candidates…" />
      </div>
    );
  }

  if (phase === "analyzing")
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Spin label="Analysing…" />
      </div>
    );

  if (phase === "results")
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <span className="font-bold">Results</span>
          <button
            onClick={confirmShortlist}
            className="px-5 py-1.5 bg-indigo-600 rounded-lg text-sm font-bold"
          >
            Confirm ({sel.size})
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-3">
          {scored.map((c) => {
            const on = sel.has(c.id);
            return (
              <div
                key={c.id}
                onClick={() =>
                  setSel((p) => {
                    const n = new Set(p);
                    n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                    return n;
                  })
                }
                className={`bg-white rounded-2xl border p-4 cursor-pointer ${on ? "border-indigo-300" : "border-slate-200 opacity-60"}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.email}</p>
                  </div>
                  <p className="text-2xl font-black text-indigo-600">
                    {c.sr?.overallScore}
                  </p>
                </div>
                <p className="text-sm text-slate-600 mt-2">{c.sr?.summary}</p>
              </div>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-white"
          >
            ← Back
          </button>
          <span className="font-bold">Screening</span>
        </div>
        <button
          onClick={analyze}
          disabled={
            consented.filter((c) => c.cv && c.jobId).length === 0 || busy
          }
          className="px-4 py-1.5 bg-indigo-600 disabled:bg-slate-700 rounded-lg text-sm font-bold"
        >
          Analyse →
        </button>
      </div>
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-6 flex flex-col">
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "ai" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-xs px-4 py-3 rounded-2xl text-sm ${m.role === "ai" ? "bg-slate-100" : "bg-indigo-600 text-white"}`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {busy && (
              <p className="text-slate-500 text-sm animate-pulse">Typing…</p>
            )}
          </div>
          <div className="border-t border-slate-100 p-4 flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Criteria…"
              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
            <button
              onClick={send}
              disabled={!input.trim() || busy}
              className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl disabled:bg-slate-200 text-sm"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

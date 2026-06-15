// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  callInterviewClaude,
  pickFemaleFirstSpeechVoice,
  apiFetchInit,
} from "@/legacy/helpersModule";
import { useAppState } from "@/app/state/AppStateProvider";
export function Interview({ context, applicationId, onEnd, onAbandon }) {
  const { meta } = useAppState();
  const ttsProvider = meta?.ttsProvider || "browser";
  const audioRef = useRef(null);  // used for ElevenLabs MP3 playback
  const RESOLVE_TIMEOUT_MS = 90000;
  const getScriptedList = (scr, ph) => {
    if (!scr) return [];
    if (ph === "opening") return scr.opening || [];
    if (ph === "hr") return scr.role && scr.role.length ? scr.role : (scr.questions || []);
    if (ph === "closing") return scr.closing || [];
    return [];
  };
  const isScriptedPhase = (ph) => ph === "opening" || ph === "hr" || ph === "closing";
  const initialPhaseFromScript = (d) => {
    if ((d.opening || []).length) return "opening";
    if ((d.role || []).length) return "hr";
    if ((d.closing || []).length) return "closing";
    return "ai";
  };
  const [phase, setPhase] = useState("load");
  const [script, setScript] = useState(null);
  const MAX_AI = Math.min(30, Math.max(1, Number(script?.aiFollowUpCount) || 12));
  const AI_DIFFICULTY = ["easy", "medium", "hard"].includes(script?.aiDifficulty) ? script.aiDifficulty : "medium";
  const [phaseIdx, setPhaseIdx] = useState(0);
  const hrPayloadRef = useRef([]);
  const attemptIdRef = useRef(null);
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiQCount, setAiQCount] = useState(0);
  const [hist, setHist] = useState([]);
  const [ended, setEnded] = useState(false);
  const endedRef = useRef(false);
  useEffect(() => {
    endedRef.current = ended;
  }, [ended]);
  const abandonNotifiedRef = useRef(false);
  const sessionMountRef = useRef(Date.now());
  useEffect(() => {
    sessionMountRef.current = Date.now();
    abandonNotifiedRef.current = false;
    hrIntroDoneRef.current = false;
    aiBootRef.current = false;
    hrTranslateCacheRef.current = {};
    setPhaseIdx(0);
    setInterviewStarted(false);
  }, [applicationId]);
  const visHideTimerRef = useRef(null);
  const applicationIdRef = useRef(applicationId);
  useEffect(() => {
    applicationIdRef.current = applicationId;
  }, [applicationId]);
  const onAbandonRef = useRef(onAbandon);
  useEffect(() => {
    onAbandonRef.current = onAbandon;
  }, [onAbandon]);
  const [supported, setSupported] = useState(true);
  const [micError, setMicError] = useState("");
  const [showText, setShowText] = useState(false);
  const [textInput, setTextInput] = useState("");
  const voicesRef = useRef([]);
  const pinnedVoiceRef = useRef(null);
  const recRef = useRef(null);
  const txRef = useRef("");
  const spokenAnswerCommittedRef = useRef(false);
  const suppressSpeechFinalizeRef = useRef(false);
  const busyRef = useRef(false);
  const dispatchAnswerRef = useRef(async (_t) => {});
  const finalizeSpokenAnswerRef = useRef(() => {});
  const SPEECH_FINALIZE_MS = 220;
  const SILENCE_SUBMIT_MS = 3000;
  const aiBootRef = useRef(false);
  const hrIntroDoneRef = useRef(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const autoListenActiveRef = useRef(false);
  const hadSpeechRef = useRef(false);
  const silenceTimerRef = useRef(null);
  const listeningRef = useRef(false);
  /** True only when silence timer called rec.stop(); onend should finalize, not restart. */
  const intentionalStopRef = useRef(false);
  /** Prefix text before a mid-answer recognition restart (browser session limit). */
  const accumulatedAnswerRef = useRef("");
  const hrTranslateCacheRef = useRef({});
  const startAutoListenAfterQuestionRef = useRef(() => {});
  const langMap = { English: "en-IN", Hindi: "hi-IN", Bengali: "bn-IN", Tamil: "ta-IN", Telugu: "te-IN", Kannada: "kn-IN", Marathi: "mr-IN", Gujarati: "gu-IN", Malayalam: "ml-IN" };
  const langCode = langMap[context.language] || "en-IN";
  const buildSysAi = (scr) => {
    const topics = (scr?.doNotRepeatTopics || []).slice(0, 30).map((t, i) => (i + 1) + ". " + t).join("\n");
    const desc = scr?.jobDescription || context.jd?.description || "";
    const req = scr?.jobRequirements || context.jd?.requirements || "";
    const difficulty = ["easy", "medium", "hard"].includes(scr?.aiDifficulty) ? scr.aiDifficulty : AI_DIFFICULTY;
    const total = Math.min(30, Math.max(1, Number(scr?.aiFollowUpCount) || MAX_AI));
    const difficultyBlock = {
      easy: "Difficulty: EASY. Ask straightforward role basics — definitions, daily duties, fundamental tools, simple scenarios. Keep questions accessible to candidates with limited experience. Avoid multi-step problems and edge cases.",
      medium: "Difficulty: MEDIUM. Ask standard role competency questions — situational judgement, moderate-complexity scenarios, single-step problem solving, common pitfalls. Probe both knowledge and applied judgement.",
      hard: "Difficulty: HARD. Ask senior-level scenario-based questions — multi-step problems, edge cases, deep technical probing, behavioural STAR with complications. Press on trade-offs, decision-making under constraints, and ownership.",
    }[difficulty];
    return `You are Swar, a warm HR interviewer. Voice interview for "${context.jd.title}" with ${context.candidateName}. Speak in ${context.language}. <30 words per turn. NO markdown. Ask ONE role-specific question per turn about skills, experience, or scenarios for THIS job only.

${difficultyBlock}

You will ask ${total} role-specific follow-up questions in total. Cover DISTINCT facets each turn (e.g. technical depth, hands-on tools, scenario judgement, collaboration, problem-solving under constraints, role-specific edge cases, behaviour under pressure, communication with stakeholders, ownership and trade-offs). Do not cluster on one topic; rotate facets across turns and go progressively deeper.

Already asked (NEVER repeat or rephrase):
${topics || "(none)"}

Job description: ${desc}
Requirements: ${req}

Do NOT ask: introduce yourself, tell me about yourself, why this company, name confirmation, or any topic already covered above.
After ${total} follow-up questions, end with [INTERVIEW_COMPLETE].`;
  };
  const translateHrScriptLine = useCallback(
    async (raw) => {
      const t = (raw == null ? "" : String(raw)).trim();
      if (!t) return t;
      const target = (context.language || "English").trim();
      if (/^english$/i.test(target)) return t;
      if (typeof window !== "undefined" && !window.CLAUDE_API_URL) return t;
      const key = target + "\n" + t;
      const c = hrTranslateCacheRef.current;
      if (c[key]) return c[key];
      const system = `You translate job interview questions for text-to-speech. Output ONLY the translated question in ${target}. No title, no quotes, no explanation, no markdown. Preserve proper names, product names, and acronyms where natural in ${target}. If the text is already in ${target}, return it unchanged.`;
      try {
        const out = await callInterviewClaude(
          [{ role: "user", content: "Translate this interview question:\n\n" + t }],
          system,
          applicationId,
        );
        const cleaned = (out || "").replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim() || t;
        c[key] = cleaned;
        return cleaned;
      } catch (e) {
        return t;
      }
    },
    [context.language],
  );
  const safeAbandon = async (detail) => {
    if (abandonNotifiedRef.current || !applicationId) return;
    const fn = onAbandonRef.current;
    if (typeof fn !== "function") return;
    abandonNotifiedRef.current = true;
    try {
      await fn(detail || "");
    } catch (_) {}
  };
  useEffect(() => {
    const h = () => {
      if (endedRef.current || !applicationId) return;
      void safeAbandon("page_leave");
    };
    window.addEventListener("pagehide", h);
    return () => window.removeEventListener("pagehide", h);
  }, [applicationId]);
  useEffect(() => {
    const h = () => {
      if (endedRef.current || !applicationId) return;
      void safeAbandon("network_offline");
    };
    window.addEventListener("offline", h);
    return () => window.removeEventListener("offline", h);
  }, [applicationId]);
  useEffect(() => {
    const clearT = () => {
      if (visHideTimerRef.current) {
        clearTimeout(visHideTimerRef.current);
        visHideTimerRef.current = null;
      }
    };
    const onVis = () => {
      clearT();
      if (endedRef.current || !applicationId) return;
      if (document.visibilityState === "hidden") {
        const aidSnapshot = applicationIdRef.current;
        visHideTimerRef.current = setTimeout(() => {
          visHideTimerRef.current = null;
          if (document.visibilityState !== "hidden") return;
          if (endedRef.current || !aidSnapshot) return;
          if (applicationIdRef.current !== aidSnapshot) return;
          void safeAbandon("visibility_hidden");
        }, 12000);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearT();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [applicationId]);
  useEffect(() => {
    return () => {
      if (!applicationId) return;
      if (Date.now() - sessionMountRef.current < 800) return;
      if (endedRef.current) return;
      void safeAbandon("component_unmount");
    };
  }, [applicationId]);
  useEffect(() => { const load = () => { voicesRef.current = window.speechSynthesis?.getVoices?.() || []; }; load(); if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = load; }, []);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);
  useEffect(() => {
    pinnedVoiceRef.current = null;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); setShowText(true); return; }
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = langCode;
    rec.onresult = (e) => {
      let sessionT = "";
      for (let i = 0; i < e.results.length; i++) sessionT += e.results[i][0].transcript;
      const prefix = accumulatedAnswerRef.current ? accumulatedAnswerRef.current + " " : "";
      const merged = (prefix + sessionT).trim();
      setTranscript(merged);
      txRef.current = merged;
      if (merged) hadSpeechRef.current = true;
      if (autoListenActiveRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (!autoListenActiveRef.current || !listeningRef.current) return;
          if (!hadSpeechRef.current) return;
          intentionalStopRef.current = true;
          autoListenActiveRef.current = false;
          try { rec.stop(); } catch (_) {}
        }, SILENCE_SUBMIT_MS);
      }
    };
    rec.onend = () => {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
      if (suppressSpeechFinalizeRef.current) {
        setListening(false);
        autoListenActiveRef.current = false;
        intentionalStopRef.current = false;
        return;
      }
      if (autoListenActiveRef.current && !intentionalStopRef.current && !spokenAnswerCommittedRef.current) {
        const full = (txRef.current || "").trim();
        if (full) {
          accumulatedAnswerRef.current = full;
          hadSpeechRef.current = true;
        }
        try {
          rec.start();
          setListening(true);
          return;
        } catch (_) {
          setListening(false);
          autoListenActiveRef.current = false;
          intentionalStopRef.current = false;
          setTimeout(() => finalizeSpokenAnswerRef.current(), SPEECH_FINALIZE_MS);
          return;
        }
      }
      intentionalStopRef.current = false;
      setListening(false);
      autoListenActiveRef.current = false;
      setTimeout(() => finalizeSpokenAnswerRef.current(), SPEECH_FINALIZE_MS);
    };
    rec.onerror = (e) => {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
      setListening(false);
      autoListenActiveRef.current = false;
      intentionalStopRef.current = false;
      if (e.error === "not-allowed") setMicError("Mic denied.");
      else if (e.error === "no-speech") setMicError("No speech.");
      else if (e.error !== "aborted") setMicError("Speech error.");
    };
    recRef.current = rec;
    return () => {
      suppressSpeechFinalizeRef.current = true;
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
      try { rec.abort(); } catch {}
    };
  }, [langCode]);
  const speak = (text) => new Promise((resolve) => {
    if (!text) { resolve(); return; }

    // ── ElevenLabs path ──────────────────────────────────────────────────────
    if (ttsProvider === "elevenlabs") {
      setSpeaking(true);
      // Stop any current ElevenLabs audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // Strip the language prefix (e.g. "en-IN" → "en") for ElevenLabs
      const langShort = (langCode || "en").split("-")[0];
      fetch(
        "/api/tts",
        apiFetchInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim(), language: langShort }),
        }),
      )
        .then((r) => {
          if (!r.ok) throw new Error(`TTS HTTP ${r.status}`);
          return r.blob();
        })
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            setSpeaking(false);
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            setSpeaking(false);
            resolve();
          };
          audio.play().catch(() => { setSpeaking(false); resolve(); });
        })
        .catch((err) => {
          console.warn("[tts] ElevenLabs failed, falling back to browser TTS:", err);
          // Graceful fallback to browser TTS on error
          setSpeaking(false);
          speakBrowser(text).then(resolve);
        });
      return;
    }

    // ── Browser TTS path (default) ───────────────────────────────────────────
    speakBrowser(text).then(resolve);
  });

  // Browser Web Speech API TTS — kept separate so ElevenLabs can fall back to it
  const speakBrowser = (text) => new Promise((resolve) => {
    if (!text || !window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langCode;
    u.rate = 0.91;
    u.pitch = 1.02;
    // Refresh voices from browser if not yet loaded
    if (!voicesRef.current.length) {
      const fresh = window.speechSynthesis?.getVoices?.() || [];
      if (fresh.length) voicesRef.current = fresh;
    }
    // Pin the female voice on first successful pick and reuse for all questions
    if (!pinnedVoiceRef.current) {
      pinnedVoiceRef.current = pickFemaleFirstSpeechVoice(langCode, voicesRef.current) || null;
    }
    if (pinnedVoiceRef.current) u.voice = pinnedVoiceRef.current;
    u.onstart = () => setSpeaking(true);
    u.onend = () => { setSpeaking(false); resolve(); };
    u.onerror = () => { setSpeaking(false); resolve(); };
    window.speechSynthesis.speak(u);
  });
  useEffect(() => {
    if (!applicationId) {
      setPhase("load");
      setScript(null);
      return;
    }
    let cancelled = false;
    setPhase("load");
    attemptIdRef.current = null;
    fetch(`/api/voice-bot/interview-script/${applicationId}`, apiFetchInit())
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(async (d) => {
        if (cancelled) return;
        setScript(d);
        setPhaseIdx(0);
        setPhase(initialPhaseFromScript(d));
        try {
          const sr = await fetch(
            "/api/voice-bot/interview-session-start",
            apiFetchInit({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ applicationId }),
            }),
          );
          if (sr.ok) {
            const sd = await sr.json();
            if (sd.attemptId != null) attemptIdRef.current = Number(sd.attemptId);
          }
        } catch (_) {}
      })
      .catch(() => { if (!cancelled) setPhase("err"); });
    return () => { cancelled = true; };
  }, [applicationId]);
  useEffect(() => {
    if (applicationId) return;
    const t = setTimeout(() => {
      setPhase((prev) => (prev === "load" ? "err" : prev));
    }, RESOLVE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [applicationId]);
  useEffect(() => {
    if (!isScriptedPhase(phase) || !interviewStarted || !script) return;
    if (phaseIdx !== 0) return;
    const qs = getScriptedList(script, phase);
    if (!qs.length) return;
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;
      if (hrIntroDoneRef.current) return;
      hrIntroDoneRef.current = true;
      const q0 = qs[0];
      setBusy(true);
      let toSpeak = q0.question;
      try {
        toSpeak = await translateHrScriptLine(q0.question);
      } catch (_) {}
      if (cancelled) {
        setBusy(false);
        return;
      }
      setBusy(false);
      setMsgs((p) => [...p, { role: "ai", text: toSpeak, tag: phase }]);
      await speak(toSpeak);
      if (!cancelled) startAutoListenAfterQuestionRef.current();
    })();
    return () => { cancelled = true; if (window.speechSynthesis) window.speechSynthesis.cancel(); if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, [phase, script, interviewStarted, translateHrScriptLine, phaseIdx]);
  useEffect(() => {
    if (!script || phase === "load" || phase === "err" || phase === "ai") return;
    const qs = getScriptedList(script, phase);
    if (qs.length > 0) return;
    hrIntroDoneRef.current = false;
    if (phase === "opening") { setPhaseIdx(0); setPhase("hr"); }
    else if (phase === "hr") { setPhaseIdx(0); setPhase((script.closing || []).length ? "closing" : "ai"); }
    else if (phase === "closing") {
      setEnded(true);
      const transcriptOut = msgs.map((m) => ({ role: m.role, text: m.text }));
      setTimeout(() => onEnd(transcriptOut), 450);
    }
  }, [phase, script]);
  useEffect(() => {
    if (!isScriptedPhase(phase)) return;
    hrIntroDoneRef.current = false;
  }, [phase]);
  useEffect(() => {
    if (phase !== "ai") return;
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 300));
      if (cancelled) return;
      if (aiBootRef.current) return;
      aiBootRef.current = true;
      setBusy(true);
      const r0 = await callInterviewClaude(
        [{ role: "user", content: "Start." }],
        buildSysAi(script),
        applicationId,
      );
      if (cancelled) return;
      const clean = r0.replace("[INTERVIEW_COMPLETE]", "").trim();
      setMsgs((p) => [...p, { role: "ai", text: clean, tag: "ai" }]);
      setHist([{ role: "user", content: "Start." }, { role: "assistant", content: r0 }]);
      setBusy(false);
      await speak(clean);
      if (!cancelled) startAutoListenAfterQuestionRef.current();
    })();
    return () => { cancelled = true; };
  }, [phase]);
  const startAutoListenAfterQuestion = () => {
    if (!recRef.current || endedRef.current) return;
    suppressSpeechFinalizeRef.current = false;
    spokenAnswerCommittedRef.current = false;
    hadSpeechRef.current = false;
    intentionalStopRef.current = false;
    accumulatedAnswerRef.current = "";
    autoListenActiveRef.current = true;
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    setTranscript("");
    txRef.current = "";
    setMicError("");
    setListening(true);
    try {
      recRef.current.start();
    } catch (_) {
      setListening(false);
      autoListenActiveRef.current = false;
    }
  };
  startAutoListenAfterQuestionRef.current = startAutoListenAfterQuestion;
  const postScriptedAnswers = async (finalize) => {
    try {
      let attemptId = attemptIdRef.current;
      if (attemptId == null) {
        const sr = await fetch(
          "/api/voice-bot/interview-session-start",
          apiFetchInit({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ applicationId }),
          }),
        );
        if (sr.ok) {
          const sd = await sr.json();
          if (sd.attemptId != null) {
            attemptId = Number(sd.attemptId);
            attemptIdRef.current = attemptId;
          }
        }
      }
      const res = await fetch(
        "/api/voice-bot/interview-answers",
        apiFetchInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationId,
            attemptId: attemptId ?? undefined,
            answers: hrPayloadRef.current,
            finalizeInterview: !!finalize,
          }),
        }),
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("interview-answers save failed:", err.error || res.status);
      } else {
        const body = await res.json().catch(() => ({}));
        if (body.attemptId != null) attemptIdRef.current = Number(body.attemptId);
      }
    } catch (e) { console.error(e); }
  };
  const dispatchAnswer = async (text) => {
    const answer = (text || "").trim();
    if (!answer || busy || ended) return;
    accumulatedAnswerRef.current = "";
    setTranscript(""); txRef.current = ""; setTextInput(""); setMicError("");
    if (isScriptedPhase(phase) && script) {
      const qs = getScriptedList(script, phase);
      if (!qs.length) return;
      const cur = qs[phaseIdx];
      setMsgs((p) => [...p, { role: "user", text: answer, tag: phase }]);
      hrPayloadRef.current.push({
        questionId: cur.id > 0 ? cur.id : null,
        questionText: cur.question,
        answerText: answer,
        audioUrl: null,
        durationSeconds: null,
      });
      const nextIdx = phaseIdx + 1;
      if (nextIdx < qs.length) {
        setPhaseIdx(nextIdx);
        hrIntroDoneRef.current = false;
        setBusy(true);
        const nq = qs[nextIdx];
        let toSpeak = nq.question;
        try {
          toSpeak = await translateHrScriptLine(nq.question);
        } catch (_) {}
        setMsgs((p) => [...p, { role: "ai", text: toSpeak, tag: phase }]);
        setBusy(false);
        await speak(toSpeak);
        startAutoListenAfterQuestion();
      } else if (phase === "opening") {
        setPhaseIdx(0);
        hrIntroDoneRef.current = false;
        setPhase("hr");
      } else if (phase === "hr") {
        setBusy(true);
        await postScriptedAnswers(false);
        setBusy(false);
        aiBootRef.current = false;
        setPhase("ai");
      } else if (phase === "closing") {
        setBusy(true);
        await postScriptedAnswers(true);
        setBusy(false);
        let transcriptOut = null;
        setMsgs((p) => {
          const next = [...p];
          transcriptOut = next.map((m) => ({ role: m.role, text: m.text }));
          return next;
        });
        setEnded(true);
        setTimeout(() => onEnd(transcriptOut || msgs.map((m) => ({ role: m.role, text: m.text }))), 450);
      }
      return;
    }
    if (phase === "ai") {
      const lastAi = [...msgs].reverse().find((m) => m.role === "ai");
      if (lastAi?.text) {
        hrPayloadRef.current.push({
          questionId: null,
          questionText: lastAi.text,
          answerText: answer,
          audioUrl: null,
          durationSeconds: null,
        });
        try {
          await postScriptedAnswers(false);
        } catch (e) {
          console.error(e);
        }
      }
      const prevAiQCount = aiQCount;
      const h = [...hist, { role: "user", content: answer }];
      setBusy(true);
      const r = await callInterviewClaude(h, buildSysAi(script), applicationId);
      const clean = r.replace("[INTERVIEW_COMPLETE]", "").trim();
      setHist([...h, { role: "assistant", content: r }]);
      setAiQCount((c) => c + 1);
      const nextUserTurnCount = prevAiQCount + 1;
      setBusy(false);
      let transcriptOut = null;
      setMsgs((p) => {
        const next = [...p, { role: "user", text: answer, tag: "ai" }, { role: "ai", text: clean, tag: "ai" }];
        transcriptOut = next.map((m) => ({ role: m.role, text: m.text }));
        return next;
      });
      await speak(clean);
      if (nextUserTurnCount >= MAX_AI && transcriptOut) {
        const closingQs = getScriptedList(script, "closing");
        if (closingQs.length) {
          setPhase("closing");
          setPhaseIdx(0);
          hrIntroDoneRef.current = false;
        } else {
          await postScriptedAnswers(true);
          setEnded(true);
          setTimeout(() => onEnd(transcriptOut), 450);
        }
      } else {
        startAutoListenAfterQuestion();
      }
    }
  };
  dispatchAnswerRef.current = dispatchAnswer;
  const finalizeSpokenAnswer = () => {
    if (suppressSpeechFinalizeRef.current || spokenAnswerCommittedRef.current) return;
    if (busyRef.current || endedRef.current) return;
    const a = (txRef.current || "").trim();
    if (!a) {
      setMicError("No speech.");
      return;
    }
    spokenAnswerCommittedRef.current = true;
    void dispatchAnswerRef.current(a);
  };
  finalizeSpokenAnswerRef.current = finalizeSpokenAnswer;
  const sendAnswer = (text) => dispatchAnswer(text);
  const endInterview = async () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    suppressSpeechFinalizeRef.current = true;
    autoListenActiveRef.current = false;
    intentionalStopRef.current = false;
    accumulatedAnswerRef.current = "";
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    if (recRef.current) { try { recRef.current.abort(); } catch {} }
    if (!ended && applicationId && typeof onAbandon === "function") {
      await safeAbandon("candidate_clicked_end");
      return;
    }
    onEnd(msgs);
  };
  const lastQ = [...msgs].reverse().find((m) => m.role === "ai");
  const scriptedQs = isScriptedPhase(phase) ? getScriptedList(script, phase) : [];
  const scriptedTotal = scriptedQs.length;
  const phaseLabel = phase === "opening" ? `Introduction · ${Math.min(phaseIdx + 1, scriptedTotal)}/${scriptedTotal || "—"}` : phase === "hr" ? `Role-specific · ${Math.min(phaseIdx + 1, scriptedTotal)}/${scriptedTotal || "—"}` : phase === "closing" ? `Closing · ${Math.min(phaseIdx + 1, scriptedTotal)}/${scriptedTotal || "—"}` : phase === "ai" ? `Follow-up · ${aiQCount}/${MAX_AI}` : "";
  if (phase === "load") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8">
        <div className="w-10 h-10 border-4 border-indigo-800 border-t-indigo-400 rounded-full animate-spin mb-4"/>
        <p className="text-slate-400 text-sm">{!applicationId ? "Resolving application…" : "Loading interview script…"}</p>
      </div>
    );
  }
  if (phase === "err") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
        <p className="text-red-300 mb-4 text-sm">Could not start interview (missing application or script).</p>
        <button type="button" onClick={() => onEnd([])} className="px-5 py-2 bg-slate-700 text-white rounded-xl text-sm font-bold">Exit</button>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className={`w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center font-black text-white ${speaking ? "animate-pulse" : ""}`}>S</div><div><p className="font-bold text-white text-sm">Swar Voice Interview</p><p className="text-xs text-indigo-300">{context.language} · {phaseLabel}</p></div></div>
        <button type="button" onClick={endInterview} className="px-3 py-1.5 bg-red-900/40 text-red-300 rounded-lg text-xs font-bold border border-red-800/50">End</button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-3xl mx-auto w-full">
        <div className="mb-6 relative">
          <div className={`w-40 h-40 rounded-full flex items-center justify-center text-white text-5xl font-black transition-all duration-500 shadow-2xl ${listening ? "bg-gradient-to-br from-red-500 to-rose-600 scale-105" : "bg-gradient-to-br from-indigo-500 to-purple-600"} ${speaking ? "scale-110" : ""}`}>{speaking ? "🔊" : listening ? "🎤" : "S"}</div>
          {speaking && <div className="absolute inset-0 rounded-full border-4 border-indigo-400 animate-ping opacity-40"/>}
          {listening && <div className="absolute inset-0 rounded-full border-4 border-red-400 animate-ping opacity-50"/>}
        </div>
        <div className="text-center mb-6 min-h-[3rem]">
          {busy && <p className="text-indigo-300 text-sm animate-pulse">Swar is thinking…</p>}
          {speaking && !busy && <p className="text-indigo-300 text-sm">🔊 Swar is speaking</p>}
          {listening && <p className="text-red-300 text-sm animate-pulse">🎤 Listening…</p>}
          {!busy && !speaking && !listening && !ended && isScriptedPhase(phase) && getScriptedList(script, phase).length > 0 && !interviewStarted && (
            <p className="text-slate-400 text-sm max-w-md mx-auto">Press Start once — after each question, speak your answer; it sends after {SILENCE_SUBMIT_MS / 1000}s of silence.</p>
          )}
          {ended && <p className="text-green-300 text-sm">✓ Complete</p>}
          {micError && <p className="text-amber-400 text-xs mt-1">{micError}</p>}
        </div>
        {lastQ && <div className="max-w-xl w-full bg-slate-800 border border-slate-700 rounded-2xl p-5 mb-4 text-center"><p className="text-xs uppercase font-black text-indigo-400 mb-2">Question</p><p className="text-white text-base">{lastQ.text}</p></div>}
        {(transcript || listening) && <div className="max-w-xl w-full bg-red-900/20 border border-red-800/50 rounded-2xl p-4 mb-4"><p className="text-xs uppercase font-black text-red-300 mb-1">Your answer</p><p className="text-white">{transcript || <span className="text-slate-500 italic">Speak now…</span>}</p></div>}
        {!ended && supported && isScriptedPhase(phase) && getScriptedList(script, phase).length > 0 && !interviewStarted && (
          <div className="flex flex-col items-center gap-3 my-4">
            <button
              type="button"
              onClick={() => setInterviewStarted(true)}
              disabled={busy}
              className="px-10 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-black text-lg shadow-2xl"
            >
              Start interview
            </button>
          </div>
        )}
        {showText && !ended && (
          <div className="max-w-xl w-full mt-4 flex gap-2">
            <input value={textInput} onChange={(e) => setTextInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendAnswer(textInput)} placeholder="Type answer…" disabled={busy} className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"/>
            <button type="button" onClick={() => sendAnswer(textInput)} disabled={!textInput.trim() || busy} className="px-5 py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm disabled:bg-slate-700">Send</button>
          </div>
        )}
        {supported && !showText && !ended && (!isScriptedPhase(phase) || interviewStarted) && (
          <button type="button" onClick={() => setShowText(true)} className="text-slate-500 text-xs mt-3 underline">Type instead</button>
        )}
        {!supported && <div className="bg-amber-900/30 border border-amber-700 rounded-xl p-4 text-center text-amber-200 text-sm max-w-md">⚠ Browser doesn't support voice. Use text.</div>}
      </div>
    </div>
  );
}


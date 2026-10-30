import { useState, useEffect, useRef } from "react";
import { 
  Eye, 
  Droplets, 
  Monitor,
  Timer,
  Pin,
  PinOff,
  RefreshCcw
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import mascotImg from "./assets/island_mascot.png";

type WidgetState = "idle" | "alert" | "expanded";
type AlertCategory = "none" | "blink" | "phone" | "hydration" | "screentime";

interface TelemetrySnapshot {
  focus_score: number;
  blink_rate: number;
  screen_time_minutes: number;
  hydration_count: number;
  phone_distraction_seconds: number;
  current_alert: string;
  severity?: "info" | "warning" | "critical";
  context_activity?: string;
  reasoning?: string;
}

export default function App() {
  const [widgetState, setWidgetState] = useState<WidgetState>("expanded");
  const [pinned, setPinned] = useState(true);
  const [activeCategory, setActiveCategory] = useState<AlertCategory>("none");
  const [currentTime, setCurrentTime] = useState("09:43");
  const [breakTimerActive, setBreakTimerActive] = useState(false);
  const [breakTimerCountdown, setBreakTimerCountdown] = useState(20);
  const [mascotPokeActive, setMascotPokeActive] = useState(false);
  const [alertSeverity, setAlertSeverity] = useState<"info" | "warning" | "critical">("info");
  const [alertReasoning, setAlertReasoning] = useState<string>("");
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const collapseTimerRef = useRef<number | null>(null);
  const breakIntervalRef = useRef<number | null>(null);
  const alertDebounceRef = useRef<{lastAlert: string; stableCount: number}>({lastAlert: "idle", stableCount: 0});

  // Data telemetri real-time optik
  const [metrics, setMetrics] = useState({
    focusScore: 85,
    blinkRate: "12/min",
    blinkStatus: "Normal",
    hydration: "0x",
    hydrationStatus: "Perlu minum",
    phoneUsage: "0s",
    phoneStatus: "Aman",
    screenTime: "0s",
    screenStatus: "Aman"
  });

  // Jam lokal digital
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateClock();
    const interval = setInterval(updateClock, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update input region dinamis ke Wayland layer-shell
  useEffect(() => {
    let bounds = { x: 175.0, y: 0.0, width: 290.0, height: 56.0 };
    if (widgetState === "alert") {
      bounds = { x: 120.0, y: 0.0, width: 400.0, height: 56.0 };
    } else if (widgetState === "expanded") {
      bounds = { x: 95.0, y: 0.0, width: 440.0, height: 400.0 };
    }
    invoke("update_notch_bounds", bounds).catch(() => {});
  }, [widgetState]);

  // Polling telemetri otomatis setiap 400ms (bypass Wayland layer-shell IPC issue)
  useEffect(() => {
    console.log("[POLLING] Starting telemetry poll loop");
    const pollInterval = setInterval(async () => {
      try {
        const data = await invoke<TelemetrySnapshot>("get_current_telemetry");
        if (data) {
          console.log("[POLLING] Telemetry:", data.current_alert, data.phone_distraction_seconds);
          // Update metrics display
          setMetrics(prev => ({
            ...prev,
            focusScore: data.focus_score || 85,
            blinkRate: `${data.blink_rate || 12}/min`,
            screenTime: `${(data.screen_time_minutes || 0) * 60}s`,
            hydration: `${data.hydration_count || 0}x`,
            phoneUsage: `${data.phone_distraction_seconds || 0}s`,
            blinkStatus: data.blink_rate >= 10 ? "Normal" : "Kurang",
            phoneStatus: data.phone_distraction_seconds > 4 ? "Terlalu lama" : "Aman",
            hydrationStatus: data.hydration_count > 0 ? "Baik" : "Perlu minum",
            screenStatus: data.screen_time_minutes >= 20 ? "Perlu istirahat" : "Aman"
          }));

          // Detect alert state change with hysteresis (debounce 3 polls = 1.2s stable)
          const currentAlertStr = String(data.current_alert || "idle").toLowerCase();
          const debounce = alertDebounceRef.current;
          
          // Track alert stability
          if (currentAlertStr === debounce.lastAlert) {
            debounce.stableCount++;
          } else {
            debounce.lastAlert = currentAlertStr;
            debounce.stableCount = 1;
          }
          
          console.log("[POLLING] Alert:", currentAlertStr, "stable:", debounce.stableCount);
          
          // Only trigger state change after 3 stable polls (1.2s)
          if (debounce.stableCount >= 3) {
            if (currentAlertStr !== "idle" && currentAlertStr !== "none") {
              // Hanya set ke alert jika state BUKAN expanded!
              // Jika user sedang melihat dashboard, JANGAN ganggu dengan paksa kembali ke alert!
              setWidgetState((prevState) => {
                if (prevState === "expanded") {
                  console.log("[POLLING] Alert detected but user viewing dashboard, preserving expanded state");
                  return prevState;
                }
                console.log("[POLLING] ALERT STABLE! Setting state to 'alert'");
                setActiveCategory(currentAlertStr as AlertCategory);
                if (data.severity) setAlertSeverity(data.severity as any);
                if (data.reasoning) setAlertReasoning(data.reasoning || "");
                return "alert";
              });
            } else {
              // Hanya reset ke idle jika sebelumnya sedang alert!
              // JANGAN paksa tutup jika user sedang membuka dashboard (expanded) secara manual!
              setWidgetState((prevState) => {
                if (prevState === "alert") {
                  console.log("[POLLING] IDLE STABLE! Dismissing alert back to idle");
                  setActiveCategory("none");
                  return "idle";
                }
                return prevState;
              });
            }
          }
        }
      } catch (err) {
        console.error("[POLLING] Error:", err);
      }
    }, 400);  // 400ms = 2.5x per second for responsive UI

    return () => clearInterval(pollInterval);
  }, []);

  // [REMOVED] Auto-dismiss alert logic — diganti dengan polling-based auto-dismiss
  // Polling loop di line 80-137 sudah handle idle detection dan auto-dismiss
  // Tidak perlu timer tambahan yang conflict dengan real-time telemetry

  // Auto-collapse dengan debounce 3 detik saat mouse meninggalkan pulau (jika tidak di-pin)
  const handleMouseEnter = () => {
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    if (!pinned && widgetState === "expanded") {
      collapseTimerRef.current = window.setTimeout(() => {
        setWidgetState(activeCategory !== "none" ? "alert" : "idle");
      }, 3000);
    }
  };

  // Toggle klik expand / collapse
  const handlePillClick = (e?: React.MouseEvent) => {
    // Jangan toggle jika klik berasal dari mascot (data-role="mascot")
    if (e && (e.target as HTMLElement).closest('[data-role="mascot"]')) {
      return;
    }
    
    if (widgetState === "expanded") {
      setWidgetState(activeCategory !== "none" ? "alert" : "idle");
    } else {
      setWidgetState("expanded");
    }
  };

  const triggerSimulation = async (type: string) => {
    try {
      await invoke("simulate_vision_trigger", { triggerType: type });
      setWidgetState("alert");
      setActiveCategory(type as AlertCategory);
    } catch {
      setActiveCategory(type as AlertCategory);
      setWidgetState("alert");
    }
  };

  const resetToIdle = async () => {
    try {
      await invoke("simulate_vision_trigger", { triggerType: "idle" });
    } catch {}
    setActiveCategory("none");
    setWidgetState("idle");
  };

  // Handler: Poke Maskot Interaktif
  const handleMascotPoke = async () => {
    setMascotPokeActive(true);
    try {
      await invoke("log_mascot_poke");
    } catch {}
    setTimeout(() => setMascotPokeActive(false), 600);
  };

  // Handler: Tambah Gelas Air Langsung
  const handleAddWater = async () => {
    try {
      const newCount = await invoke<number>("log_water_intake");
      setMetrics(prev => ({
        ...prev,
        hydration: `${newCount}x`
      }));
      // Tampilkan alert sukses sementara
      setWidgetState("alert");
      setActiveCategory("hydration");
      setTimeout(() => {
        setWidgetState("expanded");
      }, 2000);
    } catch {}
  };

  // Handler: Timer 20-20-20 Break
  const handleStartBreak = () => {
    if (breakTimerActive) {
      // Stop timer
      if (breakIntervalRef.current) clearInterval(breakIntervalRef.current);
      setBreakTimerActive(false);
      setBreakTimerCountdown(20);
      invoke("log_break_done", { durationSec: 20 }).catch(() => {});
    } else {
      // Start timer
      setBreakTimerActive(true);
      setBreakTimerCountdown(20);
      let countdown = 20;
      if (breakIntervalRef.current) clearInterval(breakIntervalRef.current);
      breakIntervalRef.current = window.setInterval(() => {
        countdown--;
        setBreakTimerCountdown(countdown);
        if (countdown <= 0) {
          clearInterval(breakIntervalRef.current!);
          setBreakTimerActive(false);
          invoke("log_break_done", { durationSec: 20 }).catch(() => {});
          setWidgetState("alert");
          setActiveCategory("screentime");
        }
      }, 1000);
    }
  };

  // Cleanup break timer on unmount
  useEffect(() => {
    return () => {
      if (breakIntervalRef.current) clearInterval(breakIntervalRef.current);
    };
  }, []);

  // Helper: Get severity-based colors
  const getSeverityColors = (severity: "info" | "warning" | "critical") => {
    switch (severity) {
      case "info":
        return {
          text: "text-blue-300",
          border: "border-blue-400/50",
          bg: "bg-blue-500/15",
          glow: "shadow-[0_0_14px_rgba(59,130,246,0.45)]",
          pulse: "bg-blue-400",
          icon: "💡"
        };
      case "warning":
        return {
          text: "text-amber-300",
          border: "border-amber-400/50",
          bg: "bg-amber-500/20",
          glow: "shadow-[0_0_14px_rgba(251,191,36,0.45)]",
          pulse: "bg-amber-400",
          icon: "⚠️"
        };
      case "critical":
        return {
          text: "text-rose-300",
          border: "border-rose-500/50",
          bg: "bg-rose-500/25",
          glow: "shadow-[0_0_16px_rgba(244,63,94,0.55)]",
          pulse: "bg-rose-500",
          icon: "🚨"
        };
    }
  };

  const severityStyle = getSeverityColors(alertSeverity);

  return (
    <div 
      className="w-full h-full flex flex-col items-center justify-start select-none pt-0.5"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Dynamic Island Capsule - Desain Playful Jelly Glass */}
      <div 
        role="button"
        tabIndex={0}
        aria-label="NotchPulse Dynamic Island"
        onClick={handlePillClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handlePillClick(); }}
        className={`island-shell relative z-20 cursor-pointer overflow-hidden flex flex-col items-center text-left ${
          widgetState === "idle"
            ? "island-shell-idle h-14 w-[290px] rounded-full justify-center"
            : widgetState === "alert"
              ? "island-shell-alert h-14 w-[400px] rounded-full justify-center"
              : "island-shell-expanded w-[410px] h-auto rounded-[2.2rem] px-5 pt-3.5 pb-4"
        }`}
      >
        {/* =================================================================== */}
        {/* 1. STATE: IDLE (h-14 w-[290px] rounded-full - Maskot Jelly & Waveform) */}
        {/* =================================================================== */}
        {widgetState === "idle" && (
          <div 
            className="w-full flex items-center justify-between z-10"
            style={{ paddingLeft: "20px", paddingRight: "32px" }}
          >
            {/* Kiri: Maskot Jelly Pulse Lucu (Interaktif Klik / Poke) */}
            <div 
              className="flex items-center gap-2.5 cursor-pointer group"
              onClick={(e) => {
                e.stopPropagation();
                handleMascotPoke();
                // Toggle ke expanded saat di-klik dari idle
                setWidgetState("expanded");
              }}
              title="Klik untuk buka dashboard! ✨"
            >
              <div className="relative flex items-center justify-center">
                <div className={`absolute w-9 h-9 rounded-full blur-md animate-soft-glow ${
                  mascotPokeActive ? "bg-pink-400/60 scale-125" : "bg-purple-500/35"
                } transition-all duration-300`} />
                <img 
                  src={mascotImg} 
                  alt="Pulse Maskot Jelly" 
                  className={`w-10 h-10 object-contain relative z-10 drop-shadow-[0_0_12px_rgba(168,85,247,0.7)] ${
                    mascotPokeActive ? "animate-jelly-poke" : "animate-breathe"
                  }`} 
                />
                {mascotPokeActive && (
                  <span className="absolute -top-1 -right-1 text-[11px] animate-pop-in select-none">💖</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-white tracking-wide font-display group-hover:text-pink-300 transition-colors">Pulse</span>
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" />
              </div>
            </div>

            {/* Kanan: Equalizer Waveform Ungu Neon */}
            <div className="flex items-center">
              <div className="flex items-end gap-1.5 h-4 text-[#c084fc]">
                <span className="w-1.5 bg-[#c084fc] rounded-full h-2.5 animate-pulse shadow-[0_0_6px_rgba(192,132,252,0.8)]" />
                <span className="w-1.5 bg-gradient-to-t from-[#c084fc] to-pink-400 rounded-full h-4 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.7)]" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 bg-[#c084fc] rounded-full h-3 animate-pulse shadow-[0_0_6px_rgba(192,132,252,0.8)]" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 2. STATE: ALERT (Cyber-Kawaii Status Banner + Maskot)               */}
        {/* =================================================================== */}
        {widgetState === "alert" && (
          <div 
            className={`w-full h-full flex items-center justify-between z-10 ${
              alertSeverity === "critical" ? "animate-pulse" : ""
            }`}
            style={{ paddingLeft: "16px", paddingRight: "26px" }}
          >
            {/* Kiri: Maskot Jelly Pulse Besar 3D dengan Animasi Poke */}
            <div 
              className="flex items-center gap-2 shrink-0 cursor-pointer"
              data-role="mascot"
              onClick={(e) => {
                e.stopPropagation();
                handleMascotPoke();
                // Expand ke dashboard saat diklik dari alert
                setWidgetState("expanded");
              }}
              title="Klik untuk lihat detail alert! 💖"
            >
              <div className="relative flex items-center justify-center">
                <div className={`absolute w-10 h-10 rounded-full blur-md animate-soft-glow ${
                  mascotPokeActive ? "bg-pink-400/60 scale-125" : "bg-pink-500/35"
                } transition-all duration-300`} />
                <img 
                  src={mascotImg} 
                  alt="Pulse Maskot" 
                  className={`w-11 h-11 object-contain relative z-10 drop-shadow-[0_0_14px_rgba(244,63,94,0.7)] ${
                    mascotPokeActive ? "animate-jelly-poke" : "animate-breathe"
                  }`} 
                />
                {mascotPokeActive && (
                  <span className="absolute -top-1 -right-1 text-[11px] animate-pop-in select-none">✨</span>
                )}
              </div>
            </div>

            {/* Tengah: Pesan Status Dinamis Banner */}
            <div className="min-w-0 flex-1 px-3">
              {activeCategory === "phone" ? (
                <div>
                  <p className={`font-display text-[11.5px] font-black leading-tight ${severityStyle.text} tracking-wide truncate flex items-center gap-1`}>
                    <span>{severityStyle.icon}</span>
                    HP Terlalu Lama!
                  </p>
                  <p className="truncate text-[9px] font-semibold text-neutral-300">
                    Yuk istirahat sejenak 📱
                  </p>
                </div>
              ) : activeCategory === "blink" ? (
                <div>
                  <p className={`font-display text-[11.5px] font-black leading-tight ${severityStyle.text} tracking-wide truncate flex items-center gap-1`}>
                    <span>{severityStyle.icon}</span>
                    Kedip Matamu!
                  </p>
                  <p className="truncate text-[9px] font-semibold text-neutral-300">
                    Cegah mata lelah & kering 👀
                  </p>
                </div>
              ) : activeCategory === "hydration" ? (
                <div>
                  <p className={`font-display text-[11.5px] font-black leading-tight ${severityStyle.text} tracking-wide truncate flex items-center gap-1`}>
                    <span>{severityStyle.icon}</span>
                    Waktunya Minum Air!
                  </p>
                  <p className="truncate text-[9px] font-semibold text-neutral-300">
                    Jaga hidrasi & fokus tubuh 💧
                  </p>
                </div>
              ) : activeCategory === "screentime" ? (
                <div>
                  <p className={`font-display text-[11.5px] font-black leading-tight ${severityStyle.text} tracking-wide truncate flex items-center gap-1`}>
                    <span>{severityStyle.icon}</span>
                    Aturan 20-20-20!
                  </p>
                  <p className="truncate text-[9px] font-semibold text-neutral-300">
                    Lihat objek jauh 20 detik 🌿
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-display text-[11.5px] font-black leading-tight text-purple-300 tracking-wide truncate">
                    NotchPulse Siaga
                  </p>
                  <p className="truncate text-[9px] font-semibold text-neutral-300">
                    Memantau pola sehatmu ✨
                  </p>
                </div>
              )}
            </div>

            {/* Kanan: Badge Metrik Aktif + Why Button */}
            <div className="shrink-0 flex items-center gap-2">
              {/* Metric Badge */}
              {activeCategory === "phone" ? (
                <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#f97316]/50 bg-[#f97316]/25 shadow-[0_0_14px_rgba(249,115,22,0.45)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f97316] animate-pulse" />
                  <span className="text-[#f97316] text-[10.5px] font-mono font-black">{metrics.phoneUsage}</span>
                </div>
              ) : activeCategory === "blink" ? (
                <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#06b6d4]/50 bg-[#06b6d4]/25 shadow-[0_0_14px_rgba(6,182,212,0.45)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#06b6d4] animate-pulse" />
                  <span className="text-[#06b6d4] text-[10.5px] font-mono font-black">{metrics.blinkRate}</span>
                </div>
              ) : activeCategory === "hydration" ? (
                <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#38bdf8]/50 bg-[#38bdf8]/25 shadow-[0_0_14px_rgba(56,189,248,0.45)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" />
                  <span className="text-[#38bdf8] text-[10.5px] font-mono font-black">{metrics.hydration}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#c084fc]/50 bg-[#c084fc]/25 shadow-[0_0_14px_rgba(192,132,252,0.45)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc] animate-pulse" />
                  <span className="text-[#c084fc] text-[10.5px] font-mono font-black">{metrics.screenTime}</span>
                </div>
              )}
              
              {/* Why Button untuk expand reasoning */}
              {alertReasoning && (
                <button
                  onClick={() => setReasoningExpanded(!reasoningExpanded)}
                  className={`shrink-0 px-2 py-1 rounded-md border transition-all duration-200 text-[10px] font-bold ${
                    reasoningExpanded
                      ? `${severityStyle.border} ${severityStyle.bg} ${severityStyle.text}`
                      : "border-neutral-600/50 bg-neutral-900/50 text-neutral-400 hover:border-neutral-500/70 hover:bg-neutral-800/70"
                  }`}
                  title="Lihat penjelasan keputusan adaptif"
                >
                  {reasoningExpanded ? "✕" : "Why?"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Reasoning Panel Expansion (Phase 4 Explainability) */}
        {widgetState === "alert" && reasoningExpanded && alertReasoning && (
          <div className="w-full px-4 pb-2 z-20 animate-fade-in">
            <div className={`p-2.5 rounded-lg border ${severityStyle.border} ${severityStyle.bg} text-[10px] space-y-1`}>
              <div className="flex items-center justify-between font-bold">
                <span className={severityStyle.text}>LOGIKA KEPUTUSAN</span>
                <span className="text-[9px] text-neutral-400">Baseline Adaptif 7-Hari</span>
              </div>
              <div className="font-mono text-neutral-300 text-[9px] whitespace-pre-wrap leading-relaxed">
                {alertReasoning}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 3. STATE: EXPANDED (Premium Bento Grid + Refined Cyber-Kawaii)          */}
        {/* =================================================================== */}
        {widgetState === "expanded" && (
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="animate-pop-in flex flex-col w-full max-w-[400px] mx-auto gap-5 px-2 pb-5"
          >
            {/* Header: Premium Branding + Better Typography */}
            <div className="flex items-center gap-3.5">
              <div 
                className="relative flex items-center justify-center shrink-0 cursor-pointer group"
                onClick={handleMascotPoke}
                title="Klik untuk poke Pulse! 💖"
              >
                <div className={`absolute w-14 h-14 rounded-full blur-2xl transition-all duration-300 ${
                  mascotPokeActive ? "bg-gradient-to-br from-pink-400 to-red-400/60 scale-125" : "bg-gradient-to-br from-purple-500/40 to-blue-500/20"
                }`} />
                <img 
                  src={mascotImg} 
                  alt="Pulse si maskot jelly lucu" 
                  className={`h-14 w-14 object-contain relative z-10 drop-shadow-[0_0_20px_rgba(192,132,252,0.8)] transition-transform duration-200 group-hover:scale-110 ${
                    mascotPokeActive ? "animate-jelly-poke scale-110" : "animate-breathe"
                  }`} 
                />
                {mascotPokeActive && (
                  <span className="absolute -top-2 -right-2 text-lg animate-pop-in select-none">✨</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <h1 className="font-display text-lg font-black text-white tracking-tight leading-none">NotchPulse</h1>
                  <span className="text-xs font-semibold text-purple-300/70">digital health</span>
                </div>
                <p className="text-xs font-medium text-neutral-400 mt-1">Sahabat sehat digitalmu</p>
              </div>
              <div className="flex items-center gap-2.5 ml-auto">
                <div className="text-right">
                  <span className="block font-mono text-xs font-bold text-neutral-200 tracking-tight">{currentTime}</span>
                  <span className="block text-[10px] font-medium text-neutral-500 mt-0.5">status aktif</span>
                </div>
                <button 
                  onClick={() => setPinned(!pinned)}
                  title={pinned ? "Pinned (Tetap terbuka)" : "Auto-collapse aktif"}
                  className={`p-2 rounded-lg transition-all border backdrop-blur-sm ${
                    pinned 
                      ? "bg-purple-600/30 text-purple-200 border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.35)]" 
                      : "bg-white/5 text-neutral-400 border-white/10 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {pinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Bento Grid 2x2 Doppelrand Glass Cards (Interaktif Click & Hover) */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Card 1: Kedip (Emerald Mint Glow) */}
              <div 
                onClick={() => triggerSimulation("blink")}
                className="stat-card relative group cursor-pointer"
                title="Klik untuk simulasi alert kedipan"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-300 font-display group-hover:text-emerald-300 transition-colors">Kedip</span>
                  <div className="p-1 rounded-full bg-[#22c55e]/15 border border-[#22c55e]/30 group-hover:shadow-[0_0_10px_rgba(34,197,94,0.5)] transition-shadow">
                    <Eye className="h-3 w-3 text-[#22c55e]" />
                  </div>
                </div>
                <p className="font-mono my-0.5 text-base font-extrabold leading-none text-white">{metrics.blinkRate}</p>
                <div>
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8.5px] font-bold border-[#22c55e]/40 bg-[#22c55e]/15 text-[#22c55e]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                    {metrics.blinkStatus}
                  </span>
                </div>
              </div>

              {/* Card 2: Air (Ocean Sky Blue Glow - Interaktif Quick Add) */}
              <div 
                onClick={handleAddWater}
                className="stat-card relative group cursor-pointer"
                title="Klik untuk catat +1 gelas minum air! 💧"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-300 font-display group-hover:text-sky-300 transition-colors">Air (+1 Gelas)</span>
                  <div className="p-1 rounded-full bg-[#38bdf8]/15 border border-[#38bdf8]/30 group-hover:shadow-[0_0_10px_rgba(56,189,248,0.5)] transition-shadow">
                    <Droplets className="h-3 w-3 text-[#38bdf8]" />
                  </div>
                </div>
                <p className="font-mono my-0.5 text-base font-extrabold leading-none text-white flex items-center justify-between">
                  <span>{metrics.hydration}</span>
                  <span className="text-[10px] font-bold text-sky-400 opacity-80 group-hover:opacity-100">+ Minum</span>
                </p>
                <div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8.5px] font-bold ${
                    metrics.hydrationStatus === "Baik" 
                      ? "border-[#22c55e]/40 bg-[#22c55e]/15 text-[#22c55e]" 
                      : "border-[#eab308]/40 bg-[#eab308]/15 text-[#eab308]"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${metrics.hydrationStatus === "Baik" ? "bg-[#22c55e]" : "bg-[#eab308]"} animate-pulse`} />
                    {metrics.hydrationStatus}
                  </span>
                </div>
              </div>

              {/* Card 3: HP (Warm Coral Glow) */}
              <div 
                onClick={() => triggerSimulation("phone")}
                className="stat-card relative group cursor-pointer"
                title="Klik untuk simulasi deteksi HP"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-300 font-display group-hover:text-orange-300 transition-colors">HP</span>
                  <div className="p-1 rounded-full bg-[#f97316]/15 border border-[#f97316]/30 group-hover:shadow-[0_0_10px_rgba(249,115,22,0.5)] transition-shadow">
                    <Timer className="h-3 w-3 text-[#f97316]" />
                  </div>
                </div>
                <p className="font-mono my-0.5 text-base font-extrabold leading-none text-white">{metrics.phoneUsage}</p>
                <div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8.5px] font-bold ${
                    metrics.phoneStatus === "Aman" 
                      ? "border-[#22c55e]/40 bg-[#22c55e]/15 text-[#22c55e]" 
                      : "border-[#f97316]/40 bg-[#f97316]/15 text-[#f97316]"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${metrics.phoneStatus === "Aman" ? "bg-[#22c55e]" : "bg-[#f97316]"} animate-pulse`} />
                    {metrics.phoneStatus}
                  </span>
                </div>
              </div>

              {/* Card 4: Layar (Lavender Violet Glow - Interaktif Break Timer 20-20-20) */}
              <div 
                onClick={handleStartBreak}
                className="stat-card relative group cursor-pointer"
                title={breakTimerActive ? "Klik untuk hentikan timer 20-20-20" : "Klik untuk mulai istirahat 20-20-20"}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-300 font-display group-hover:text-purple-300 transition-colors">
                    {breakTimerActive ? `Istirahat` : "Layar"}
                  </span>
                  <div className={`p-1 rounded-full border transition-all ${
                    breakTimerActive 
                      ? "bg-purple-500/30 border-purple-400 shadow-[0_0_10px_rgba(192,132,252,0.8)]" 
                      : "bg-[#c084fc]/15 border-[#c084fc]/30 group-hover:shadow-[0_0_10px_rgba(192,132,252,0.5)]"
                  }`}>
                    <Monitor className="h-3 w-3 text-[#c084fc]" />
                  </div>
                </div>
                <p className="font-mono my-0.5 text-base font-extrabold leading-none text-white flex items-center justify-between">
                  <span>{breakTimerActive ? `${breakTimerCountdown}s` : metrics.screenTime}</span>
                  <span className={`text-[9px] font-bold ${breakTimerActive ? "text-pink-400 animate-pulse" : "text-purple-400 opacity-80 group-hover:opacity-100"}`}>
                    {breakTimerActive ? "Stop" : "Mulai"}
                  </span>
                </p>
                <div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8.5px] font-bold ${
                    breakTimerActive 
                      ? "border-pink-500/50 bg-pink-500/20 text-pink-300 shadow-[0_0_8px_rgba(244,63,94,0.4)]" 
                      : metrics.screenStatus === "Aman" 
                        ? "border-[#22c55e]/40 bg-[#22c55e]/15 text-[#22c55e]" 
                        : "border-[#c084fc]/40 bg-[#c084fc]/15 text-[#c084fc]"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${breakTimerActive ? "bg-pink-400" : metrics.screenStatus === "Aman" ? "bg-[#22c55e]" : "bg-[#c084fc]"} animate-pulse`} />
                    {breakTimerActive ? "Istirahat" : metrics.screenStatus}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Navigation Footer */}
            <div className="mt-4 pt-3 pb-1 px-2 -mx-2 border-t border-white/8 bg-gradient-to-t from-[#07050e]/95 via-[#0d0c15]/80 to-transparent backdrop-blur-xl -webkit-backdrop-filter-blur-xl flex items-center justify-between gap-1.5 relative z-50 shadow-[0_-8px_24px_rgba(0,0,0,0.6)]">
              <button 
                onClick={() => triggerSimulation("blink")}
                className="flex-1 rounded-full border px-2.5 py-1 text-[9px] font-bold font-display transition-transform hover:scale-105 active:scale-95 border-[#06b6d4]/40 bg-[#06b6d4]/15 text-[#06b6d4]"
              >
                Mata
              </button>
              <button 
                onClick={() => triggerSimulation("phone")}
                className="flex-1 rounded-full border px-2.5 py-1 text-[9px] font-bold font-display transition-transform hover:scale-105 active:scale-95 border-[#f97316]/40 bg-[#f97316]/15 text-[#f97316]"
              >
                HP
              </button>
              <button 
                onClick={handleAddWater}
                className="flex-1 rounded-full border px-2.5 py-1 text-[9px] font-bold font-display transition-transform hover:scale-105 active:scale-95 border-[#38bdf8]/40 bg-[#38bdf8]/15 text-[#38bdf8]"
              >
                + Air
              </button>
              <button 
                onClick={handleStartBreak}
                className={`flex-1 rounded-full border px-2.5 py-1 text-[9px] font-bold font-display transition-transform hover:scale-105 active:scale-95 ${
                  breakTimerActive 
                    ? "border-pink-500/60 bg-pink-500/25 text-pink-300 shadow-[0_0_10px_rgba(244,63,94,0.5)]" 
                    : "border-[#c084fc]/40 bg-[#c084fc]/15 text-[#c084fc]"
                }`}
              >
                {breakTimerActive ? "Stop" : "Break"}
              </button>
              <button 
                onClick={resetToIdle}
                className="rounded-full border border-white/10 bg-white/5 p-1.5 hover:bg-white/15 transition-all active:rotate-180"
                title="Reset ke mode Idle"
              >
                <RefreshCcw className="h-3 w-3 text-neutral-300" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

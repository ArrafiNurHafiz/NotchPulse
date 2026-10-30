import { useState, useEffect, useRef } from "react";
import { 
  Eye, 
  Droplets, 
  Monitor,
  Timer,
  Pin,
  PinOff,
  RefreshCcw,
  TriangleAlert
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import mascotImg from "./assets/island_mascot.png";

type WidgetState = "idle" | "alert" | "expanded";
type AlertCategory = "none" | "blink" | "phone" | "hydration" | "screentime";

interface EventPayload {
  alert_type: string;
  title: string;
  message: string;
  timestamp_ms: number;
}

interface TelemetrySnapshot {
  focus_score: number;
  blink_rate: number;
  screen_time_minutes: number;
  hydration_count: number;
  phone_distraction_seconds: number;
  current_alert: string;
}

export default function App() {
  const [widgetState, setWidgetState] = useState<WidgetState>("idle");
  const [pinned, setPinned] = useState(false);
  const [activeCategory, setActiveCategory] = useState<AlertCategory>("none");
  const [currentTime, setCurrentTime] = useState("09:43");
  const collapseTimerRef = useRef<number | null>(null);

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
    let bounds = { x: 220.0, y: 0.0, width: 200.0, height: 48.0 };
    if (widgetState === "alert") {
      bounds = { x: 130.0, y: 0.0, width: 380.0, height: 48.0 };
    } else if (widgetState === "expanded") {
      bounds = { x: 130.0, y: 0.0, width: 380.0, height: 390.0 };
    }
    invoke("update_notch_bounds", bounds).catch(() => {});
  }, [widgetState]);

  // Listen stream event telemetri riil dari daemon
  useEffect(() => {
    let unlistenEvent: (() => void) | undefined;
    let unlistenTelemetry: (() => void) | undefined;

    invoke<TelemetrySnapshot>("get_current_telemetry")
      .then((data) => {
        if (data) {
          setMetrics(prev => ({
            ...prev,
            focusScore: data.focus_score || 85,
            blinkRate: `${data.blink_rate || 12}/min`,
            screenTime: `${(data.screen_time_minutes || 0) * 60}s`,
            hydration: `${data.hydration_count || 0}x`,
            phoneUsage: `${data.phone_distraction_seconds || 0}s`
          }));
        }
      })
      .catch(() => {});

    listen<EventPayload>("optihabit://event", (event) => {
      const type = event.payload.alert_type.toLowerCase();
      if (type !== "idle" && type !== "none") {
        setWidgetState(prev => (prev === "expanded" || pinned) ? prev : "alert");
        setActiveCategory(type as AlertCategory);
      } else {
        setWidgetState(prev => (prev === "expanded" || pinned) ? prev : "idle");
        setActiveCategory("none");
      }
    }).then(unsub => { unlistenEvent = unsub; });

    listen<TelemetrySnapshot>("optihabit://telemetry", (event) => {
      const data = event.payload;
      setMetrics(prev => ({
        ...prev,
        focusScore: data.focus_score,
        blinkRate: `${data.blink_rate}/min`,
        screenTime: `${data.screen_time_minutes * 60}s`,
        hydration: `${data.hydration_count}x`,
        phoneUsage: `${data.phone_distraction_seconds}s`,
        blinkStatus: data.blink_rate >= 10 ? "Normal" : "Kurang",
        phoneStatus: data.phone_distraction_seconds > 4 ? "Terlalu lama" : "Aman",
        hydrationStatus: data.hydration_count > 0 ? "Baik" : "Perlu minum",
        screenStatus: data.screen_time_minutes >= 20 ? "Perlu istirahat" : "Aman"
      }));
    }).then(unsub => { unlistenTelemetry = unsub; });

    return () => {
      if (unlistenEvent) unlistenEvent();
      if (unlistenTelemetry) unlistenTelemetry();
    };
  }, [pinned]);

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
  const handlePillClick = () => {
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

  return (
    <div 
      className="w-full h-full flex flex-col items-center justify-start select-none pt-0.5"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Dynamic Island Capsule - Desain Playful Lovable Glow */}
      <button 
        aria-label="NotchPulse Dynamic Island"
        onClick={handlePillClick}
        className={`island-shell relative z-20 cursor-pointer overflow-hidden flex flex-col items-center text-left ${
          widgetState === "idle"
            ? "island-shell-idle h-12 w-48 rounded-full px-4 py-1.5 justify-center"
            : widgetState === "alert"
              ? "island-shell-alert h-12 w-[380px] rounded-full px-4 py-1.5 justify-center"
              : "island-shell-expanded w-[380px] min-h-[380px] rounded-[2.2rem] px-5 pt-3.5 pb-6"
        }`}
      >
        {/* =================================================================== */}
        {/* 1. STATE: IDLE (h-12 w-48 rounded-full - Maskot Jelly & Waveform)   */}
        {/* =================================================================== */}
        {widgetState === "idle" && (
          <div className="w-full flex items-center justify-between z-10 px-1">
            {/* Kiri: Maskot Jelly Pulse Mini Lucu */}
            <div className="flex items-center gap-1.5 pl-0.5">
              <img 
                src={mascotImg} 
                alt="Pulse Maskot" 
                className="w-7 h-7 object-contain animate-breathe drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" 
              />
              <span className="text-xs font-bold text-white tracking-wide font-display">Pulse</span>
            </div>

            {/* Kanan: Equalizer Waveform Ungu Neon dengan Safe Padding */}
            <div className="flex items-center gap-1 pr-1.5">
              <div className="flex items-end gap-1 h-3.5 text-[#c084fc]">
                <span className="w-1 bg-[#c084fc] rounded-full h-2 animate-pulse" />
                <span className="w-1 bg-[#c084fc] rounded-full h-3.5 animate-pulse" style={{ animationDelay: "150ms" }} />
                <span className="w-1 bg-[#c084fc] rounded-full h-2.5 animate-pulse" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 2. STATE: ALERT (Pill Meluas dengan 3 Sub-Pill Warna-Warni)         */}
        {/* =================================================================== */}
        {widgetState === "alert" && (
          <div className="w-full flex items-center justify-between gap-1.5 text-[11px] z-10">
            {/* Sub-Pill 1: Mata (Biru Toska / Cyan) */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border shadow-[0_0_8px_rgba(6,182,212,0.25)] flex-1 justify-center transition-all ${
              activeCategory === "blink" ? "bg-[#06B6D4]/30 border-[#06B6D4]" : "bg-[#06B6D4]/15 border-[#06B6D4]/35"
            }`}>
              <Eye className="w-3.5 h-3.5 text-[#06B6D4] shrink-0" />
              <span className="text-neutral-200 font-medium">Mata</span>
              <span className="text-[#06B6D4] text-[10px] font-bold">{metrics.blinkRate}</span>
            </div>

            {/* Sub-Pill 2: HP (Oranye) */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border shadow-[0_0_8px_rgba(249,115,22,0.25)] flex-1 justify-center transition-all ${
              activeCategory === "phone" ? "bg-[#F97316]/30 border-[#F97316]" : "bg-[#F97316]/15 border-[#F97316]/35"
            }`}>
              <Timer className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
              <span className="text-neutral-200 font-medium">HP</span>
              <span className="text-[#F97316] text-[10px] font-bold">{metrics.phoneUsage}</span>
            </div>

            {/* Sub-Pill 3: Air (Biru Langit) */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border shadow-[0_0_8px_rgba(56,189,248,0.25)] flex-1 justify-center transition-all ${
              activeCategory === "hydration" ? "bg-[#38bdf8]/30 border-[#38bdf8]" : "bg-[#38bdf8]/15 border-[#38bdf8]/35"
            }`}>
              <Droplets className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
              <span className="text-neutral-200 font-medium">Air</span>
              <span className="text-[#38bdf8] text-[10px] font-bold">{metrics.hydration}</span>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 3. STATE: EXPANDED (Card Grid 2x2 Sesuai Lovable Playful Island)    */}
        {/* =================================================================== */}
        {widgetState === "expanded" && (
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="animate-pop-in flex flex-col w-full gap-2"
          >
            {/* Header: Maskot Pulse, Title, Jam, Pin Toggle */}
            <div className="flex items-center gap-2 pb-1">
              <img 
                src={mascotImg} 
                alt="Pulse si maskot jelly lucu" 
                className="h-8 w-8 shrink-0 object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.6)] animate-breathe" 
              />
              <div className="min-w-0 flex-1">
                <p className="font-display text-xs font-extrabold leading-tight text-white tracking-wide">NotchPulse</p>
                <p className="truncate text-[8px] font-semibold text-neutral-400">Dynamic Island Overlay</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xs font-bold text-neutral-200">{currentTime}</span>
                <button 
                  onClick={() => setPinned(!pinned)}
                  title={pinned ? "Pinned (Tetap terbuka)" : "Auto-collapse aktif"}
                  className={`p-1.5 rounded-full transition-colors border ${
                    pinned 
                      ? "bg-[#8B5CF6]/30 text-[#c084fc] border-[#8B5CF6]/60 shadow-[0_0_10px_rgba(139,92,246,0.5)]" 
                      : "bg-white/5 text-neutral-400 border-white/10 hover:text-white"
                  }`}
                >
                  {pinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* Grid 2x2 Stat Cards Sesuai Lovable Playful Island */}
            <div className="grid grid-cols-2 gap-2">
              {/* Card 1: Kedip (Ok / Hijau) */}
              <div className="stat-card relative rounded-xl p-2 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-neutral-400">Kedip</span>
                  <Eye className="h-3 w-3 text-[#22c55e]" />
                </div>
                <p className="font-display my-0.5 text-sm font-extrabold leading-none text-white font-mono">{metrics.blinkRate}</p>
                <div>
                  <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[8px] font-bold border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]">
                    <TriangleAlert className="h-2 w-2" />
                    {metrics.blinkStatus}
                  </span>
                </div>
              </div>

              {/* Card 2: Air (Warn / Kuning Oranye) */}
              <div className="stat-card relative rounded-xl p-2 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-neutral-400">Air</span>
                  <Droplets className="h-3 w-3 text-[#eab308]" />
                </div>
                <p className="font-display my-0.5 text-sm font-extrabold leading-none text-white font-mono">{metrics.hydration}</p>
                <div>
                  <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[8px] font-bold ${
                    metrics.hydrationStatus === "Baik" 
                      ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]" 
                      : "border-[#eab308]/40 bg-[#eab308]/10 text-[#eab308]"
                  }`}>
                    <TriangleAlert className="h-2 w-2" />
                    {metrics.hydrationStatus}
                  </span>
                </div>
              </div>

              {/* Card 3: HP (Alert / Oranye) */}
              <div className="stat-card relative rounded-xl p-2 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-neutral-400">HP</span>
                  <Timer className="h-3 w-3 text-[#f97316]" />
                </div>
                <p className="font-display my-0.5 text-sm font-extrabold leading-none text-white font-mono">{metrics.phoneUsage}</p>
                <div>
                  <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[8px] font-bold ${
                    metrics.phoneStatus === "Aman" 
                      ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]" 
                      : "border-[#f97316]/40 bg-[#f97316]/10 text-[#f97316]"
                  }`}>
                    <TriangleAlert className="h-2 w-2" />
                    {metrics.phoneStatus}
                  </span>
                </div>
              </div>

              {/* Card 4: Layar (Rest / Ungu Neon) */}
              <div className="stat-card relative rounded-xl p-2 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-neutral-400">Layar</span>
                  <Monitor className="h-3 w-3 text-[#c084fc]" />
                </div>
                <p className="font-display my-0.5 text-sm font-extrabold leading-none text-white font-mono">{metrics.screenTime}</p>
                <div>
                  <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[8px] font-bold ${
                    metrics.screenStatus === "Aman" 
                      ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]" 
                      : "border-[#c084fc]/40 bg-[#c084fc]/10 text-[#c084fc]"
                  }`}>
                    <TriangleAlert className="h-2 w-2" />
                    {metrics.screenStatus}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Navigation Footer - Safe Inset */}
            <div className="mt-3 flex items-center justify-center gap-2 px-1 pb-1">
              <button 
                onClick={() => triggerSimulation("blink")}
                className="rounded-full border px-3 py-1 text-[9px] font-bold transition-transform hover:scale-105 active:scale-95 border-[#06b6d4]/40 bg-[#06b6d4]/10 text-[#06b6d4]"
              >
                Mata
              </button>
              <button 
                onClick={() => triggerSimulation("phone")}
                className="rounded-full border px-3 py-1 text-[9px] font-bold transition-transform hover:scale-105 active:scale-95 border-[#f97316]/40 bg-[#f97316]/10 text-[#f97316]"
              >
                HP
              </button>
              <button 
                onClick={() => triggerSimulation("hydration")}
                className="rounded-full border px-3 py-1 text-[9px] font-bold transition-transform hover:scale-105 active:scale-95 border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8]"
              >
                Air
              </button>
              <button 
                onClick={() => triggerSimulation("screentime")}
                className="rounded-full border px-3 py-1 text-[9px] font-bold transition-transform hover:scale-105 active:scale-95 border-[#c084fc]/40 bg-[#c084fc]/10 text-[#c084fc]"
              >
                Layar
              </button>
              <button 
                onClick={resetToIdle}
                className="rounded-full border border-white/10 bg-white/5 p-1.5 hover:bg-white/15 transition-colors"
                title="Reset ke mode Idle"
              >
                <RefreshCcw className="h-3.5 w-3.5 text-neutral-300" />
              </button>
            </div>
          </div>
        )}
      </button>
    </div>
  );
}

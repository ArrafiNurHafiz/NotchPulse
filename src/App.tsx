import { useState, useEffect, useRef } from "react";
import { 
  Eye, 
  Droplets, 
  Monitor,
  Timer,
  Pin,
  PinOff,
  RefreshCcw,
  Sparkles
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
  const [widgetState, setWidgetState] = useState<WidgetState>("expanded");
  const [pinned, setPinned] = useState(true);
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
    let bounds = { x: 180.0, y: 0.0, width: 280.0, height: 56.0 };
    if (widgetState === "alert") {
      bounds = { x: 135.0, y: 0.0, width: 370.0, height: 56.0 };
    } else if (widgetState === "expanded") {
      bounds = { x: 115.0, y: 0.0, width: 410.0, height: 265.0 };
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
      {/* Dynamic Island Capsule - Desain Playful Jelly Glass */}
      <div 
        role="button"
        tabIndex={0}
        aria-label="NotchPulse Dynamic Island"
        onClick={handlePillClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handlePillClick(); }}
        className={`island-shell relative z-20 cursor-pointer overflow-hidden flex flex-col items-center text-left ${
          widgetState === "idle"
            ? "island-shell-idle h-14 w-[280px] rounded-full justify-center"
            : widgetState === "alert"
              ? "island-shell-alert h-14 w-[370px] rounded-full justify-center"
              : "island-shell-expanded w-[410px] h-auto rounded-[2.2rem] px-5 pt-3.5 pb-4"
        }`}
      >
        {/* =================================================================== */}
        {/* 1. STATE: IDLE (h-14 w-[280px] rounded-full - Maskot Jelly & Waveform) */}
        {/* =================================================================== */}
        {widgetState === "idle" && (
          <div 
            className="w-full flex items-center justify-between z-10"
            style={{ paddingLeft: "22px", paddingRight: "32px" }}
          >
            {/* Kiri: Maskot Jelly Pulse Mini Lucu */}
            <div className="flex items-center gap-2.5">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-7 h-7 bg-purple-500/30 rounded-full blur-md animate-soft-glow" />
                <img 
                  src={mascotImg} 
                  alt="Pulse Maskot Jelly" 
                  className="w-8 h-8 object-contain relative z-10 animate-breathe drop-shadow-[0_0_10px_rgba(168,85,247,0.6)]" 
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-black text-white tracking-wide font-display">Pulse</span>
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
            className="w-full h-full flex items-center justify-between z-10 px-3.5"
          >
            {/* Kiri: Maskot Jelly Pulse Mini dengan Animasi */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-8 h-8 bg-pink-500/35 rounded-full blur-md animate-soft-glow" />
                <img 
                  src={mascotImg} 
                  alt="Pulse Maskot" 
                  className="w-8 h-8 object-contain relative z-10 animate-breathe drop-shadow-[0_0_10px_rgba(244,63,94,0.6)]" 
                />
              </div>
            </div>

            {/* Tengah: Pesan Status Dinamis Banner */}
            <div className="min-w-0 flex-1 px-2.5">
              {activeCategory === "phone" ? (
                <div>
                  <p className="font-display text-[11px] font-black leading-tight text-[#f97316] tracking-wide truncate">
                    HP Terlalu Lama!
                  </p>
                  <p className="truncate text-[8.5px] font-semibold text-neutral-300">
                    Yuk istirahat sejenak 📱
                  </p>
                </div>
              ) : activeCategory === "blink" ? (
                <div>
                  <p className="font-display text-[11px] font-black leading-tight text-[#06b6d4] tracking-wide truncate">
                    Kedip Matamu!
                  </p>
                  <p className="truncate text-[8.5px] font-semibold text-neutral-300">
                    Cegah mata lelah & kering 👀
                  </p>
                </div>
              ) : activeCategory === "hydration" ? (
                <div>
                  <p className="font-display text-[11px] font-black leading-tight text-[#38bdf8] tracking-wide truncate">
                    Waktunya Minum Air!
                  </p>
                  <p className="truncate text-[8.5px] font-semibold text-neutral-300">
                    Jaga hidrasi & fokus tubuh 💧
                  </p>
                </div>
              ) : activeCategory === "screentime" ? (
                <div>
                  <p className="font-display text-[11px] font-black leading-tight text-[#c084fc] tracking-wide truncate">
                    Aturan 20-20-20!
                  </p>
                  <p className="truncate text-[8.5px] font-semibold text-neutral-300">
                    Lihat objek jauh 20 detik 🌿
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-display text-[11px] font-black leading-tight text-purple-300 tracking-wide truncate">
                    NotchPulse Siaga
                  </p>
                  <p className="truncate text-[8.5px] font-semibold text-neutral-300">
                    Memantau pola sehatmu ✨
                  </p>
                </div>
              )}
            </div>

            {/* Kanan: Badge Metrik Aktif dengan Dot Berdenyut */}
            <div className="shrink-0">
              {activeCategory === "phone" ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#f97316]/50 bg-[#f97316]/20 shadow-[0_0_12px_rgba(249,115,22,0.4)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f97316] animate-pulse" />
                  <span className="text-[#f97316] text-[10px] font-mono font-black">{metrics.phoneUsage}</span>
                </div>
              ) : activeCategory === "blink" ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#06b6d4]/50 bg-[#06b6d4]/20 shadow-[0_0_12px_rgba(6,182,212,0.4)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#06b6d4] animate-pulse" />
                  <span className="text-[#06b6d4] text-[10px] font-mono font-black">{metrics.blinkRate}</span>
                </div>
              ) : activeCategory === "hydration" ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#38bdf8]/50 bg-[#38bdf8]/20 shadow-[0_0_12px_rgba(56,189,248,0.4)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" />
                  <span className="text-[#38bdf8] text-[10px] font-mono font-black">{metrics.hydration}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#c084fc]/50 bg-[#c084fc]/20 shadow-[0_0_12px_rgba(192,132,252,0.4)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc] animate-pulse" />
                  <span className="text-[#c084fc] text-[10px] font-mono font-black">{metrics.screenTime}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 3. STATE: EXPANDED (Bento Grid 2x2 Doppelrand Glass)                */}
        {/* =================================================================== */}
        {widgetState === "expanded" && (
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="animate-pop-in flex flex-col w-full max-w-[370px] mx-auto gap-2.5"
          >
            {/* Header: Maskot Pulse Lucu, Title & Tagline, Jam, Pin Toggle */}
            <div className="flex items-center gap-2.5 pb-0.5">
              <div className="relative flex items-center justify-center shrink-0">
                <div className="absolute w-9 h-9 bg-purple-500/35 rounded-full blur-md animate-soft-glow" />
                <img 
                  src={mascotImg} 
                  alt="Pulse si maskot jelly lucu" 
                  className="h-9 w-9 object-contain relative z-10 drop-shadow-[0_0_12px_rgba(168,85,247,0.7)] animate-breathe" 
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-display text-sm font-black text-white tracking-wide">NotchPulse</p>
                  <Sparkles className="w-3 h-3 text-pink-400" />
                </div>
                <p className="text-[9px] font-semibold text-purple-200/75 tracking-wide">Sahabat Sehat Digitalmu</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-neutral-200 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">{currentTime}</span>
                <button 
                  onClick={() => setPinned(!pinned)}
                  title={pinned ? "Pinned (Tetap terbuka)" : "Auto-collapse aktif"}
                  className={`p-1.5 rounded-full transition-all border ${
                    pinned 
                      ? "bg-purple-600/30 text-purple-300 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.5)]" 
                      : "bg-white/5 text-neutral-400 border-white/10 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {pinned ? <Pin className="w-3 h-3 text-pink-400" /> : <PinOff className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* Bento Grid 2x2 Doppelrand Glass Cards */}
            <div className="grid grid-cols-2 gap-2">
              {/* Card 1: Kedip (Emerald Mint Glow) */}
              <div className="stat-card relative rounded-2xl p-2.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-300 font-display">Kedip</span>
                  <div className="p-1 rounded-full bg-[#22c55e]/15 border border-[#22c55e]/30">
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

              {/* Card 2: Air (Ocean Sky Blue Glow) */}
              <div className="stat-card relative rounded-2xl p-2.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-300 font-display">Air</span>
                  <div className="p-1 rounded-full bg-[#38bdf8]/15 border border-[#38bdf8]/30">
                    <Droplets className="h-3 w-3 text-[#38bdf8]" />
                  </div>
                </div>
                <p className="font-mono my-0.5 text-base font-extrabold leading-none text-white">{metrics.hydration}</p>
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
              <div className="stat-card relative rounded-2xl p-2.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-300 font-display">HP</span>
                  <div className="p-1 rounded-full bg-[#f97316]/15 border border-[#f97316]/30">
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

              {/* Card 4: Layar (Lavender Violet Glow) */}
              <div className="stat-card relative rounded-2xl p-2.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-300 font-display">Layar</span>
                  <div className="p-1 rounded-full bg-[#c084fc]/15 border border-[#c084fc]/30">
                    <Monitor className="h-3 w-3 text-[#c084fc]" />
                  </div>
                </div>
                <p className="font-mono my-0.5 text-base font-extrabold leading-none text-white">{metrics.screenTime}</p>
                <div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8.5px] font-bold ${
                    metrics.screenStatus === "Aman" 
                      ? "border-[#22c55e]/40 bg-[#22c55e]/15 text-[#22c55e]" 
                      : "border-[#c084fc]/40 bg-[#c084fc]/15 text-[#c084fc]"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${metrics.screenStatus === "Aman" ? "bg-[#22c55e]" : "bg-[#c084fc]"} animate-pulse`} />
                    {metrics.screenStatus}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Navigation Footer */}
            <div className="mt-1 flex items-center justify-between gap-1.5 pt-0.5">
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
                onClick={() => triggerSimulation("hydration")}
                className="flex-1 rounded-full border px-2.5 py-1 text-[9px] font-bold font-display transition-transform hover:scale-105 active:scale-95 border-[#38bdf8]/40 bg-[#38bdf8]/15 text-[#38bdf8]"
              >
                Air
              </button>
              <button 
                onClick={() => triggerSimulation("screentime")}
                className="flex-1 rounded-full border px-2.5 py-1 text-[9px] font-bold font-display transition-transform hover:scale-105 active:scale-95 border-[#c084fc]/40 bg-[#c084fc]/15 text-[#c084fc]"
              >
                Layar
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

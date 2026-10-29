import { useState, useEffect, useRef } from "react";
import { 
  Eye, 
  Smartphone, 
  Droplets, 
  Monitor,
  Pin,
  PinOff,
  Activity,
  AudioWaveform,
  RotateCcw
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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
  const [currentTime, setCurrentTime] = useState("10:24");
  const collapseTimerRef = useRef<number | null>(null);

  // Data telemetri real-time sesuai spesifikasi kartu metrik
  const [metrics, setMetrics] = useState({
    focusScore: 85,
    blinkRate: "12/min",
    blinkStatus: "Normal",
    hydration: "60+ min",
    hydrationStatus: "Baik",
    phoneUsage: "08/15 min",
    phoneStatus: "Terlalu lama",
    screenTime: "1200s",
    screenStatus: "Perlu istirahat"
  });

  // Jam lokal digital
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateClock();
    const interval = setInterval(updateClock, 10000);
    return () => clearInterval(interval);
  }, []);

  // Listen stream event dari backend Rust
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
            screenTime: `${(data.screen_time_minutes || 20) * 60}s`,
            hydration: `${data.hydration_count ? data.hydration_count * 30 : 60}+ min`,
            phoneUsage: `${data.phone_distraction_seconds ? Math.round(data.phone_distraction_seconds / 60) : 8}/15 min`
          }));
        }
      })
      .catch(() => {});

    listen<EventPayload>("optihabit://event", (event) => {
      const type = event.payload.alert_type.toLowerCase();
      if (type !== "idle" && type !== "none") {
        setWidgetState("alert");
        setActiveCategory(type as AlertCategory);
      } else {
        if (!pinned) setWidgetState("idle");
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
        phoneUsage: `${Math.round(data.phone_distraction_seconds / 60)}/15 min`
      }));
    }).then(unsub => { unlistenTelemetry = unsub; });

    return () => {
      if (unlistenEvent) unlistenEvent();
      if (unlistenTelemetry) unlistenTelemetry();
    };
  }, [pinned]);

  // Behavior: Auto-collapse 1.5 detik saat kursor keluar (jika tidak di-pin)
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
      }, 1500);
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
      className="w-full flex flex-col items-center justify-start select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Dynamic Island Capsule - Top Bezel */}
      <div 
        onClick={handlePillClick}
        className={`notch-shell cursor-pointer overflow-hidden flex flex-col items-center ${
          widgetState === "idle"
            ? "w-[220px] notch-glow-idle py-1.5 px-3.5"
            : widgetState === "alert"
              ? "w-[350px] notch-glow-alert py-1.5 px-3"
              : "w-[410px] notch-glow-expanded p-3.5"
        }`}
      >
        {/* =================================================================== */}
        {/* 1. STATE: IDLE (Lebar: 220px, Border/Glow: Hijau #22C55E)           */}
        {/* =================================================================== */}
        {widgetState === "idle" && (
          <div className="w-full flex items-center justify-between">
            {/* Kiri: Ikon Daun / Fokus */}
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-[#22C55E]/20 flex items-center justify-center border border-[#22C55E]/40">
                <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E] animate-pulse" />
              </div>
              <span className="text-xs font-semibold text-white tracking-wide">Fokus</span>
            </div>

            {/* Tengah/Kanan: Skor 85 & Gelombang Audio Hijau */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-300">Skor {metrics.focusScore}</span>
              <div className="flex items-center gap-0.5 text-[#22C55E]">
                <AudioWaveform className="w-4 h-4 animate-pulse" />
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 2. STATE: ALERT (Lebar: 350px, Border/Glow: Oranye #F97316)          */}
        {/* =================================================================== */}
        {widgetState === "alert" && (
          <div className="w-full flex items-center justify-between gap-1 text-[11px]">
            {/* Sub-Pill 1: Mata (Biru Toska / Cyan #06B6D4) */}
            <div className="flex items-center gap-1.5 bg-[#06B6D4]/10 border border-[#06B6D4]/30 px-2 py-0.5 rounded-full">
              <Eye className="w-3.5 h-3.5 text-[#06B6D4]" />
              <span className="text-neutral-300 font-medium">Mata</span>
              <span className="text-[#06B6D4] text-[10px] font-semibold">Terlalu lama</span>
            </div>

            {/* Sub-Pill 2: HP (Oranye #F97316) */}
            <div className="flex items-center gap-1.5 bg-[#F97316]/10 border border-[#F97316]/30 px-2 py-0.5 rounded-full">
              <Smartphone className="w-3.5 h-3.5 text-[#F97316]" />
              <span className="text-neutral-300 font-medium">HP</span>
              <span className="text-[#F97316] text-[10px] font-semibold">5m</span>
            </div>

            {/* Sub-Pill 3: Air (Biru Toska / Cyan #06B6D4) */}
            <div className="flex items-center gap-1.5 bg-[#06B6D4]/10 border border-[#06B6D4]/30 px-2 py-0.5 rounded-full">
              <Droplets className="w-3.5 h-3.5 text-[#06B6D4]" />
              <span className="text-neutral-300 font-medium">Air</span>
              <span className="text-[#06B6D4] text-[10px] font-semibold">~1h</span>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 3. STATE: EXPANDED (Lebar: 410px, Border/Glow: Ungu #8B5CF6)        */}
        {/* =================================================================== */}
        {widgetState === "expanded" && (
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="w-full flex flex-col gap-3"
          >
            {/* Header: Logo, Nama, Jam Digital, dan Pin Toggle */}
            <div className="w-full flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center text-[#8B5CF6]">
                  <Activity className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white tracking-wide">NotchPulse</span>
                  <span className="text-[9px] text-neutral-400">Dynamic Island Overlay</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-medium text-neutral-300">{currentTime}</span>
                <button 
                  onClick={() => setPinned(!pinned)}
                  title={pinned ? "Pinned (Tetap terbuka)" : "Auto-collapse 1.5s aktif"}
                  className={`p-1.5 rounded-lg transition-colors border ${
                    pinned 
                      ? "bg-[#8B5CF6]/20 text-[#8B5CF6] border-[#8B5CF6]/50 shadow-[0_0_10px_rgba(139,92,246,0.3)]" 
                      : "bg-white/5 text-neutral-400 border-white/10 hover:text-white"
                  }`}
                >
                  {pinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Grid 2x2 Kartu Metrik Sesuai Desain */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Card 1: Kedip (Biru Toska / Cyan) */}
              <div className="bg-[#121319] p-2.5 rounded-xl border border-white/5 flex flex-col gap-1 hover:border-[#06B6D4]/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-neutral-300">Kedip</span>
                  <Eye className="w-3.5 h-3.5 text-[#06B6D4]" />
                </div>
                <div className="text-base font-extrabold text-white">{metrics.blinkRate}</div>
                <div className="flex items-center gap-1 text-[10px] text-[#22C55E] font-medium">
                  <span>▲</span>
                  <span>Normal</span>
                </div>
              </div>

              {/* Card 2: Air (Biru Toska / Cyan) */}
              <div className="bg-[#121319] p-2.5 rounded-xl border border-white/5 flex flex-col gap-1 hover:border-[#06B6D4]/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-neutral-300">Air</span>
                  <Droplets className="w-3.5 h-3.5 text-[#06B6D4]" />
                </div>
                <div className="text-base font-extrabold text-white">{metrics.hydration}</div>
                <div className="flex items-center gap-1 text-[10px] text-[#22C55E] font-medium">
                  <span>▲</span>
                  <span>Baik</span>
                </div>
              </div>

              {/* Card 3: HP (Oranye #F97316) */}
              <div className="bg-[#121319] p-2.5 rounded-xl border border-white/5 flex flex-col gap-1 hover:border-[#F97316]/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-neutral-300">HP</span>
                  <Smartphone className="w-3.5 h-3.5 text-[#F97316]" />
                </div>
                <div className="text-base font-extrabold text-white">{metrics.phoneUsage}</div>
                <div className="flex items-center gap-1 text-[10px] text-[#F97316] font-medium">
                  <span>▲</span>
                  <span>Terlalu lama</span>
                </div>
              </div>

              {/* Card 4: Layar (Ungu #8B5CF6) */}
              <div className="bg-[#121319] p-2.5 rounded-xl border border-white/5 flex flex-col gap-1 hover:border-[#8B5CF6]/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-neutral-300">Layar</span>
                  <Monitor className="w-3.5 h-3.5 text-[#8B5CF6]" />
                </div>
                <div className="text-base font-extrabold text-white">{metrics.screenTime}</div>
                <div className="flex items-center gap-1 text-[10px] text-[#FBBF24] font-medium">
                  <span>▲</span>
                  <span>Perlu istirahat</span>
                </div>
              </div>
            </div>

            {/* Quick Simulation / State Testing Footer */}
            <div className="w-full flex items-center justify-between gap-1 pt-1 border-t border-white/10 text-[10px]">
              <button 
                onClick={() => triggerSimulation("blink")}
                className="flex-1 py-1 bg-[#06B6D4]/15 hover:bg-[#06B6D4]/30 border border-[#06B6D4]/30 rounded-lg text-[#06B6D4] font-medium transition-colors"
              >
                Mata
              </button>
              <button 
                onClick={() => triggerSimulation("phone")}
                className="flex-1 py-1 bg-[#F97316]/15 hover:bg-[#F97316]/30 border border-[#F97316]/30 rounded-lg text-[#F97316] font-medium transition-colors"
              >
                HP
              </button>
              <button 
                onClick={() => triggerSimulation("hydration")}
                className="flex-1 py-1 bg-[#06B6D4]/15 hover:bg-[#06B6D4]/30 border border-[#06B6D4]/30 rounded-lg text-[#06B6D4] font-medium transition-colors"
              >
                Air
              </button>
              <button 
                onClick={() => triggerSimulation("screentime")}
                className="flex-1 py-1 bg-[#8B5CF6]/15 hover:bg-[#8B5CF6]/30 border border-[#8B5CF6]/30 rounded-lg text-[#8B5CF6] font-medium transition-colors"
              >
                Layar
              </button>
              <button 
                onClick={resetToIdle}
                className="px-2 py-1 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-neutral-300 transition-colors flex items-center gap-1"
                title="Kembali ke State Idle"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

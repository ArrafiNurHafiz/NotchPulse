import { useState, useEffect, useRef } from "react";
import { 
  Eye, 
  Smartphone, 
  Droplets, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck,
  Sparkles,
  RotateCcw
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type AlertType = "idle" | "blink" | "phone" | "hydration" | "screentime";

interface EventPayload {
  alert_type: AlertType;
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
  current_alert: AlertType;
}

export default function App() {
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [alertType, setAlertType] = useState<AlertType>("idle");
  const [alertMessage, setAlertMessage] = useState("");
  const collapseTimerRef = useRef<number | null>(null);
  
  // Real-time telemetry metrics state
  const [metrics, setMetrics] = useState<TelemetrySnapshot>({
    focus_score: 95,
    blink_rate: 16,
    screen_time_minutes: 25,
    hydration_count: 2,
    phone_distraction_seconds: 10,
    current_alert: "idle",
  });

  // Listen to live Rust backend vision stream events
  useEffect(() => {
    let unlistenEvent: (() => void) | undefined;
    let unlistenTelemetry: (() => void) | undefined;

    invoke<TelemetrySnapshot>("get_current_telemetry")
      .then((data) => {
        if (data) {
          setMetrics(data);
          setAlertType(data.current_alert);
        }
      })
      .catch(() => {});

    listen<EventPayload>("optihabit://event", (event) => {
      setAlertType(event.payload.alert_type);
      setAlertMessage(event.payload.message);
    }).then((unsub) => {
      unlistenEvent = unsub;
    });

    listen<TelemetrySnapshot>("optihabit://telemetry", (event) => {
      setMetrics(event.payload);
      setAlertType(event.payload.current_alert);
    }).then((unsub) => {
      unlistenTelemetry = unsub;
    });

    return () => {
      if (unlistenEvent) unlistenEvent();
      if (unlistenTelemetry) unlistenTelemetry();
    };
  }, []);

  // Coucou-style hover auto-expand & auto-collapse
  const handleMouseEnter = () => {
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    if (!pinned && expanded) {
      collapseTimerRef.current = window.setTimeout(() => {
        setExpanded(false);
      }, 1500);
    }
  };

  const toggleExpand = () => {
    setExpanded(!expanded);
  };

  const triggerSimulation = async (type: string) => {
    try {
      await invoke("simulate_vision_trigger", { triggerType: type });
    } catch {
      setAlertType(type as AlertType);
    }
  };

  const resetAlert = async () => {
    try {
      await invoke("simulate_vision_trigger", { triggerType: "idle" });
    } catch {
      setAlertType("idle");
      setAlertMessage("");
    }
  };

  return (
    <div 
      className="w-full flex flex-col items-center justify-start select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Coucou-inspired Notch Island */}
      <div 
        onClick={toggleExpand}
        className={`spring-transition cursor-pointer island-notch-top overflow-hidden flex flex-col items-center ${
          expanded 
            ? "w-[410px] bg-black/95 text-white p-4" 
            : alertType !== "idle"
              ? "w-[350px] bg-black/95 text-white py-1.5 px-3.5"
              : "w-[220px] bg-black/95 hover:bg-neutral-900 text-neutral-300 py-1.5 px-3.5"
        }`}
      >
        {/* Compact / Collapsed Header */}
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            {alertType === "idle" && (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span className="text-xs font-semibold tracking-wider text-neutral-200">NotchPulse</span>
              </>
            )}

            {alertType === "blink" && (
              <>
                <Eye className="w-4 h-4 text-cyan-400 animate-bounce" />
                <span className="text-xs font-medium text-cyan-200">
                  {alertMessage || "Kedipkan mata sejenak"}
                </span>
              </>
            )}

            {alertType === "phone" && (
              <>
                <Smartphone className="w-4 h-4 text-amber-400 animate-pulse" />
                <span className="text-xs font-medium text-amber-200">
                  {alertMessage || "Distraksi HP terdeteksi"}
                </span>
              </>
            )}

            {alertType === "hydration" && (
              <>
                <Droplets className="w-4 h-4 text-blue-400 animate-pulse" />
                <span className="text-xs font-medium text-blue-200">
                  {alertMessage || "Waktunya minum air"}
                </span>
              </>
            )}

            {alertType === "screentime" && (
              <>
                <Clock className="w-4 h-4 text-purple-400 animate-spin" />
                <span className="text-xs font-medium text-purple-200">
                  {alertMessage || "Jeda 20-20-20!"}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-400">
            {alertType === "idle" && !expanded && (
              <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded-full text-emerald-400 font-bold border border-emerald-500/20">
                {metrics.focus_score}%
              </span>
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-neutral-400 hover:text-white transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 text-neutral-400 hover:text-white transition-colors" />
            )}
          </div>
        </div>

        {/* Expanded Dashboard Panel (Coucou Card Architecture) */}
        {expanded && (
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="w-full mt-3.5 pt-3 border-t border-white/10 flex flex-col gap-3"
          >
            {/* Header Status & Pin Toggle */}
            <div className="flex items-center justify-between text-[11px] text-neutral-400 px-0.5">
              <div className="flex items-center gap-1.5 text-neutral-300">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-medium">Wellness Telemetry</span>
              </div>
              <button 
                onClick={() => setPinned(!pinned)}
                className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${
                  pinned 
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                    : "bg-white/5 text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {pinned ? "Pinned" : "Auto-collapse"}
              </button>
            </div>

            {/* 4-Stat Metric Grid */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-white/5 p-2 rounded-xl border border-white/5 hover:bg-white/[0.08] transition-colors">
                <div className="flex justify-center text-cyan-400 mb-1"><Eye className="w-3.5 h-3.5" /></div>
                <div className="text-xs font-bold text-neutral-100">{metrics.blink_rate}/m</div>
                <div className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium">Kedip</div>
              </div>

              <div className="bg-white/5 p-2 rounded-xl border border-white/5 hover:bg-white/[0.08] transition-colors">
                <div className="flex justify-center text-blue-400 mb-1"><Droplets className="w-3.5 h-3.5" /></div>
                <div className="text-xs font-bold text-neutral-100">{metrics.hydration_count}x</div>
                <div className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium">Air</div>
              </div>

              <div className="bg-white/5 p-2 rounded-xl border border-white/5 hover:bg-white/[0.08] transition-colors">
                <div className="flex justify-center text-amber-400 mb-1"><Smartphone className="w-3.5 h-3.5" /></div>
                <div className="text-xs font-bold text-neutral-100">{metrics.phone_distraction_seconds}s</div>
                <div className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium">Ponsel</div>
              </div>

              <div className="bg-white/5 p-2 rounded-xl border border-white/5 hover:bg-white/[0.08] transition-colors">
                <div className="flex justify-center text-purple-400 mb-1"><Clock className="w-3.5 h-3.5" /></div>
                <div className="text-xs font-bold text-neutral-100">{metrics.screen_time_minutes}m</div>
                <div className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium">Layar</div>
              </div>
            </div>

            {/* Privacy Badge */}
            <div className="flex items-center justify-between text-[11px] text-neutral-400 px-0.5">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="text-[10px]">100% On-Device & Private</span>
              </div>
              <span className="font-mono text-neutral-500 text-[9px]">v0.1.2-coucou-style</span>
            </div>

            {/* Quick Simulation Trigger Buttons */}
            <div className="pt-1 flex items-center justify-between gap-1.5 text-[10px]">
              <button 
                onClick={() => triggerSimulation("blink")}
                className="flex-1 py-1 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/40 rounded-lg text-cyan-300 transition-colors"
              >
                Mata
              </button>
              <button 
                onClick={() => triggerSimulation("phone")}
                className="flex-1 py-1 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/40 rounded-lg text-amber-300 transition-colors"
              >
                HP
              </button>
              <button 
                onClick={() => triggerSimulation("hydration")}
                className="flex-1 py-1 bg-blue-950/40 hover:bg-blue-900/60 border border-blue-800/40 rounded-lg text-blue-300 transition-colors"
              >
                Minum
              </button>
              <button 
                onClick={() => triggerSimulation("screentime")}
                className="flex-1 py-1 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/40 rounded-lg text-purple-300 transition-colors"
              >
                Jeda
              </button>
              <button 
                onClick={resetAlert}
                className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-300 transition-colors flex items-center gap-1"
                title="Reset ke mode normal"
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

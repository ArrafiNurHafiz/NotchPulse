import { useState, useEffect } from "react";
import { 
  Eye, 
  Smartphone, 
  Droplets, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck 
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
  const [alertType, setAlertType] = useState<AlertType>("idle");
  const [alertMessage, setAlertMessage] = useState("");
  
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

    // Fetch initial state
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

  // Simulation trigger via Rust invoke
  const triggerSimulation = async (type: string) => {
    try {
      await invoke("simulate_vision_trigger", { triggerType: type });
    } catch {
      // Fallback local update
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
    <div className="w-full flex flex-col items-center justify-start select-none">
      {/* Coucou-inspired Notch Capsule: Menempel ke bezel atas layar */}
      <div 
        onClick={() => setExpanded(!expanded)}
        className={`transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1) cursor-pointer shadow-2xl backdrop-blur-2xl border-x border-b border-white/10 island-notch-top overflow-hidden flex flex-col items-center ${
          expanded 
            ? "w-[400px] bg-black/95 text-white p-4" 
            : alertType !== "idle"
              ? "w-[340px] bg-black/95 text-white py-2 px-3.5"
              : "w-[210px] bg-black/95 hover:bg-neutral-900 text-neutral-200 py-1.5 px-3.5"
        }`}
      >
        {/* Collapsed / Active Alert Pill Header */}
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            {alertType === "idle" && (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold tracking-wide">OptiHabit</span>
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
                  {alertMessage || "Distraksi ponsel terdeteksi"}
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

          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            {alertType === "idle" && !expanded && (
              <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded-full text-emerald-400 font-semibold">
                {metrics.focus_score}%
              </span>
            )}
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </div>

        {/* Expanded Dashboard Panel */}
        {expanded && (
          <div className="w-full mt-3 pt-2.5 border-t border-white/10 flex flex-col gap-3">
            {/* Health & Habit Metrics Grid */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                <div className="flex justify-center text-cyan-400 mb-1"><Eye className="w-3.5 h-3.5" /></div>
                <div className="text-xs font-bold">{metrics.blink_rate}/m</div>
                <div className="text-[9px] text-neutral-400 uppercase tracking-wider">Kedip</div>
              </div>

              <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                <div className="flex justify-center text-blue-400 mb-1"><Droplets className="w-3.5 h-3.5" /></div>
                <div className="text-xs font-bold">{metrics.hydration_count}x</div>
                <div className="text-[9px] text-neutral-400 uppercase tracking-wider">Air</div>
              </div>

              <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                <div className="flex justify-center text-amber-400 mb-1"><Smartphone className="w-3.5 h-3.5" /></div>
                <div className="text-xs font-bold">{metrics.phone_distraction_seconds}s</div>
                <div className="text-[9px] text-neutral-400 uppercase tracking-wider">Ponsel</div>
              </div>

              <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                <div className="flex justify-center text-purple-400 mb-1"><Clock className="w-3.5 h-3.5" /></div>
                <div className="text-xs font-bold">{metrics.screen_time_minutes}m</div>
                <div className="text-[9px] text-neutral-400 uppercase tracking-wider">Layar</div>
              </div>
            </div>

            {/* Privacy Shield & Status Footer */}
            <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>On-device Private CV</span>
              </div>
              <span className="font-mono text-neutral-500 text-[10px]">v0.1.0-alpha</span>
            </div>

            {/* Interactive Simulation Controls (For Dev & Demo Testing) */}
            <div className="pt-1 flex items-center justify-between gap-1 text-[10px]">
              <button 
                onClick={(e) => { e.stopPropagation(); triggerSimulation("blink"); }}
                className="px-2 py-1 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800/40 rounded-lg text-cyan-300"
              >
                Mata
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); triggerSimulation("phone"); }}
                className="px-2 py-1 bg-amber-950/60 hover:bg-amber-900 border border-amber-800/40 rounded-lg text-amber-300"
              >
                HP
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); triggerSimulation("hydration"); }}
                className="px-2 py-1 bg-blue-950/60 hover:bg-blue-900 border border-blue-800/40 rounded-lg text-blue-300"
              >
                Minum
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); triggerSimulation("screentime"); }}
                className="px-2 py-1 bg-purple-950/60 hover:bg-purple-900 border border-purple-800/40 rounded-lg text-purple-300"
              >
                Jeda
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); resetAlert(); }}
                className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-300"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

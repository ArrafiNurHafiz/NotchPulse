#include <opencv2/opencv.hpp>
#include <opencv2/dnn.hpp>
#include <opencv2/xobjdetect.hpp>
#include <iostream>
#include <fstream>
#include <thread>
#include <mutex>
#include <chrono>
#include <csignal>
#include <atomic>
#include <vector>
#include <deque>
#include <algorithm>
#include <queue>

std::atomic<bool> g_running(true);

void sig_handler(int) {
    g_running = false;
}

// ============================================================================
// THREAD-SAFE SHARED STATE STRUCTURES
// ============================================================================

struct FaceState {
    bool presence = false;
    int eyes_detected = 0;
    double ear = 0.0;
    cv::Rect face_box = cv::Rect(0, 0, 0, 0);
};

struct ObjectDetections {
    bool phone_detected = false;
    bool drinking_action = false;
};

struct ContextVector {
    std::string activity_type = "idle"; // work, meeting, leisure, break
    float focus_level = 0.5f;
    float attention_score = 0.5f;
};

struct TelemetryFrame {
    int64_t timestamp;
    FaceState face;
    ObjectDetections objects;
    ContextVector context;
    int blink_rate;
    int64_t screen_time_seconds;
    int hydration_count;
    int64_t last_hydration_sec_ago;
    int phone_distraction_seconds;
    int focus_score;
    std::string current_alert;
    std::string severity;
    std::string alert_message;
};

// Thread-safe queue untuk telemetry frames
class LockFreeQueue {
    std::deque<TelemetryFrame> q_;
    mutable std::mutex m_;
public:
    void push(const TelemetryFrame& frame) {
        std::lock_guard<std::mutex> lock(m_);
        q_.push_back(frame);
        if (q_.size() > 100) q_.pop_front(); // Keep last 100
    }
    
    std::vector<TelemetryFrame> get_all() const {
        std::lock_guard<std::mutex> lock(m_);
        return std::vector<TelemetryFrame>(q_.begin(), q_.end());
    }
};

// ============================================================================
// POST-PROCESSING & UTILITY FUNCTIONS
// ============================================================================

struct Detection {
    int class_id;
    float confidence;
    cv::Rect box;
};

std::vector<Detection> postprocess_yolo(const cv::Mat& output, float conf_threshold, float nms_threshold, int img_w, int img_h) {
    std::vector<Detection> detections;
    int dimensions = output.size[1]; // 84
    int rows = output.size[2];       // 8400

    cv::Mat data = output.reshape(1, dimensions);
    cv::Mat data_t;
    cv::transpose(data, data_t); // [8400, 84]

    std::vector<int> class_ids;
    std::vector<float> confidences;
    std::vector<cv::Rect> boxes;

    float x_factor = (float)img_w / 640.0f;
    float y_factor = (float)img_h / 640.0f;

    for (int i = 0; i < rows; ++i) {
        const float* row_ptr = data_t.ptr<float>(i);
        float cx = row_ptr[0];
        float cy = row_ptr[1];
        float w = row_ptr[2];
        float h = row_ptr[3];

        const float* scores = row_ptr + 4;
        int target_classes[] = {67, 39, 41, 40, 45};
        for (int cls : target_classes) {
            float conf = scores[cls];
            float threshold = (cls == 67) ? 0.22f : 0.16f;
            if (conf >= threshold) {
                int left = static_cast<int>((cx - 0.5f * w) * x_factor);
                int top = static_cast<int>((cy - 0.5f * h) * y_factor);
                int width = static_cast<int>(w * x_factor);
                int height = static_cast<int>(h * y_factor);

                class_ids.push_back(cls);
                confidences.push_back(conf);
                boxes.push_back(cv::Rect(left, top, width, height));
            }
        }
    }

    std::vector<int> indices;
    cv::dnn::NMSBoxes(boxes, confidences, conf_threshold, nms_threshold, indices);

    for (int idx : indices) {
        Detection det;
        det.class_id = class_ids[idx];
        det.confidence = confidences[idx];
        det.box = boxes[idx];
        detections.push_back(det);
    }

    return detections;
}

// ============================================================================
// WORKER THREAD 1: HIGH-FREQ FACE & EYE DETECTION (150ms)
// ============================================================================

void face_detection_worker(cv::VideoCapture& cap, std::atomic<FaceState*>& state_ptr,
                           std::deque<int64_t>& blink_timestamps, std::atomic<bool>& eye_was_open,
                           std::atomic<cv::Mat*>& shared_frame_ptr) {
    cv::CascadeClassifier face_cascade("/usr/share/opencv5/haarcascades/haarcascade_frontalface_default.xml");
    cv::CascadeClassifier eye_cascade("/usr/share/opencv5/haarcascades/haarcascade_eye.xml");
    
    cv::Mat frame;
    while (g_running) {
        cap >> frame;
        if (frame.empty()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            continue;
        }

        // Share frame untuk YOLO worker (atomic pointer swap)
        cv::Mat* new_shared_frame = new cv::Mat(frame.clone());
        cv::Mat* old_shared_frame = shared_frame_ptr.exchange(new_shared_frame);
        if (old_shared_frame) delete old_shared_frame;

        cv::Mat gray;
        cv::cvtColor(frame, gray, cv::COLOR_BGR2GRAY);
        cv::equalizeHist(gray, gray);

        std::vector<cv::Rect> faces;
        face_cascade.detectMultiScale(gray, faces, 1.15, 3, 0, cv::Size(60, 60));

        FaceState new_state;
        new_state.presence = !faces.empty();

        if (new_state.presence) {
            new_state.face_box = faces[0];
            
            int eye_y = new_state.face_box.y + static_cast<int>(new_state.face_box.height * 0.18);
            int eye_h = static_cast<int>(new_state.face_box.height * 0.35);
            if (eye_y + eye_h <= gray.rows && new_state.face_box.x + new_state.face_box.width <= gray.cols) {
                cv::Rect eyeArea(new_state.face_box.x, eye_y, new_state.face_box.width, eye_h);
                cv::Mat eyeROI = gray(eyeArea);
                std::vector<cv::Rect> eyes;
                eye_cascade.detectMultiScale(eyeROI, eyes, 1.10, 2, 0, cv::Size(12, 12));
                new_state.eyes_detected = static_cast<int>(eyes.size());
            }
        }

        // EAR estimation
        new_state.ear = (new_state.eyes_detected >= 2) ? 0.35 : 
                        (new_state.eyes_detected == 1 ? 0.25 : (new_state.presence ? 0.10 : 0.0));

        // Blink detection
        if (new_state.presence) {
            int64_t now_unix = std::chrono::duration_cast<std::chrono::seconds>(
                std::chrono::system_clock::now().time_since_epoch()).count();
            
            if (new_state.eyes_detected == 0 && eye_was_open) {
                blink_timestamps.push_back(now_unix);
                eye_was_open = false;
            } else if (new_state.eyes_detected >= 1) {
                eye_was_open = true;
            }

            // Prune old blinks
            while (!blink_timestamps.empty() && now_unix - blink_timestamps.front() > 60) {
                blink_timestamps.pop_front();
            }
        } else {
            eye_was_open = true;
        }

        // Update atomic state
        FaceState* old_state = state_ptr.load();
        if (old_state) delete old_state;
        state_ptr.store(new FaceState(new_state));

        std::this_thread::sleep_for(std::chrono::milliseconds(150));
    }
}

// ============================================================================
// WORKER THREAD 2: MID-FREQ YOLO OBJECT DETECTION (450ms, NON-BLOCKING)
// ============================================================================

void yolo_worker(std::atomic<cv::Mat*>& shared_frame_ptr, std::atomic<ObjectDetections*>& state_ptr,
                 std::atomic<const FaceState*>& face_state_ptr) {
    std::string onnx_path = "/home/arrafi/lomba/optihabit/src-tauri/yolov8n.onnx";
    cv::dnn::Net yolo_net = cv::dnn::readNetFromONNX(onnx_path);
    yolo_net.setPreferableBackend(cv::dnn::DNN_BACKEND_OPENCV);
    yolo_net.setPreferableTarget(cv::dnn::DNN_TARGET_CPU);

    while (g_running) {
        cv::Mat* frame_ptr = shared_frame_ptr.load();
        if (!frame_ptr || frame_ptr->empty()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
            continue;
        }
        cv::Mat frame = frame_ptr->clone();

        cv::Mat blob = cv::dnn::blobFromImage(frame, 1.0 / 255.0, cv::Size(640, 640), cv::Scalar(), true, false);
        yolo_net.setInput(blob);
        std::vector<cv::Mat> yolo_outputs;
        yolo_net.forward(yolo_outputs, yolo_net.getUnconnectedOutLayersNames());

        auto detections = postprocess_yolo(yolo_outputs[0], 0.16f, 0.45f, frame.cols, frame.rows);

        ObjectDetections new_state;
        const FaceState* face_state = face_state_ptr.load();

        for (const auto& det : detections) {
            if (det.class_id == 67) { // cell phone
                new_state.phone_detected = true;
            } else if (det.class_id == 39 || det.class_id == 41 || det.class_id == 40 || det.class_id == 45) {
                if (face_state && face_state->presence) {
                    cv::Rect lower_face_region;
                    int lower_y = face_state->face_box.y + static_cast<int>(face_state->face_box.height * 0.45);
                    int lower_h = static_cast<int>(face_state->face_box.height * 0.85);
                    int lower_x = std::max(0, face_state->face_box.x - static_cast<int>(face_state->face_box.width * 0.15));
                    int lower_w = std::min(frame.cols - lower_x, static_cast<int>(face_state->face_box.width * 1.3));
                    lower_face_region = cv::Rect(lower_x, std::min(frame.rows - 1, lower_y), lower_w, std::min(frame.rows - lower_y, lower_h));

                    cv::Rect intersection = det.box & lower_face_region;
                    int obj_center_x = det.box.x + det.box.width / 2;
                    int obj_center_y = det.box.y + det.box.height / 2;
                    int face_center_x = face_state->face_box.x + face_state->face_box.width / 2;
                    int face_center_y = face_state->face_box.y + face_state->face_box.height / 2;

                    bool overlap = intersection.area() > 0;
                    bool nearby = (std::abs(obj_center_x - face_center_x) < face_state->face_box.width * 0.8) &&
                                  (obj_center_y > face_state->face_box.y && obj_center_y < face_state->face_box.y + face_state->face_box.height * 1.5);

                    if (overlap || nearby) {
                        new_state.drinking_action = true;
                    }
                }
            }
        }

        ObjectDetections* old_state = state_ptr.load();
        if (old_state) delete old_state;
        state_ptr.store(new ObjectDetections(new_state));

        std::this_thread::sleep_for(std::chrono::milliseconds(450));
    }
}

// ============================================================================
// WORKER THREAD 3: CONTEXT INFERENCE & DECISION ENGINE (5s aggregate)
// ============================================================================

void context_inference_worker(const LockFreeQueue& telemetry_queue, std::atomic<ContextVector*>& context_state_ptr) {
    while (g_running) {
        auto frames = telemetry_queue.get_all();
        
        if (frames.size() >= 10) { // At least 10 samples (should be ~5 frames * 1s avg)
            float avg_screen_time = 0;
            float avg_phone_duration = 0;
            int avg_blink_rate = 0;

            for (const auto& f : frames) {
                avg_screen_time += f.screen_time_seconds;
                avg_phone_duration += f.phone_distraction_seconds;
                avg_blink_rate += f.blink_rate;
            }
            avg_screen_time /= frames.size();
            avg_phone_duration /= frames.size();
            avg_blink_rate /= frames.size();

            ContextVector new_context;

            // Simple heuristic: Detect work vs leisure vs break
            if (avg_screen_time > 300 && avg_blink_rate < 8) {
                new_context.activity_type = "work";
                new_context.focus_level = 0.7f;
            } else if (avg_screen_time > 120 && avg_phone_duration > 30) {
                new_context.activity_type = "leisure";
                new_context.focus_level = 0.4f;
            } else if (avg_screen_time < 30) {
                new_context.activity_type = "break";
                new_context.focus_level = 0.0f;
            } else {
                new_context.activity_type = "idle";
                new_context.focus_level = 0.5f;
            }

            new_context.attention_score = (avg_blink_rate > 10) ? 0.8f : (avg_blink_rate > 5 ? 0.5f : 0.2f);

            ContextVector* old_context = context_state_ptr.load();
            if (old_context) delete old_context;
            context_state_ptr.store(new ContextVector(new_context));
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(5000));
    }
}

// ============================================================================
// MAIN LOOP: AGGREGATE TELEMETRY & DECISION ENGINE
// ============================================================================

int main() {
    std::signal(SIGTERM, sig_handler);
    std::signal(SIGINT, sig_handler);

    // Initialize camera
    cv::VideoCapture cap(0, cv::CAP_V4L2);
    if (!cap.isOpened()) {
        std::cerr << "ERR: Gagal membuka kamera /dev/video0\n";
        return 1;
    }
    cap.set(cv::CAP_PROP_FRAME_WIDTH, 640);
    cap.set(cv::CAP_PROP_FRAME_HEIGHT, 480);

    // Warm up
    cv::Mat warmup;
    for (int i = 0; i < 4; ++i) {
        cap >> warmup;
        std::this_thread::sleep_for(std::chrono::milliseconds(25));
    }

    // Shared atomic states - INITIALIZE dengan default values
    std::atomic<FaceState*> face_state(new FaceState());
    std::atomic<ObjectDetections*> object_state(new ObjectDetections());
    std::atomic<ContextVector*> context_state(new ContextVector());
    std::atomic<const FaceState*> face_state_for_yolo(face_state.load());

    // State trackers
    std::deque<int64_t> blink_timestamps;
    std::atomic<bool> eye_was_open(true);
    int64_t screen_time_seconds = 0;
    int hydration_count = 0;
    int64_t last_hydration_timestamp = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    double total_phone_distraction_sec = 0.0;
    double continuous_phone_sec = 0.0;
    int consecutive_drinking_ticks = 0;
    int64_t last_alert_time_phone = 0;
    int64_t last_alert_time_blink = 0;
    int phone_missing_frames = 0;  // Debounce: toleransi 2 frame YOLO miss

    // Telemetry queue
    LockFreeQueue telemetry_queue;

    // Shared frame pointer untuk multi-thread safety
    std::atomic<cv::Mat*> shared_frame_ptr(nullptr);

    // Output path
    std::string out_path = "/home/arrafi/.hermes/cache/scratch/notchpulse_vision.json";

    // Start worker threads
    std::thread t_face(face_detection_worker, std::ref(cap), std::ref(face_state), 
                       std::ref(blink_timestamps), std::ref(eye_was_open), std::ref(shared_frame_ptr));
    std::thread t_yolo(yolo_worker, std::ref(shared_frame_ptr), std::ref(object_state), 
                       std::ref(face_state_for_yolo));
    std::thread t_context(context_inference_worker, std::ref(telemetry_queue), std::ref(context_state));

    auto last_tick_time = std::chrono::steady_clock::now();

    // Main aggregation loop (1s per iteration)
    while (g_running) {
        auto now_clock = std::chrono::steady_clock::now();
        double dt = std::chrono::duration<double>(now_clock - last_tick_time).count();
        last_tick_time = now_clock;
        int64_t now_unix = std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        // Read latest states from worker threads
        FaceState* face_state_ptr = face_state.load();
        ObjectDetections* object_state_ptr = object_state.load();
        ContextVector* context_state_ptr = context_state.load();

        face_state_for_yolo = face_state_ptr; // Share for YOLO worker

        // Update screen time
        if (face_state_ptr->presence) {
            screen_time_seconds += static_cast<int64_t>(dt + 0.5);
        } else {
            screen_time_seconds = 0;
        }

        // Update phone distraction dengan debounce (toleransi 2 frame YOLO miss)
        if (object_state_ptr->phone_detected) {
            total_phone_distraction_sec += dt;
            continuous_phone_sec += dt;
            phone_missing_frames = 0;
        } else {
            phone_missing_frames++;
            if (phone_missing_frames >= 3) {  // Reset setelah 3x frame miss (~1.5s YOLO loop)
                continuous_phone_sec = 0.0;
            }
        }

        // Track hydration with debounce
        static int64_t last_hydration_trigger_time = 0;
        if (object_state_ptr->drinking_action) {
            consecutive_drinking_ticks++;
            if (consecutive_drinking_ticks >= 2) {
                if (now_unix - last_hydration_trigger_time > 15) {
                    hydration_count++;
                    last_hydration_timestamp = now_unix;
                    last_hydration_trigger_time = now_unix;
                }
                consecutive_drinking_ticks = 0;
            }
        } else {
            if (consecutive_drinking_ticks > 0) consecutive_drinking_ticks--;
        }

        int64_t last_hydration_sec_ago = now_unix - last_hydration_timestamp;
        int blink_rate = static_cast<int>(blink_timestamps.size());

        // ====== PROGRESSIVE SEVERITY DECISION ENGINE (P3) ======
        std::string current_alert = "idle";
        std::string severity = "info";
        std::string alert_message = "Fokus Optimal";

        // Phone distraction thresholds (progressive)
        if (continuous_phone_sec >= 30.0) {
            current_alert = "phone";
            severity = "critical";
            alert_message = "HP terlalu lama! Produktivitas menurun.";
        } else if (continuous_phone_sec >= 15.0) {
            current_alert = "phone";
            severity = "warning";
            alert_message = "HP terdeteksi. Cek notifikasi sebentar lalu fokus.";
        }

        // Blink fatigue (only if not already alerted)
        if (current_alert == "idle" && face_state_ptr->presence && screen_time_seconds > 120) {
            if (blink_rate < 5) {
                current_alert = "blink";
                severity = "critical";
                alert_message = "Mata sangat lelah! Istirahat 20 detik sekarang.";
            } else if (blink_rate < 8) {
                current_alert = "blink";
                severity = "warning";
                alert_message = "Mata mulai lelah. Berkedip lebih banyak.";
            }
        }

        // Screen time (only if not already alerted)
        if (current_alert == "idle") {
            if (screen_time_seconds >= 3600) {
                current_alert = "screentime";
                severity = "critical";
                alert_message = "1 jam layar! Istirahat 20 detik jauh dari layar.";
            } else if (screen_time_seconds >= 2700) {
                current_alert = "screentime";
                severity = "warning";
                alert_message = "45 menit layar. Rencanakan break 20 detik.";
            }
        }

        // Hydration (only if not already alerted)
        if (current_alert == "idle") {
            if (last_hydration_sec_ago >= 5400) {
                current_alert = "hydration";
                severity = "critical";
                alert_message = "90 menit tanpa minum! Minum sekarang.";
            } else if (last_hydration_sec_ago >= 3600) {
                current_alert = "hydration";
                severity = "warning";
                alert_message = "Sudah 1 jam. Waktunya minum air.";
            }
        }

        // Calculate focus score
        int phone_penalty = std::min(35, static_cast<int>(total_phone_distraction_sec / 15.0));
        int screen_penalty = (screen_time_seconds > 1200) ? std::min(30, static_cast<int>((screen_time_seconds - 1200) / 60) * 2) : 0;
        int blink_penalty = (face_state_ptr->presence && blink_rate < 10) ? (10 - blink_rate) * 2 : 0;
        int focus_score = std::max(15, std::min(100, 100 - phone_penalty - screen_penalty - blink_penalty));

        // Build telemetry frame
        TelemetryFrame frame;
        frame.timestamp = now_unix;
        frame.face = *face_state_ptr;
        frame.objects = *object_state_ptr;
        frame.context = *context_state_ptr;
        frame.blink_rate = blink_rate;
        frame.screen_time_seconds = screen_time_seconds;
        frame.hydration_count = hydration_count;
        frame.last_hydration_sec_ago = last_hydration_sec_ago;
        frame.phone_distraction_seconds = static_cast<int>(continuous_phone_sec);  // Gunakan continuous, bukan total
        frame.focus_score = focus_score;
        frame.current_alert = current_alert;
        frame.severity = severity;
        frame.alert_message = alert_message;

        telemetry_queue.push(frame);

        // Write JSON output
        std::ofstream ofs(out_path + ".tmp");
        if (ofs.is_open()) {
            ofs << "{"
                << "\"presence\":" << (face_state_ptr->presence ? "true" : "false") << ","
                << "\"eyes\":" << face_state_ptr->eyes_detected << ","
                << "\"ear\":" << face_state_ptr->ear << ","
                << "\"blink_rate\":" << blink_rate << ","
                << "\"screen_time_seconds\":" << screen_time_seconds << ","
                << "\"hydration_count\":" << hydration_count << ","
                << "\"last_hydration_sec_ago\":" << last_hydration_sec_ago << ","
                << "\"phone_detected\":" << (object_state_ptr->phone_detected ? "true" : "false") << ","
                << "\"phone_distraction_seconds\":" << frame.phone_distraction_seconds << ","
                << "\"focus_score\":" << focus_score << ","
                << "\"current_alert\":\"" << current_alert << "\","
                << "\"severity\":\"" << severity << "\","
                << "\"alert_message\":\"" << alert_message << "\","
                << "\"context_activity\":\"" << context_state_ptr->activity_type << "\","
                << "\"timestamp\":" << now_unix
                << "}\n";
            ofs.close();
            std::rename((out_path + ".tmp").c_str(), out_path.c_str());
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
    }

    // Cleanup
    t_face.join();
    t_yolo.join();
    t_context.join();

    FaceState* f = face_state.load();
    if (f) delete f;
    ObjectDetections* o = object_state.load();
    if (o) delete o;
    ContextVector* c = context_state.load();
    if (c) delete c;

    return 0;
}

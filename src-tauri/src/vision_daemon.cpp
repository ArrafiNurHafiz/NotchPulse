#include <opencv2/opencv.hpp>
#include <opencv2/dnn.hpp>
#include <opencv2/xobjdetect.hpp>
#include <iostream>
#include <fstream>
#include <thread>
#include <chrono>
#include <csignal>
#include <atomic>
#include <vector>
#include <deque>
#include <algorithm>

std::atomic<bool> g_running(true);

void sig_handler(int) {
    g_running = false;
}

struct Detection {
    int class_id;
    float confidence;
    cv::Rect box;
};

// Post-processing output tensor YOLOv8 [1, 84, 8400]
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
        // Kelas COCO: 67 (cell phone), 39 (bottle), 41 (cup), 40 (wine glass)
        int target_classes[] = {67, 39, 41, 40};
        for (int cls : target_classes) {
            float conf = scores[cls];
            if (conf >= conf_threshold) {
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

int main() {
    std::signal(SIGTERM, sig_handler);
    std::signal(SIGINT, sig_handler);

    // 1. Inisialisasi Kamera V4L2
    cv::VideoCapture cap(0, cv::CAP_V4L2);
    if (!cap.isOpened()) {
        std::cerr << "ERR: Gagal membuka kamera /dev/video0\n";
        return 1;
    }
    cap.set(cv::CAP_PROP_FRAME_WIDTH, 640);
    cap.set(cv::CAP_PROP_FRAME_HEIGHT, 480);

    // Warm-up sensor optik
    cv::Mat frame;
    for (int i = 0; i < 4; ++i) {
        cap >> frame;
        std::this_thread::sleep_for(std::chrono::milliseconds(25));
    }

    // 2. Muat Model Computer Vision
    cv::CascadeClassifier face_cascade("/usr/share/opencv5/haarcascades/haarcascade_frontalface_default.xml");
    cv::CascadeClassifier eye_cascade("/usr/share/opencv5/haarcascades/haarcascade_eye.xml");

    std::string onnx_path = "/home/arrafi/lomba/optihabit/src-tauri/yolov8n.onnx";
    cv::dnn::Net yolo_net = cv::dnn::readNetFromONNX(onnx_path);
    yolo_net.setPreferableBackend(cv::dnn::DNN_BACKEND_OPENCV);
    yolo_net.setPreferableTarget(cv::dnn::DNN_TARGET_CPU);

    std::string out_path = "/home/arrafi/.hermes/cache/scratch/notchpulse_vision.json";

    // 3. State Pelacakan Kebiasaan Riil (100% Optical Telemetry)
    int64_t screen_time_seconds = 0;
    int hydration_count = 0;
    int64_t last_hydration_timestamp = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    
    double total_phone_distraction_sec = 0.0;
    double continuous_phone_sec = 0.0;
    int consecutive_drinking_ticks = 0;

    // Sliding window 60 detik untuk frekuensi kedipan riil (blinks per minute)
    std::deque<int64_t> blink_timestamps;
    bool eye_was_open = true;

    auto last_tick_time = std::chrono::steady_clock::now();

    while (g_running) {
        cap >> frame;
        if (frame.empty()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            continue;
        }

        auto now_clock = std::chrono::steady_clock::now();
        double dt = std::chrono::duration<double>(now_clock - last_tick_time).count();
        last_tick_time = now_clock;
        int64_t now_unix = std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        // A. Deteksi Wajah & Mata (Haar Cascade)
        cv::Mat gray;
        cv::cvtColor(frame, gray, cv::COLOR_BGR2GRAY);
        cv::equalizeHist(gray, gray);

        std::vector<cv::Rect> faces;
        face_cascade.detectMultiScale(gray, faces, 1.15, 3, 0, cv::Size(60, 60));

        bool presence = !faces.empty();
        int eyes_detected = 0;
        cv::Rect face_box(0, 0, 0, 0);

        if (presence) {
            face_box = faces[0];
            screen_time_seconds += static_cast<int64_t>(dt + 0.5);

            int eye_y = face_box.y + static_cast<int>(face_box.height * 0.18);
            int eye_h = static_cast<int>(face_box.height * 0.35);
            if (eye_y + eye_h <= gray.rows && face_box.x + face_box.width <= gray.cols) {
                cv::Rect eyeArea(face_box.x, eye_y, face_box.width, eye_h);
                cv::Mat eyeROI = gray(eyeArea);
                std::vector<cv::Rect> eyes;
                // Deteksi mata lebih sensitif dengan minSize 12x12
                eye_cascade.detectMultiScale(eyeROI, eyes, 1.10, 2, 0, cv::Size(12, 12));
                eyes_detected = static_cast<int>(eyes.size());
            }
        }

        // Estimasi nilai EAR adaptif: 2 mata = 0.35 (terbuka penuh), 1 mata = 0.25, 0 mata = 0.10 (tertutup/kedip)
        double ear = (eyes_detected >= 2) ? 0.35 : (eyes_detected == 1 ? 0.25 : (presence ? 0.10 : 0.0));
        if (presence) {
            if (ear <= 0.15 && eye_was_open) {
                // Transisi mata menutup (kedipan nyata)
                blink_timestamps.push_back(now_unix);
                eye_was_open = false;
            } else if (ear >= 0.25) {
                eye_was_open = true;
            }
        }

        // Hapus timestamp kedipan lebih dari 60 detik lalu
        while (!blink_timestamps.empty() && now_unix - blink_timestamps.front() > 60) {
            blink_timestamps.pop_front();
        }
        int blink_rate = static_cast<int>(blink_timestamps.size());

        // B. Deteksi Objek Riil (YOLOv8n ONNX: Cell Phone & Bottle/Cup)
        cv::Mat blob = cv::dnn::blobFromImage(frame, 1.0 / 255.0, cv::Size(640, 640), cv::Scalar(), true, false);
        yolo_net.setInput(blob);
        std::vector<cv::Mat> yolo_outputs;
        yolo_net.forward(yolo_outputs, yolo_net.getUnconnectedOutLayersNames());

        auto detections = postprocess_yolo(yolo_outputs[0], 0.25f, 0.45f, frame.cols, frame.rows);

        bool phone_detected = false;
        bool drinking_action = false;

        cv::Rect mouth_region(0, 0, 0, 0);
        if (presence) {
            // Region mulut & dagu diperluas agar overlap botol/cangkir terdeteksi natural
            mouth_region = cv::Rect(
                std::max(0, face_box.x + static_cast<int>(face_box.width * 0.1)),
                std::min(frame.rows - 1, face_box.y + static_cast<int>(face_box.height * 0.55)),
                std::min(frame.cols - face_box.x, static_cast<int>(face_box.width * 0.8)),
                std::min(frame.rows - face_box.y, static_cast<int>(face_box.height * 0.55))
            );
        }

        for (const auto& det : detections) {
            if (det.class_id == 67) { // cell phone
                phone_detected = true;
            } else if (det.class_id == 39 || det.class_id == 41 || det.class_id == 40) { // bottle / cup / wine glass
                if (presence) {
                    cv::Rect intersection = det.box & mouth_region;
                    // Deteksi overlap atau jarak dekat antara botol dan area mulut
                    if (intersection.area() > 0 || (std::abs((det.box.x + det.box.width / 2) - (mouth_region.x + mouth_region.width / 2)) < face_box.width * 0.5 && std::abs((det.box.y + det.box.height / 2) - (mouth_region.y + mouth_region.height / 2)) < face_box.height * 0.6)) {
                        drinking_action = true;
                    }
                }
            }
        }

        // Pelacak distraksi ponsel
        if (phone_detected) {
            total_phone_distraction_sec += dt;
            continuous_phone_sec += dt;
        } else {
            continuous_phone_sec = 0.0;
        }

        // Pelacak aksi minum air (responsif: 1-2 tick / ~450-900ms sudah mencatat hidrasi)
        if (drinking_action) {
            consecutive_drinking_ticks++;
            if (consecutive_drinking_ticks >= 1) { 
                hydration_count++;
                last_hydration_timestamp = now_unix;
                consecutive_drinking_ticks = 0;
            }
        } else {
            consecutive_drinking_ticks = 0;
        }

        int64_t last_hydration_sec_ago = now_unix - last_hydration_timestamp;

        // C. Perhitungan Skor Fokus Dinamis (0 - 100)
        int phone_penalty = std::min(35, static_cast<int>(total_phone_distraction_sec / 15.0));
        int screen_penalty = (screen_time_seconds > 1200) ? std::min(30, static_cast<int>((screen_time_seconds - 1200) / 60) * 2) : 0;
        int blink_penalty = (presence && blink_rate < 10) ? (10 - blink_rate) * 2 : 0;
        int focus_score = std::max(15, std::min(100, 100 - phone_penalty - screen_penalty - blink_penalty));

        // D. Keputusan Kategori Peringatan (Decision Engine)
        std::string current_alert = "idle";
        std::string alert_message = "Fokus Optimal";

        if (continuous_phone_sec >= 4.0) {
            current_alert = "phone";
            alert_message = "Distraksi Ponsel: Terlalu lama melihat HP";
        } else if (presence && blink_rate < 10 && screen_time_seconds > 60) {
            current_alert = "blink";
            alert_message = "Kelelahan Mata: Kurang berkedip";
        } else if (screen_time_seconds >= 1200) {
            current_alert = "screentime";
            alert_message = "Waktu Layar: 20 Menit, Istirahatkan Mata";
        } else if (last_hydration_sec_ago >= 3600) {
            current_alert = "hydration";
            alert_message = "Waktunya Minum Air";
        }

        // E. Tulis Snapshot Telemetri Riil ke JSON Atomic
        std::ofstream ofs(out_path + ".tmp");
        if (ofs.is_open()) {
            ofs << "{"
                << "\"presence\":" << (presence ? "true" : "false") << ","
                << "\"eyes\":" << eyes_detected << ","
                << "\"ear\":" << ear << ","
                << "\"blink_rate\":" << blink_rate << ","
                << "\"screen_time_seconds\":" << screen_time_seconds << ","
                << "\"hydration_count\":" << hydration_count << ","
                << "\"last_hydration_sec_ago\":" << last_hydration_sec_ago << ","
                << "\"phone_detected\":" << (phone_detected ? "true" : "false") << ","
                << "\"phone_distraction_seconds\":" << static_cast<int>(total_phone_distraction_sec) << ","
                << "\"focus_score\":" << focus_score << ","
                << "\"current_alert\":\"" << current_alert << "\","
                << "\"alert_message\":\"" << alert_message << "\","
                << "\"timestamp\":" << now_unix
                << "}\n";
            ofs.close();
            std::rename((out_path + ".tmp").c_str(), out_path.c_str());
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(450));
    }

    return 0;
}

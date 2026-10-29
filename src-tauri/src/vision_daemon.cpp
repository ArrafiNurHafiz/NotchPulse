#include <opencv2/opencv.hpp>
#include <opencv2/xobjdetect.hpp>
#include <iostream>
#include <fstream>
#include <thread>
#include <chrono>
#include <csignal>
#include <atomic>

std::atomic<bool> g_running(true);

void sig_handler(int) {
    g_running = false;
}

int main() {
    std::signal(SIGTERM, sig_handler);
    std::signal(SIGINT, sig_handler);

    // Buka webcam V4L2 sekali dan jaga stream tetap terbuka
    cv::VideoCapture cap(0, cv::CAP_V4L2);
    if (!cap.isOpened()) {
        std::cerr << "ERR: Gagal membuka kamera /dev/video0\n";
        return 1;
    }

    cap.set(cv::CAP_PROP_FRAME_WIDTH, 640);
    cap.set(cv::CAP_PROP_FRAME_HEIGHT, 480);

    // Warm up camera
    cv::Mat frame;
    for (int i = 0; i < 5; ++i) {
        cap >> frame;
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }

    cv::CascadeClassifier face_cascade("/usr/share/opencv5/haarcascades/haarcascade_frontalface_default.xml");
    cv::CascadeClassifier eye_cascade("/usr/share/opencv5/haarcascades/haarcascade_eye.xml");

    std::string out_path = "/home/arrafi/.hermes/cache/scratch/notchpulse_vision.json";

    int consecutive_face_count = 0;
    int eyes_blink_counter = 0;
    auto last_blink_tick = std::chrono::steady_clock::now();

    while (g_running) {
        cap >> frame;
        if (frame.empty()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            continue;
        }

        cv::Mat gray;
        cv::cvtColor(frame, gray, cv::COLOR_BGR2GRAY);
        cv::equalizeHist(gray, gray);

        std::vector<cv::Rect> faces;
        face_cascade.detectMultiScale(gray, faces, 1.2, 3, 0, cv::Size(60, 60));

        bool presence = !faces.empty();
        int eyes_detected = 0;

        if (presence) {
            consecutive_face_count++;
            cv::Rect face = faces[0];
            // Area mata berada pada 15% - 55% tinggi wajah
            int eye_y = face.y + static_cast<int>(face.height * 0.15);
            int eye_h = static_cast<int>(face.height * 0.40);
            if (eye_y + eye_h <= gray.rows && face.x + face.width <= gray.cols) {
                cv::Rect eyeArea(face.x, eye_y, face.width, eye_h);
                cv::Mat eyeROI = gray(eyeArea);
                std::vector<cv::Rect> eyes;
                eye_cascade.detectMultiScale(eyeROI, eyes, 1.15, 2, 0, cv::Size(15, 15));
                eyes_detected = static_cast<int>(eyes.size());
            }
        } else {
            consecutive_face_count = 0;
        }

        // Estimasi nilai EAR
        double ear = (eyes_detected >= 2) ? 0.32 : (eyes_detected == 1 ? 0.22 : (presence ? 0.12 : 0.0));

        // Tulis status real-time ke file scratch atomic
        std::ofstream ofs(out_path + ".tmp");
        if (ofs.is_open()) {
            ofs << "{"
                << "\"presence\":" << (presence ? "true" : "false") << ","
                << "\"eyes\":" << eyes_detected << ","
                << "\"ear\":" << ear << ","
                << "\"face_streak\":" << consecutive_face_count << ","
                << "\"timestamp\":" << std::chrono::duration_cast<std::chrono::seconds>(
                       std::chrono::system_clock::now().time_since_epoch()).count()
                << "}\n";
            ofs.close();
            std::rename((out_path + ".tmp").c_str(), out_path.c_str());
        }

        // Loop interval 500ms (2 FPS - efisien CPU < 2%)
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }

    return 0;
}

#include <opencv2/opencv.hpp>
#include <opencv2/xobjdetect.hpp>
#include <iostream>
#include <thread>
#include <chrono>

int main() {
    cv::VideoCapture cap(0, cv::CAP_V4L2);
    if (!cap.isOpened()) {
        std::cout << "{\"presence\":false,\"eyes\":0,\"ear\":0.0,\"error\":\"camera_unavailable\"}\n";
        return 0;
    }

    cap.set(cv::CAP_PROP_FRAME_WIDTH, 640);
    cap.set(cv::CAP_PROP_FRAME_HEIGHT, 480);

    // Warm up camera 3 frames
    cv::Mat frame;
    for (int i = 0; i < 4; ++i) {
        cap >> frame;
        std::this_thread::sleep_for(std::chrono::milliseconds(30));
    }

    if (frame.empty()) {
        std::cout << "{\"presence\":false,\"eyes\":0,\"ear\":0.0}\n";
        return 0;
    }

    cv::CascadeClassifier face_cascade("/usr/share/opencv5/haarcascades/haarcascade_frontalface_default.xml");
    cv::CascadeClassifier eye_cascade("/usr/share/opencv5/haarcascades/haarcascade_eye_tree_eyeglasses.xml");

    cv::Mat gray;
    cv::cvtColor(frame, gray, cv::COLOR_BGR2GRAY);
    cv::equalizeHist(gray, gray);

    std::vector<cv::Rect> faces;
    face_cascade.detectMultiScale(gray, faces, 1.15, 3, 0, cv::Size(60, 60));

    bool presence = !faces.empty();
    int eyes_detected = 0;

    if (presence) {
        // Ambil separuh atas wajah untuk mata
        cv::Rect face = faces[0];
        cv::Rect eyeArea(face.x, face.y + face.height * 0.15, face.width, face.height * 0.45);
        cv::Mat eyeROI = gray(eyeArea);

        std::vector<cv::Rect> eyes;
        eye_cascade.detectMultiScale(eyeROI, eyes, 1.15, 2, 0, cv::Size(15, 15));
        eyes_detected = eyes.size();
    }

    // Kalkulasi EAR estimasi
    double ear = (eyes_detected >= 2) ? 0.32 : (eyes_detected == 1 ? 0.24 : (presence ? 0.14 : 0.0));

    // Periksa luminansi keseluruhan
    cv::Scalar meanVal = cv::mean(gray);
    double brightness = meanVal[0];

    std::cout << "{\"presence\":" << (presence ? "true" : "false") 
              << ",\"eyes\":" << eyes_detected 
              << ",\"ear\":" << ear 
              << ",\"brightness\":" << brightness
              << "}\n";

    return 0;
}

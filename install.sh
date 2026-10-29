#!/usr/bin/env bash
# ==============================================================================
# NotchPulse — One-Line Universal Installer & Setup Script for Linux Laptops
# Mendukung: Arch Linux / CachyOS / Manjaro, Ubuntu / Debian, Fedora
# ==============================================================================
set -euo pipefail

echo "=========================================="
echo "    NotchPulse Desktop Installer"
echo "=========================================="

APP_DIR="${HOME}/.local/share/notchpulse"
BIN_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
AUTOSTART_DIR="${HOME}/.config/autostart"

mkdir -p "${APP_DIR}" "${BIN_DIR}" "${DESKTOP_DIR}" "${AUTOSTART_DIR}"

# 1. Deteksi Distro & Pemasangan Pustaka Sistem Runtime (jika diperlukan)
if command -v pacman >/dev/null 2>&1; then
    echo "[1/4] Mendeteksi Arch/CachyOS: memeriksa pustaka runtime webkit2gtk..."
    sudo pacman -S --needed --noconfirm webkit2gtk-4.1 libsoup3 || true
elif command -v apt >/dev/null 2>&1; then
    echo "[1/4] Mendeteksi Debian/Ubuntu: memeriksa pustaka runtime webkit2gtk..."
    sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-0 libsoup-3.0-0 || true
elif command -v dnf >/dev/null 2>&1; then
    echo "[1/4] Mendeteksi Fedora: memeriksa pustaka runtime webkit2gtk..."
    sudo dnf install -y webkit2gtk4.1 libsoup3 || true
fi

# 2. Salin biner executable
echo "[2/4] Menyalin biner NotchPulse ke ${BIN_DIR}/notchpulse..."
cp -f "$(dirname "$0")/src-tauri/target/debug/optihabit" "${BIN_DIR}/notchpulse"
chmod +x "${BIN_DIR}/notchpulse"

# 3. Buat File .desktop untuk Menu Aplikasi & Autostart
echo "[3/4] Mengonfigurasi pintasan aplikasi & autostart..."
cat <<EOF > "${DESKTOP_DIR}/notchpulse.desktop"
[Desktop Entry]
Name=NotchPulse
Comment=On-Device Dynamic Island for Laptop Productivity & Digital Wellness
Exec=${BIN_DIR}/notchpulse
Icon=preferences-desktop-display
Terminal=false
Type=Application
Categories=Utility;Health;
StartupNotify=false
EOF

cp -f "${DESKTOP_DIR}/notchpulse.desktop" "${AUTOSTART_DIR}/notchpulse.desktop"

# 4. Integrasi Otomatis Window Rules untuk Hyprland (jika pengguna memakai Hyprland)
if [ -d "${HOME}/.config/hypr" ]; then
    echo "[4/4] Mendeteksi lingkungan Hyprland: menambahkan konfigurasi floating..."
    # Cek apakah konfigurasi Lua atau conf
    if [ -f "${HOME}/.config/hypr/hyprland.lua" ]; then
        if ! grep -q "notchpulse" "${HOME}/.config/hypr/hyprland.lua" 2>/dev/null && ! grep -q "optihabit" "${HOME}/.config/hypr/hyprland.lua" 2>/dev/null; then
            echo -e "\nhl.window_rule({ match = { class = \"notchpulse\" }, float = true, pin = true, decorate = false })" >> "${HOME}/.config/hypr/hyprland.lua"
        fi
    fi
fi

echo "=========================================="
echo " NotchPulse BERHASIL DIPASANG!"
echo " Jalankan sekarang dengan mengetik: notchpulse"
echo " Atau cari 'NotchPulse' di menu aplikasi laptop Anda."
echo "=========================================="

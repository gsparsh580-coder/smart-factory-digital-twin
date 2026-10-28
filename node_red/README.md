# 🔄 Node-RED Smart Factory Orchestration & Dashboard

This directory contains the production-ready **Node-RED Flow** (`flows.json`) that acts as an industrial Supervisory Control and Data Acquisition (SCADA) middleware.

---

## 🌟 Capabilities

1. **HiveMQ MQTT Ingestion**: Subscribes directly to `factory/telemetry/machine1` without complex configuration.
2. **Autonomous Safety Interlock Engine**: Continuously supervises telemetry:
   - If Temperature exceeds **85°C**, or Vibration RMS exceeds **16 mm/s²**, Node-RED autonomously dispatches an `ESTOP` command to `factory/control/estop`, cutting motor power on the ESP32 and halting the Digital Twin.
3. **Node-RED Dashboard UI**:
   - Live Gauges: RPM, Temperature, Vibration RMS, Motor Current, AI Health Score.
   - Dual-axis time-series trends for vibration and temperature.
   - Remote Control Buttons: **EMERGENCY STOP (E-STOP)**, **SYSTEM RESET**, and **RPM Setpoint Slider**.

---

## 🚀 How to Run Node-RED

### Option A: 1-Click with Docker Compose (Recommended)
From the repository root directory:
```bash
docker compose up -d
```
Open your browser at:
- **Node-RED Flow Editor**: [http://localhost:1880](http://localhost:1880)
- **Node-RED Dashboard UI**: [http://localhost:1880/ui](http://localhost:1880/ui)

### Option B: Local Node-RED Installation (npm)
If you already have Node-RED installed locally:
1. Start Node-RED:
   ```bash
   node-red
   ```
2. Open [http://127.0.0.1:1880](http://127.0.0.1:1880)
3. Click the top-right hamburger menu (☰) -> **Import** -> Select `flows.json` -> Click **Import** -> Click **Deploy**.
4. Open the dashboard at [http://127.0.0.1:1880/ui](http://127.0.0.1:1880/ui).

---

## 🔌 MQTT Topic Schema

| Direction | Topic | Payload Description |
| :--- | :--- | :--- |
| **Inbound** | `factory/telemetry/machine1` | Real-time JSON telemetry from ESP32 or Synthetic Simulator |
| **Outbound** | `factory/control/estop` | Autonomous safety or manual E-STOP trigger |
| **Outbound** | `factory/control/reset` | System reset signal |
| **Outbound** | `factory/control/speed` | Target RPM setpoint `{"targetRpm": 1800}` |
| **Outbound** | `factory/control/mode` | Operating Mode (`AUTO`, `MANUAL`, `MAINTENANCE`) |

# 🔌 ESP32 Circuit Schematic & Sensor Wiring Guide

This guide details the hardware assembly for the **Smart Factory Industrial IoT Edge Gateway** using the **ESP32 DevKit V1**.

---

## 📋 Bill of Materials (BOM)

| Component | Specification / Model | Purpose | ESP32 Pin Connection |
| :--- | :--- | :--- | :--- |
| **Microcontroller** | ESP32 DevKit V1 (30 or 38 pin) | Edge compute & WiFi MQTT Gateway | - |
| **Vibration Sensor** | MPU-6050 6-Axis IMU (I2C) | 3-axis vibration velocity RMS (mm/s²) | SDA -> `GPIO 21`, SCL -> `GPIO 22`, VCC -> `3.3V`, GND -> `GND` |
| **Temperature Sensor**| DHT22 or DS18B20 Digital Sensor | Thermal dissipation monitoring (°C) | Data -> `GPIO 4`, VCC -> `3.3V` (with 10kΩ pullup), GND -> `GND` |
| **Current / Power** | ACS712-05B Current Sensor (or Pot) | Motor current load (A) & Power (kW) | OUT -> `GPIO 34 (ADC1)`, VCC -> `5V`, GND -> `GND` |
| **Tachometer / RPM** | Optical IR Slot / Hall Sensor Module | Rotational speed (RPM) & Parts Counter| DO -> `GPIO 18` (Interrupt pin), VCC -> `3.3V`, GND -> `GND` |
| **Motor Relay** | 1-Channel 5V Relay Module | Spindle / Conveyor power cutoff | IN -> `GPIO 25`, VCC -> `5V`, GND -> `GND` |
| **Physical E-STOP** | Industrial Mushroom Push Button (NC/NO) | Local physical emergency stop | Pin -> `GPIO 15` (to GND, internal pullup enabled) |
| **Green Status LED** | 5mm LED + 330Ω resistor | Normal / Healthy operation | Anode -> `GPIO 16`, Cathode -> `GND` |
| **Yellow Status LED**| 5mm LED + 330Ω resistor | Warning / Maintenance state | Anode -> `GPIO 17`, Cathode -> `GND` |
| **Red Status LED** | 5mm LED + 330Ω resistor | Critical Fault / E-STOP active | Anode -> `GPIO 5`, Cathode -> `GND` |
| **Piezo Buzzer** | 5V Active or Passive Buzzer | Audible acoustic alarm | Positive -> `GPIO 19`, Negative -> `GND` |

---

## ⚡ Complete Pinout Diagram

```
                  +-------------------+
                  |   ESP32 DevKit    |
                  |                   |
    [3.3V Power] -| 3V3           GND |- [GND Rail]
                  | EN             23 |
    [ACS712 OUT] -| 34 (ADC1)      22 |- [MPU6050 SCL]
                  | 35             1 |- (TXD0)
                  | 32              3 |- (RXD0)
                  | 33             21 |- [MPU6050 SDA]
                  | 25 (Relay)     19 |- [Piezo Buzzer]
                  | 26             18 |- [IR Speed Sensor (Interrupt)]
                  | 27              5 |- [Red Fault LED]
    [Physical ES] -| 15 (Pullup)    17 |- [Yellow Warning LED]
    [DHT22 Temp] -| 4              16 |- [Green Normal LED]
                  | 0               4 |
                  | 2               2 |
    [5V USB In]  -| VIN           GND |- [GND Rail]
                  +-------------------+
```

---

## 🛠️ Step-by-Step Breadboard Wiring Instructions

### 1. Power Rails
- Connect ESP32 `VIN` to the positive breadboard rail (`+5V` from USB).
- Connect ESP32 `GND` to the ground breadboard rail (`GND`).
- Connect ESP32 `3V3` to a secondary `+3.3V` rail (for MPU6050 and DHT22).

### 2. MPU-6050 Vibration IMU
1. `VCC` -> `3.3V`
2. `GND` -> `GND`
3. `SCL` -> `GPIO 22`
4. `SDA` -> `GPIO 21`

### 3. DHT22 Temperature & Humidity
1. `Pin 1 (VCC)` -> `3.3V`
2. `Pin 2 (DATA)` -> `GPIO 4` (with a 4.7kΩ to 10kΩ pullup resistor between DATA and 3.3V)
3. `Pin 4 (GND)` -> `GND`

### 4. ACS712 Current Sensor
1. `VCC` -> `5V`
2. `GND` -> `GND`
3. `OUT` -> `GPIO 34` (Connect a voltage divider if using 5V output into 3.3V ADC: 10kΩ and 20kΩ, or calibrate offset in firmware).
> *Bench Testing Tip*: If an ACS712 is not available, connect a 10kΩ potentiometer between 3.3V, GND, and the wiper to `GPIO 34` to manually simulate variable motor load!

### 5. IR Speed Sensor (Tachometer & Part Counter)
1. `VCC` -> `3.3V`
2. `GND` -> `GND`
3. `DO (Digital Out)` -> `GPIO 18`

### 6. Actuators & Indicators
1. **Relay Module**: `IN` to `GPIO 25`, `VCC` to `5V`, `GND` to `GND`. Connect the normally open (`NO`) terminal in series with the motor/load circuit.
2. **Emergency Stop Button**: One terminal to `GPIO 15`, other terminal to `GND`.
3. **LEDs**: Connect Green (`GPIO 16`), Yellow (`GPIO 17`), and Red (`GPIO 5`) anodes via 330Ω resistors to the respective pins, cathodes to `GND`.
4. **Buzzer**: Anode to `GPIO 19`, cathode to `GND`.

---

## 💻 Arduino IDE Setup & Flashing

1. Install **Arduino IDE** (v2.x recommended).
2. Add ESP32 Board Support:
   - File -> Preferences -> Additional Board Manager URLs:
   - `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
3. Install Libraries via Library Manager (`Ctrl+Shift+I`):
   - `PubSubClient` (by Nick O'Leary)
   - `ArduinoJson` (by Benoit Blanchon, v6 or v7)
   - `Adafruit MPU6050` & `Adafruit Unified Sensor`
   - `DHT sensor library`
4. Open `smart_factory_esp32.ino`.
5. Update your WiFi credentials:
   ```cpp
   const char* WIFI_SSID     = "Your_WiFi_Name";
   const char* WIFI_PASSWORD = "Your_WiFi_Password";
   ```
6. Select Board: **ESP32 Dev Module** and the correct COM Port.
7. Click **Upload** and open the Serial Monitor at **115200 baud** to see real-time startup diagnostics!

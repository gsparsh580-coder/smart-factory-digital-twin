"""
================================================================================
AI-Driven Digital Twin for Smart Factory Operations
Component: Industrial Asset Synthetic Telemetry & Physics Simulator
================================================================================
Simulates realistic multi-physics industrial telemetry (vibration, temperature,
motor current, rotational speed, acoustics, lubrication pressure, and OEE).
Listens to bidirectional MQTT control commands from HiveMQ (E-Stop, Speed, Fault Injection).
"""

import json
import math
import random
import sys
import time
from datetime import datetime

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("[ERROR] paho-mqtt not installed. Run: pip install paho-mqtt")
    sys.exit(1)

# ================= Configuration =================
BROKER_HOST = "broker.hivemq.com"
BROKER_PORT = 1883
CLIENT_ID = f"SmartFactory_Simulator_{random.randint(1000, 9999)}"

# MQTT Topics
TOPIC_TELEMETRY = "factory/telemetry/machine1"
TOPIC_SYNTHETIC = "factory/telemetry/synthetic"
TOPIC_ALERTS = "factory/telemetry/alerts"
TOPIC_CONTROL_ESTOP = "factory/control/estop"
TOPIC_CONTROL_RESET = "factory/control/reset"
TOPIC_CONTROL_SPEED = "factory/control/speed"
TOPIC_CONTROL_MODE = "factory/control/mode"
TOPIC_CONTROL_ANOMALY = "factory/control/anomaly_inject"
TOPIC_CONTROL_SOURCE = "factory/control/source_select"

# Machine State & Physics Constants
class MachineState:
    def __init__(self):
        self.machine_id = "CNC_MILL_CELL_04"
        self.status = "RUNNING"  # RUNNING, IDLE, WARNING, CRITICAL_FAULT, EMERGENCY_STOP
        self.mode = "AUTO"  # AUTO, MANUAL, MAINTENANCE
        self.is_active_source = True  # Can be disabled if ESP32 physical is selected
        
        # Operational targets
        self.target_rpm = 1750.0
        self.current_rpm = 1750.0
        
        # Thermal model
        self.base_temp = 48.0
        self.temp_c = 48.0
        self.ambient_temp = 24.5
        
        # Mechanical model
        self.vibration_rms = 2.4
        self.vibration_peak = 3.6
        self.lubrication_psi = 54.0
        self.acoustic_db = 72.0
        
        # Electrical model
        self.current_a = 8.2
        self.power_factor = 0.88
        self.voltage_v = 415.0
        
        # Production metrics
        self.total_parts = 1420
        self.defect_parts = 18
        self.operating_seconds = 3600 * 8.5
        self.downtime_seconds = 420.0
        
        # Fault injection states
        self.active_fault = "NONE"  # NONE, BEARING_WEAR, THERMAL_RUNAWAY, MOTOR_STALL, IMBALANCE
        self.fault_intensity = 0.0  # 0.0 to 1.0
        self.fault_start_time = 0
        
        # AI Health metrics
        self.health_index = 96.5
        self.rul_hours = 1840.0
        self.anomaly_score = 0.04

state = MachineState()

def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"\n[OK] Connected to HiveMQ Broker ({BROKER_HOST}:{BROKER_PORT})")
        print(f"[OK] Client ID: {CLIENT_ID}")
        # Subscribe to control topics
        client.subscribe([
            (TOPIC_CONTROL_ESTOP, 1),
            (TOPIC_CONTROL_RESET, 1),
            (TOPIC_CONTROL_SPEED, 1),
            (TOPIC_CONTROL_MODE, 1),
            (TOPIC_CONTROL_ANOMALY, 1),
            (TOPIC_CONTROL_SOURCE, 1),
        ])
        print(f"[OK] Subscribed to control channels under 'factory/control/#'\n")
    else:
        print(f"[FAIL] Connection failed with code {rc}")

def on_message(client, userdata, msg):
    payload_str = msg.payload.decode("utf-8")
    topic = msg.topic
    print(f"\n[COMMAND RECEIVED] Topic: {topic} | Data: {payload_str}")
    
    try:
        data = json.loads(payload_str) if payload_str.startswith("{") else {"command": payload_str}
    except Exception:
        data = {"command": payload_str}
        
    if topic == TOPIC_CONTROL_ESTOP:
        state.status = "EMERGENCY_STOP"
        state.target_rpm = 0.0
        state.active_fault = "ESTOP_TRIGGERED"
        print(">>> 🛑 EMERGENCY STOP ACTIVATED VIA REMOTE CONTROL! Machine Halting!")
        
    elif topic == TOPIC_CONTROL_RESET:
        state.status = "RUNNING"
        state.target_rpm = 1750.0
        state.active_fault = "NONE"
        state.fault_intensity = 0.0
        print(">>> 🟢 SYSTEM RESET COMPLETED. Returning to baseline normal operation.")
        
    elif topic == TOPIC_CONTROL_SPEED:
        new_speed = data.get("targetRpm") or data.get("speed")
        if new_speed is not None:
            state.target_rpm = max(0.0, min(3200.0, float(new_speed)))
            if state.status == "EMERGENCY_STOP" and state.target_rpm > 0:
                state.status = "RUNNING"
            print(f">>> ⚡ Target RPM updated to: {state.target_rpm:.1f} RPM")
            
    elif topic == TOPIC_CONTROL_MODE:
        new_mode = data.get("mode") or data.get("command")
        if new_mode in ["AUTO", "MANUAL", "MAINTENANCE"]:
            state.mode = new_mode
            print(f">>> ⚙️ Operation Mode shifted to: {state.mode}")
            
    elif topic == TOPIC_CONTROL_ANOMALY:
        fault = data.get("type") or data.get("fault") or "NONE"
        fault = str(fault).upper()
        if fault in ["BEARING_WEAR", "THERMAL_RUNAWAY", "MOTOR_STALL", "IMBALANCE", "NONE"]:
            state.active_fault = fault
            state.fault_intensity = 0.1 if fault != "NONE" else 0.0
            state.fault_start_time = time.time()
            print(f">>> 🧪 Fault injected: {state.active_fault}")
            
    elif topic == TOPIC_CONTROL_SOURCE:
        src = str(data.get("source", "")).lower()
        if "esp" in src or "hardware" in src or "real" in src:
            state.is_active_source = False
            print(">>> 🔌 Switched primary telemetry to Physical ESP32 Hardware (Simulator standby)")
        else:
            state.is_active_source = True
            print(">>> 🧪 Switched primary telemetry to Synthetic Simulator")

def update_physics(dt=1.0):
    """Multi-physics numerical integration for factory asset"""
    t = time.time()
    
    # 1. RPM dynamic transition (smooth inertia)
    if state.status == "EMERGENCY_STOP":
        state.target_rpm = 0.0
        state.current_rpm = max(0.0, state.current_rpm - 350.0 * dt)
    else:
        rpm_diff = state.target_rpm - state.current_rpm
        state.current_rpm += rpm_diff * min(1.0, 1.2 * dt)
        
    rpm_ratio = state.current_rpm / 1750.0 if state.current_rpm > 0 else 0.0

    # 2. Fault evolution progression
    if state.active_fault != "NONE" and state.status != "EMERGENCY_STOP":
        elapsed = t - state.fault_start_time
        state.fault_intensity = min(1.0, state.fault_intensity + 0.03 * dt)
    else:
        state.fault_intensity = max(0.0, state.fault_intensity - 0.08 * dt)

    # 3. Vibration Simulation (Multi-harmonic + stochastic noise + bearing harmonics)
    base_vib = 2.0 * rpm_ratio + 0.3 * math.sin(t * 3.5) + random.uniform(-0.15, 0.15)
    
    if state.active_fault == "BEARING_WEAR":
        # Ball pass frequency defect pulses
        defect_pulse = 8.0 * math.sin(t * 28.0) * math.sin(t * 7.0)
        base_vib += (12.0 * state.fault_intensity) + abs(defect_pulse * state.fault_intensity)
    elif state.active_fault == "IMBALANCE":
        # 1X rotational unbalance
        base_vib += 9.5 * state.fault_intensity * math.sin(t * (state.current_rpm / 60.0) * 2 * math.pi)
    elif state.active_fault == "MOTOR_STALL":
        base_vib += 5.0 * state.fault_intensity * random.uniform(0.5, 1.5)
        
    state.vibration_rms = max(0.05, round(base_vib, 2))
    state.vibration_peak = round(state.vibration_rms * random.uniform(1.35, 1.65), 2)

    # 4. Temperature Simulation (Heat generation proportional to I^2 R and friction, minus cooling)
    target_temp = state.ambient_temp + (25.0 * rpm_ratio)
    if state.active_fault == "THERMAL_RUNAWAY":
        target_temp += 55.0 * state.fault_intensity
    elif state.active_fault == "BEARING_WEAR":
        target_temp += 18.0 * state.fault_intensity
    elif state.active_fault == "MOTOR_STALL":
        target_temp += 48.0 * state.fault_intensity

    # Thermal dissipation time constant
    cooling_rate = 0.05 * dt
    state.temp_c += (target_temp - state.temp_c) * cooling_rate + random.uniform(-0.08, 0.08)
    state.temp_c = round(state.temp_c, 2)

    # 5. Motor Current & Power
    base_current = 2.5 + (6.0 * rpm_ratio) + random.uniform(-0.2, 0.2)
    if state.active_fault == "MOTOR_STALL":
        base_current += 28.0 * state.fault_intensity
    elif state.active_fault == "BEARING_WEAR":
        base_current += 3.5 * state.fault_intensity
    elif state.status == "EMERGENCY_STOP" or state.current_rpm < 10:
        base_current = 0.05

    state.current_a = max(0.0, round(base_current, 2))
    # 3-phase active power in kW: P = sqrt(3) * V * I * pf / 1000
    state.power_kw = round((math.sqrt(3) * state.voltage_v * state.current_a * state.power_factor) / 1000.0, 2)

    # 6. Lubrication pressure & acoustics
    base_psi = 55.0 - (5.0 * rpm_ratio) + random.uniform(-0.5, 0.5)
    if state.active_fault == "THERMAL_RUNAWAY":
        base_psi -= 16.0 * state.fault_intensity
    state.lubrication_psi = max(10.0, round(base_psi, 1))

    base_acoustics = 62.0 + (14.0 * rpm_ratio) + random.uniform(-0.8, 0.8)
    if state.active_fault == "BEARING_WEAR":
        base_acoustics += 18.0 * state.fault_intensity
    elif state.active_fault == "MOTOR_STALL":
        base_acoustics += 12.0 * state.fault_intensity
    state.acoustic_db = round(base_acoustics, 1)

    # 7. Production & Parts counter
    if state.status == "RUNNING" and state.current_rpm > 1200:
        state.operating_seconds += dt
        if random.random() < (0.22 * dt):  # New part every ~4.5 seconds
            state.total_parts += 1
            # Defect probability rises with vibration and thermal stress
            defect_prob = 0.015 + (0.35 * state.fault_intensity)
            if random.random() < defect_prob:
                state.defect_parts += 1
    elif state.status in ["WARNING", "CRITICAL_FAULT", "EMERGENCY_STOP"]:
        state.downtime_seconds += dt

    # 8. AI Anomaly Score & Health Index
    vib_penalty = max(0.0, (state.vibration_rms - 3.5) * 5.0)
    temp_penalty = max(0.0, (state.temp_c - 65.0) * 2.2)
    curr_penalty = max(0.0, (state.current_a - 14.0) * 3.0)
    total_stress = min(100.0, vib_penalty + temp_penalty + curr_penalty)
    
    state.anomaly_score = round(min(1.0, total_stress / 75.0), 3)
    state.health_index = round(max(0.0, 100.0 - total_stress), 1)
    
    # Remaining useful life estimation
    degradation_rate = 1.0 + (total_stress * 0.15)
    state.rul_hours = max(2.0, round(1800.0 * (state.health_index / 100.0) ** 1.8, 1))

    # Determine Machine State Status
    if state.status != "EMERGENCY_STOP":
        if state.temp_c > 88.0 or state.vibration_rms > 16.0 or state.current_a > 25.0:
            state.status = "CRITICAL_FAULT"
        elif state.temp_c > 70.0 or state.vibration_rms > 7.0 or state.current_a > 14.0:
            state.status = "WARNING"
        elif state.current_rpm < 100:
            state.status = "IDLE"
        else:
            state.status = "RUNNING"

def calculate_oee():
    """Overall Equipment Effectiveness Calculation"""
    total_time = state.operating_seconds + state.downtime_seconds
    availability = (state.operating_seconds / total_time) * 100.0 if total_time > 0 else 100.0
    
    # Target output: 14 parts per minute at full speed
    expected_parts = (state.operating_seconds / 60.0) * 13.5
    performance = min(100.0, (state.total_parts / expected_parts) * 100.0) if expected_parts > 0 else 98.0
    
    good_parts = max(0, state.total_parts - state.defect_parts)
    quality = (good_parts / state.total_parts) * 100.0 if state.total_parts > 0 else 100.0
    
    overall = (availability * performance * quality) / 10000.0
    return {
        "availability": round(availability, 1),
        "performance": round(performance, 1),
        "quality": round(quality, 1),
        "overall": round(overall, 1)
    }

def build_payload():
    oee = calculate_oee()
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    
    payload = {
        "timestamp": now_iso,
        "machine_id": state.machine_id,
        "source": "SYNTHETIC_SIMULATOR",
        "status": state.status,
        "mode": state.mode,
        "telemetry": {
            "rpm": round(state.current_rpm, 1),
            "target_rpm": round(state.target_rpm, 1),
            "vibration_rms": state.vibration_rms,
            "vibration_peak": state.vibration_peak,
            "temperature_c": state.temp_c,
            "ambient_temp_c": state.ambient_temp,
            "current_a": state.current_a,
            "power_kw": state.power_kw,
            "pressure_psi": state.lubrication_psi,
            "acoustic_db": state.acoustic_db
        },
        "production": {
            "total_parts": state.total_parts,
            "defect_parts": state.defect_parts,
            "good_parts": state.total_parts - state.defect_parts,
            "cycle_time_s": 4.2
        },
        "oee": oee,
        "ai_analytics": {
            "health_index": state.health_index,
            "rul_hours": state.rul_hours,
            "anomaly_score": state.anomaly_score,
            "active_fault": state.active_fault,
            "fault_intensity": round(state.fault_intensity, 2),
            "recommendation": get_ai_recommendation()
        }
    }
    return payload

def get_ai_recommendation():
    if state.status == "EMERGENCY_STOP":
        return "🛑 CRITICAL: Asset Halted. Inspect physical cell before clearance."
    if state.active_fault == "BEARING_WEAR" or state.vibration_rms > 12.0:
        return "⚠️ High-Frequency Vibration: Immediate bearing greasing/replacement advised within 48h."
    if state.active_fault == "THERMAL_RUNAWAY" or state.temp_c > 80.0:
        return "⚠️ Thermal Overload: Coolant fluid blockage suspected. Reduce feed rate."
    if state.active_fault == "MOTOR_STALL" or state.current_a > 20.0:
        return "⚠️ Stator Current Surge: Check conveyor jamming or spindle mechanical bind."
    if state.health_index > 90.0:
        return "✅ Optimal Performance: Asset operating within design specifications."
    return "ℹ️ Nominal wear: Routine scheduled inspection at next shift change."

def main():
    print("=" * 75)
    print("   AI-DRIVEN DIGITAL TWIN: SMART FACTORY SYNTHETIC SIMULATOR")
    print(f"   Connecting to HiveMQ: {BROKER_HOST}:{BROKER_PORT}")
    print("=" * 75)

    client = mqtt.Client(client_id=CLIENT_ID, protocol=mqtt.MQTTv311)
    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(BROKER_HOST, BROKER_PORT, 60)
        client.loop_start()
    except Exception as e:
        print(f"[FAIL] Could not connect to HiveMQ: {e}")
        return

    print("\nTelemetry publishing cycle started (1 Hz). Press Ctrl+C to terminate.\n")
    try:
        while True:
            t0 = time.time()
            update_physics(dt=1.0)
            payload = build_payload()
            json_str = json.dumps(payload, indent=2)

            # Always publish to synthetic topic
            client.publish(TOPIC_SYNTHETIC, json_str, qos=0)

            # If simulator is the active primary source, publish to primary topic
            if state.is_active_source:
                client.publish(TOPIC_TELEMETRY, json_str, qos=0)

            # If alert threshold reached, publish alert
            if state.status in ["WARNING", "CRITICAL_FAULT", "EMERGENCY_STOP"]:
                alert_payload = json.dumps({
                    "timestamp": payload["timestamp"],
                    "machine_id": state.machine_id,
                    "level": state.status,
                    "fault": state.active_fault,
                    "vibration": state.vibration_rms,
                    "temperature": state.temp_c,
                    "recommendation": payload["ai_analytics"]["recommendation"]
                })
                client.publish(TOPIC_ALERTS, alert_payload, qos=1)

            # Console output
            status_symbol = "🟢" if state.status == "RUNNING" else ("🛑" if state.status == "EMERGENCY_STOP" else "⚠️")
            print(f"[{payload['timestamp'][11:19]}] {status_symbol} {state.status:<14} | "
                  f"RPM: {state.current_rpm:>6.1f} | "
                  f"Temp: {state.temp_c:>5.1f}°C | "
                  f"Vib: {state.vibration_rms:>4.1f} mm/s | "
                  f"Curr: {state.current_a:>4.1f}A | "
                  f"Health: {state.health_index:>5.1f}% | "
                  f"Fault: {state.active_fault}")

            elapsed = time.time() - t0
            time.sleep(max(0.1, 1.0 - elapsed))

    except KeyboardInterrupt:
        print("\n[STOP] Shutting down factory simulator cleanly...")
        client.loop_stop()
        client.disconnect()
        print("[OK] Simulator stopped.")

if __name__ == "__main__":
    main()

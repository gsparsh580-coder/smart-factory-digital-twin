"""
================================================================================
AI-Driven Digital Twin for Smart Factory Operations
Component: Predictive Maintenance, Anomaly Detection & RUL Estimation Engine
================================================================================
Implements:
  1. Isolation Forest for Unsupervised Anomaly Scoring (0.0 to 1.0)
  2. Multi-class Fault Classification (Bearing wear, Overheating, Stall, Imbalance)
  3. Remaining Useful Life (RUL) Regressor for automated PdM scheduling
  4. Real-time HiveMQ MQTT subscriber & inference publisher
"""

import json
import os
import random
import sys
import time
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("[ERROR] paho-mqtt not installed. Run: pip install paho-mqtt")
    sys.exit(1)

# ================= Configuration =================
BROKER_HOST = "broker.hivemq.com"
BROKER_PORT = 1883
CLIENT_ID = f"SmartFactory_AIEngine_{random.randint(1000, 9999)}"

TOPIC_TELEMETRY = "factory/telemetry/machine1"
TOPIC_ANALYTICS_HEALTH = "factory/analytics/health"
TOPIC_ANALYTICS_ANOMALIES = "factory/analytics/anomalies"

FAULT_LABELS = {
    0: "NORMAL",
    1: "BEARING_WEAR",
    2: "THERMAL_OVERLOAD",
    3: "MOTOR_STALL",
    4: "MECHANICAL_IMBALANCE"
}

class SmartFactoryAIEngine:
    def __init__(self):
        self.scaler = StandardScaler()
        self.anomaly_detector = IsolationForest(contamination=0.08, random_state=42)
        self.fault_classifier = RandomForestClassifier(n_estimators=60, max_depth=8, random_state=42)
        self.rul_regressor = GradientBoostingRegressor(n_estimators=75, max_depth=4, random_state=42)
        self.is_trained = False

    def generate_synthetic_training_dataset(self, samples_per_class=1200):
        """Generates realistic industrial multivariate dataset with physics-grounded noise"""
        print("[AI] Synthesizing physics-based training dataset...")
        np.random.seed(42)
        data = []

        # 1. Normal Operation
        for _ in range(samples_per_class * 2):
            rpm = np.random.normal(1750, 35)
            vib_rms = np.random.normal(2.2, 0.45)
            temp = np.random.normal(48.0, 4.0)
            current = np.random.normal(8.0, 1.2)
            acoustic = np.random.normal(70.0, 2.5)
            psi = np.random.normal(54.0, 2.0)
            rul = np.random.uniform(1400, 2200)
            data.append([rpm, vib_rms, temp, current, acoustic, psi, 0, rul])

        # 2. Bearing Wear / Degradation (High vibration, higher acoustic, slight temperature rise)
        for _ in range(samples_per_class):
            intensity = np.random.uniform(0.3, 1.0)
            rpm = np.random.normal(1720, 45)
            vib_rms = np.random.normal(12.0 * intensity + 3.0, 1.8)
            temp = np.random.normal(58.0 + (16.0 * intensity), 5.0)
            current = np.random.normal(9.5 + (2.5 * intensity), 1.4)
            acoustic = np.random.normal(82.0 + (14.0 * intensity), 3.0)
            psi = np.random.normal(52.0, 3.0)
            rul = np.random.uniform(20, 280 * (1.0 - intensity * 0.7))
            data.append([rpm, vib_rms, temp, current, acoustic, psi, 1, rul])

        # 3. Thermal Overload (Cooling failure / lubrication breakdown)
        for _ in range(samples_per_class):
            intensity = np.random.uniform(0.4, 1.0)
            rpm = np.random.normal(1680, 50)
            vib_rms = np.random.normal(3.8, 0.7)
            temp = np.random.normal(78.0 + (28.0 * intensity), 4.5)
            current = np.random.normal(9.8 + (3.0 * intensity), 1.5)
            acoustic = np.random.normal(73.0, 2.8)
            psi = np.random.normal(42.0 - (18.0 * intensity), 4.0)
            rul = np.random.uniform(10, 180 * (1.0 - intensity * 0.8))
            data.append([rpm, vib_rms, temp, current, acoustic, psi, 2, rul])

        # 4. Motor Stall / Current Surge (Mechanical bind / Conveyor jamming)
        for _ in range(samples_per_class):
            intensity = np.random.uniform(0.5, 1.0)
            rpm = np.random.normal(150.0 * (1.0 - intensity), 80.0)
            vib_rms = np.random.normal(5.5, 1.2)
            temp = np.random.normal(68.0 + (24.0 * intensity), 6.0)
            current = np.random.normal(24.0 + (18.0 * intensity), 4.0)
            acoustic = np.random.normal(76.0, 3.5)
            psi = np.random.normal(50.0, 3.0)
            rul = np.random.uniform(1, 45)
            data.append([rpm, vib_rms, temp, current, acoustic, psi, 3, rul])

        # 5. Mechanical Imbalance (1X RPM dynamic vibration)
        for _ in range(samples_per_class):
            intensity = np.random.uniform(0.3, 1.0)
            rpm = np.random.normal(1740, 40)
            vib_rms = np.random.normal(8.5 * intensity + 2.5, 1.2)
            temp = np.random.normal(52.0, 3.5)
            current = np.random.normal(8.8, 1.1)
            acoustic = np.random.normal(78.0, 2.5)
            psi = np.random.normal(53.0, 2.5)
            rul = np.random.uniform(80, 550)
            data.append([rpm, vib_rms, temp, current, acoustic, psi, 4, rul])

        columns = ["rpm", "vibration_rms", "temperature_c", "current_a", "acoustic_db", "pressure_psi", "fault_class", "rul_hours"]
        df = pd.DataFrame(data, columns=columns)
        return df

    def train_models(self):
        df = self.generate_synthetic_training_dataset()
        feature_cols = ["rpm", "vibration_rms", "temperature_c", "current_a", "acoustic_db", "pressure_psi"]
        
        X = df[feature_cols].values
        y_class = df["fault_class"].values
        y_rul = df["rul_hours"].values

        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        print("[AI] Training Unsupervised Isolation Forest Anomaly Detector...")
        # Train isolation forest primarily on normal subset
        normal_mask = (y_class == 0)
        self.anomaly_detector.fit(X_scaled[normal_mask])

        print("[AI] Training Supervised Fault Classifier (Random Forest)...")
        self.fault_classifier.fit(X_scaled, y_class)

        print("[AI] Training Predictive Maintenance RUL Regressor (Gradient Boosting)...")
        self.rul_regressor.fit(X_scaled, y_rul)

        self.is_trained = True
        print("[AI] All models successfully trained and operational!")

    def predict_telemetry(self, raw_features):
        """
        Input: dict with rpm, vibration_rms, temperature_c, current_a, acoustic_db, pressure_psi
        Returns: AI diagnosis dict
        """
        if not self.is_trained:
            self.train_models()

        feats = np.array([[
            float(raw_features.get("rpm", 1750)),
            float(raw_features.get("vibration_rms", 2.2)),
            float(raw_features.get("temperature_c", 48.0)),
            float(raw_features.get("current_a", 8.0)),
            float(raw_features.get("acoustic_db", 70.0)),
            float(raw_features.get("pressure_psi", 54.0))
        ]])

        scaled = self.scaler.transform(feats)

        # 1. Anomaly score (-1 is anomaly, 1 is normal) -> normalized to [0.0, 1.0]
        raw_anomaly_score = self.anomaly_detector.decision_function(scaled)[0]
        # Invert and scale: lower decision function means higher anomaly
        anomaly_score = float(np.clip(1.0 - (raw_anomaly_score + 0.5) / 1.0, 0.0, 1.0))

        # 2. Fault classification & probabilities
        probs = self.fault_classifier.predict_proba(scaled)[0]
        predicted_class_id = int(np.argmax(probs))
        fault_name = FAULT_LABELS.get(predicted_class_id, "UNKNOWN")
        confidence = float(np.max(probs))

        # If anomaly score is very low, override to NORMAL
        if anomaly_score < 0.25 and predicted_class_id != 0:
            fault_name = "NORMAL"
            confidence = 0.92

        # 3. Remaining Useful Life (RUL) estimation
        pred_rul = float(np.clip(self.rul_regressor.predict(scaled)[0], 2.0, 2200.0))

        # 4. Composite Health Index (0 - 100%)
        health_index = float(np.clip(100.0 * (1.0 - anomaly_score * 0.9), 5.0, 100.0))

        return {
            "health_index": round(health_index, 1),
            "anomaly_score": round(anomaly_score, 3),
            "predicted_fault": fault_name,
            "confidence": round(confidence * 100, 1),
            "rul_hours": round(pred_rul, 1),
            "is_anomalous": bool(anomaly_score > 0.45 or predicted_class_id != 0),
            "class_probabilities": {FAULT_LABELS[i]: round(float(p), 3) for i, p in enumerate(probs)}
        }

ai_engine = SmartFactoryAIEngine()

# ================= MQTT INGESTION & INFERENCE =================
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[OK] AI Engine connected to HiveMQ ({BROKER_HOST}:{BROKER_PORT})")
        client.subscribe(TOPIC_TELEMETRY, qos=0)
        print(f"[OK] Subscribed to real-time telemetry stream: {TOPIC_TELEMETRY}")
    else:
        print(f"[FAIL] HiveMQ connection failed (code {rc})")

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        telemetry = payload.get("telemetry", {})
        if not telemetry:
            return

        # Run AI inference
        diagnosis = ai_engine.predict_telemetry(telemetry)

        # Enriched analytics packet
        analytics_packet = {
            "timestamp": payload.get("timestamp", datetime.utcnow().isoformat()),
            "machine_id": payload.get("machine_id", "CNC_MILL_CELL_04"),
            "ai_diagnosis": diagnosis
        }

        # Publish analytics back to MQTT
        client.publish(TOPIC_ANALYTICS_HEALTH, json.dumps(analytics_packet), qos=0)

        if diagnosis["is_anomalous"]:
            client.publish(TOPIC_ANALYTICS_ANOMALIES, json.dumps({
                "timestamp": analytics_packet["timestamp"],
                "machine_id": analytics_packet["machine_id"],
                "alert": f"AI Warning: {diagnosis['predicted_fault']} detected (Confidence: {diagnosis['confidence']}%)",
                "diagnosis": diagnosis
            }), qos=1)

            print(f"[AI ALERT] {diagnosis['predicted_fault']} | Health: {diagnosis['health_index']}% | "
                  f"RUL: {diagnosis['rul_hours']}h | Conf: {diagnosis['confidence']}%")

    except Exception as e:
        print(f"[WARN] Inference error on message: {e}")

def main():
    print("=" * 70)
    print("   AI PREDICTIVE MAINTENANCE & DIGITAL TWIN ANALYTICS SERVICE   ")
    print("=" * 70)

    ai_engine.train_models()

    client = mqtt.Client(client_id=CLIENT_ID, protocol=mqtt.MQTTv311)
    client.on_connect = on_connect
    client.on_message = on_message

    print(f"\n[AI] Connecting to HiveMQ Broker: {BROKER_HOST}:{BROKER_PORT}")
    try:
        client.connect(BROKER_HOST, BROKER_PORT, 60)
        client.loop_forever()
    except KeyboardInterrupt:
        print("\n[AI] Engine shutting down...")
        client.disconnect()

if __name__ == "__main__":
    main()

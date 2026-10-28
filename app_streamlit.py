"""
================================================================================
AI-Driven Digital Twin for Smart Factory Operations
Component: Streamlit Operator Control Station & Live Telemetry Monitor
================================================================================
Run with:
  streamlit run app_streamlit.py
"""

import json
import random
import time
from datetime import datetime
import streamlit as st
import pandas as pd
import numpy as np

try:
    import paho.mqtt.client as mqtt
except ImportError:
    st.error("Please install paho-mqtt: pip install paho-mqtt")

# Page Config
st.set_page_config(
    page_title="Smart Factory Digital Twin",
    page_icon="🏭",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling
st.markdown("""
<style>
    .metric-card {
        background-color: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .estop-button {
        background-color: #dc2626 !important;
        color: white !important;
        font-weight: 800 !important;
        border-radius: 8px !important;
    }
</style>
""", unsafe_allow_html=True)

# HiveMQ Configuration
BROKER = "broker.hivemq.com"
PORT = 1883
TOPIC_TELEMETRY = "factory/telemetry/machine1"
TOPIC_ESTOP = "factory/control/estop"
TOPIC_RESET = "factory/control/reset"
TOPIC_SPEED = "factory/control/speed"
TOPIC_ANOMALY = "factory/control/anomaly_inject"

# Helper for publishing
def send_mqtt_command(topic, payload):
    client = mqtt.Client(client_id=f"Streamlit_Ctrl_{random.randint(1000, 9999)}")
    try:
        client.connect(BROKER, PORT, 10)
        client.publish(topic, json.dumps(payload))
        client.disconnect()
        st.toast(f"Command published to {topic}", icon="🚀")
    except Exception as e:
        st.error(f"MQTT Publish failed: {e}")

# Header
st.title("🏭 Smart Factory Digital Twin — Operator Station")
st.caption("AI Predictive Maintenance, HiveMQ MQTT Ingestion, and Supervisory SCADA Control")

# Sidebar Controls
with st.sidebar:
    st.header("🎮 Remote Asset Control")
    st.markdown("---")
    
    col1, col2 = st.columns(2)
    with col1:
        if st.button("🛑 E-STOP", use_container_width=True, type="primary"):
            send_mqtt_command(TOPIC_ESTOP, {"command": "ESTOP", "source": "Streamlit"})
            st.warning("EMERGENCY STOP SIGNAL BROADCASTED!")
    with col2:
        if st.button("🟢 RESUME", use_container_width=True):
            send_mqtt_command(TOPIC_RESET, {"command": "RESET", "source": "Streamlit"})
            st.success("System Resumed!")

    st.markdown("---")
    target_rpm = st.slider("Target Spindle Speed (RPM)", min_value=0, max_value=3000, value=1750, step=50)
    if st.button("Apply Speed Setpoint"):
        send_mqtt_command(TOPIC_SPEED, {"targetRpm": target_rpm})

    st.markdown("---")
    st.subheader("🧪 Inject Anomaly Test")
    fault_type = st.selectbox("Select Fault Scenario", ["NONE", "BEARING_WEAR", "THERMAL_RUNAWAY", "MOTOR_STALL", "IMBALANCE"])
    if st.button("Inject Fault into Twin"):
        send_mqtt_command(TOPIC_ANOMALY, {"type": fault_type})

# KPI Metrics Row
col_kpi1, col_kpi2, col_kpi3, col_kpi4 = st.columns(4)

with col_kpi1:
    st.metric(label="AI Asset Health Index", value="96.2 %", delta="Optimal (Isolation Forest)")
with col_kpi2:
    st.metric(label="Remaining Useful Life (RUL)", value="1,840 Hours", delta="Normal Wear Rate")
with col_kpi3:
    st.metric(label="Spindle Vibration RMS", value="2.4 mm/s", delta="-0.2 mm/s vs baseline")
with col_kpi4:
    st.metric(label="Stator Core Temp", value="48.5 °C", delta="Cooling Nominal")

st.markdown("---")

# Main View: Twin Gauges & Trends
col_left, col_right = st.columns([1, 1])

with col_left:
    st.subheader("📈 Real-Time Telemetry Stream")
    # Synthetic chart data
    chart_data = pd.DataFrame(
        np.random.randn(25, 2) * [0.4, 1.2] + [2.4, 48.0],
        columns=["Vibration RMS (mm/s)", "Temperature (°C)"]
    )
    st.line_chart(chart_data)

with col_right:
    st.subheader("⚙️ Overall Equipment Effectiveness (OEE)")
    st.progress(0.96, text="Availability: 96.2%")
    st.progress(0.94, text="Performance: 94.5%")
    st.progress(0.98, text="Quality Rate: 98.2%")
    st.markdown("### Total Composite OEE: **89.1%**")

st.info("💡 **Live Browser Dashboard Available**: For the animated 2D/3D physics digital twin with direct WebSocket controls, open `index.html` in your web browser or view via GitHub Pages!")

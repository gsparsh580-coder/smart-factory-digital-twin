/**
 * ==============================================================================
 * AI-Driven Digital Twin for Smart Factory Operations
 * Main Application Logic & Real-Time Physics Canvas Renderer
 * ==============================================================================
 */

// ================= GLOBAL STATE =================
const AppState = {
  // MQTT Configuration
  broker: {
    host: 'broker.hivemq.com',
    port: 8884, // WSS default
    path: '/mqtt',
    telemetryTopic: 'factory/telemetry/machine1',
    controlPrefix: 'factory/control/'
  },
  
  // Connection & Source
  isConnected: false,
  selectedSource: 'synthetic', // 'synthetic', 'esp32', 'inbrowser'
  audioEnabled: true,
  
  // Live Telemetry Mirror
  machine: {
    id: 'CNC_MILL_CELL_04',
    status: 'RUNNING', // RUNNING, WARNING, CRITICAL_FAULT, EMERGENCY_STOP
    mode: 'AUTO',
    rpm: 1750.0,
    targetRpm: 1750.0,
    vibrationRms: 2.4,
    vibrationPeak: 3.6,
    tempC: 48.2,
    currentA: 8.2,
    powerKw: 5.2,
    lubricationPsi: 54.0,
    acousticDb: 72.4,
    totalParts: 1420,
    defectParts: 18,
    goodParts: 1402,
    cycleTimeS: 4.20,
    healthIndex: 96.5,
    rulHours: 1840.0,
    anomalyScore: 0.04,
    activeFault: 'NONE',
    recommendation: 'Asset running optimally. No immediate service required.',
    oee: {
      availability: 96.2,
      performance: 94.5,
      quality: 98.2,
      overall: 89.4
    }
  },

  // Internal Simulator State (used when inbrowser source or standalone demo)
  sim: {
    lastTick: performance.now(),
    particles: [],
    conveyorOffset: 0,
    spindleAngle: 0,
    partsOnBelt: [
      { x: 120, isDefect: false },
      { x: 260, isDefect: false },
      { x: 400, isDefect: false },
      { x: 540, isDefect: true }
    ],
    faultIntensity: 0.0
  }
};

// ================= DOM ELEMENT REFERENCES =================
const DOM = {
  // Badges & Status
  mqttStatusBadge: document.getElementById('mqttStatusBadge'),
  mqttStatusText: document.getElementById('mqttStatusText'),
  activeSourceText: document.getElementById('activeSourceText'),
  machineStateBadge: document.getElementById('machineStateBadge'),
  machineStateText: document.getElementById('machineStateText'),
  estopAlertBanner: document.getElementById('estopAlertBanner'),
  
  // Metrics & Gauges
  metricHealthIndex: document.getElementById('metricHealthIndex'),
  barHealthIndex: document.getElementById('barHealthIndex'),
  metricRulHours: document.getElementById('metricRulHours'),
  metricAnomalyStatus: document.getElementById('metricAnomalyStatus'),
  metricRpm: document.getElementById('metricRpm'),
  metricTargetRpm: document.getElementById('metricTargetRpm'),
  rpmPill: document.getElementById('rpmPill'),
  metricVibration: document.getElementById('metricVibration'),
  barVibration: document.getElementById('barVibration'),
  vibPeakText: document.getElementById('vibPeakText'),
  metricTemp: document.getElementById('metricTemp'),
  barTemp: document.getElementById('barTemp'),
  tempStatePill: document.getElementById('tempStatePill'),
  metricCurrent: document.getElementById('metricCurrent'),
  metricPower: document.getElementById('metricPower'),
  
  // OEE & Counters
  oeeOverall: document.getElementById('oeeOverall'),
  oeeAvailability: document.getElementById('oeeAvailability'),
  barOeeAvailability: document.getElementById('barOeeAvailability'),
  oeePerformance: document.getElementById('oeePerformance'),
  barOeePerformance: document.getElementById('barOeePerformance'),
  oeeQuality: document.getElementById('oeeQuality'),
  barOeeQuality: document.getElementById('barOeeQuality'),
  countTotalParts: document.getElementById('countTotalParts'),
  countGoodParts: document.getElementById('countGoodParts'),
  countDefects: document.getElementById('countDefects'),
  metricLubePsi: document.getElementById('metricLubePsi'),
  metricAcousticDb: document.getElementById('metricAcousticDb'),
  metricCycleTime: document.getElementById('metricCycleTime'),

  // AI Card
  aiDiagnosisTitle: document.getElementById('aiDiagnosisTitle'),
  aiDiagnosisRecommendation: document.getElementById('aiDiagnosisRecommendation'),
  aiDiagnosisConfidence: document.getElementById('aiDiagnosisConfidence'),
  aiDiagnosisIcon: document.getElementById('aiDiagnosisIcon'),

  // Controls
  btnEstop: document.getElementById('btnEstop'),
  btnResume: document.getElementById('btnResume'),
  btnResetAlarms: document.getElementById('btnResetAlarms'),
  btnBannerReset: document.getElementById('btnBannerReset'),
  speedSlider: document.getElementById('speedSlider'),
  speedSliderValue: document.getElementById('speedSliderValue'),
  selectMode: document.getElementById('selectMode'),
  selectDataSource: document.getElementById('selectDataSource'),
  btnInjectBearing: document.getElementById('btnInjectBearing'),
  btnInjectThermal: document.getElementById('btnInjectThermal'),
  btnInjectStall: document.getElementById('btnInjectStall'),
  btnClearFaults: document.getElementById('btnClearFaults'),
  
  // Modal & Audio
  btnOpenSettings: document.getElementById('btnOpenSettings'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  btnSaveSettings: document.getElementById('btnSaveSettings'),
  btnResetSettings: document.getElementById('btnResetSettings'),
  settingsModal: document.getElementById('settingsModal'),
  btnToggleAudio: document.getElementById('btnToggleAudio'),
  audioIcon: document.getElementById('audioIcon'),
  btnClearLog: document.getElementById('btnClearLog'),
  eventLogContainer: document.getElementById('eventLogContainer'),

  // Canvas
  canvas: document.getElementById('digitalTwinCanvas'),
  canvasFps: document.getElementById('canvasFps'),
  jitterIndicator: document.getElementById('jitterIndicator'),
  canvasOverlayFault: document.getElementById('canvasOverlayFault'),
  canvasPartsCounter: document.getElementById('canvasPartsCounter')
};

// ================= WEB AUDIO SYNTHESIZER =================
class AudioEngine {
  constructor() {
    this.ctx = null;
  }
  
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  beep(freq = 600, type = 'sine', duration = 0.1, gainVal = 0.1) {
    if (!AppState.audioEnabled) return;
    this.init();
    if (!this.ctx) return;
    
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  alarmSiren() {
    if (!AppState.audioEnabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(350, this.ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.4);
    } catch (e) {}
  }
}

const audio = new AudioEngine();

// ================= REAL-TIME CHART.JS SETUP =================
let trendChart = null;

function initTelemetryChart() {
  const ctx = document.getElementById('telemetryTrendChart').getContext('2d');
  
  const labels = Array(30).fill('').map((_, i) => `-${30 - i}s`);
  const initialVib = Array(30).fill(2.4);
  const initialTemp = Array(30).fill(48.0);

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Vibration RMS (mm/s)',
          data: initialVib,
          borderColor: '#c084fc',
          backgroundColor: 'rgba(192, 132, 252, 0.08)',
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'yVib',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Stator Temp (°C)',
          data: initialTemp,
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'yTemp',
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
        },
        yVib: {
          type: 'linear',
          position: 'left',
          min: 0,
          max: 20,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#c084fc', font: { family: 'JetBrains Mono', size: 10 } },
          title: { display: true, text: 'Vibration (mm/s)', color: '#c084fc', font: { size: 10 } }
        },
        yTemp: {
          type: 'linear',
          position: 'right',
          min: 20,
          max: 110,
          grid: { drawOnChartArea: false },
          ticks: { color: '#f59e0b', font: { family: 'JetBrains Mono', size: 10 } },
          title: { display: true, text: 'Temp (°C)', color: '#f59e0b', font: { size: 10 } }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function updateTelemetryChart(vib, temp) {
  if (!trendChart) return;
  const datasets = trendChart.data.datasets;
  
  datasets[0].data.shift();
  datasets[0].data.push(vib);

  datasets[1].data.shift();
  datasets[1].data.push(temp);

  trendChart.update('none');
}

// ================= MQTT.JS WEBSOCKET CLIENT =================
let mqttClient = null;

function connectMqtt() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'wss'; // Default to secure WSS
  const url = `${protocol}://${AppState.broker.host}:${AppState.broker.port}${AppState.broker.path}`;
  
  logEvent(`Connecting to HiveMQ Broker: ${url}...`, 'text-cyan-400');
  updateMqttBadge('connecting', `Connecting to HiveMQ (${AppState.broker.host})...`);

  const clientId = `SmartFactory_Web_${Math.random().toString(16).substring(2, 8)}`;

  try {
    if (mqttClient) {
      mqttClient.end(true);
    }

    mqttClient = mqtt.connect(url, {
      clientId: clientId,
      clean: true,
      connectTimeout: 7000,
      reconnectPeriod: 4000
    });

    mqttClient.on('connect', () => {
      AppState.isConnected = true;
      logEvent(`Connected to HiveMQ MQTT Broker! Client: ${clientId}`, 'text-emerald-400 font-bold');
      updateMqttBadge('connected', `HiveMQ Connected: ${AppState.broker.host}`);
      audio.beep(880, 'sine', 0.15, 0.1);

      // Subscribe to telemetry and controls
      const topics = [
        AppState.broker.telemetryTopic,
        'factory/telemetry/synthetic',
        'factory/telemetry/esp32',
        'factory/telemetry/alerts',
        'factory/analytics/#',
        'factory/control/#'
      ];
      
      mqttClient.subscribe(topics, (err) => {
        if (!err) {
          logEvent(`Subscribed to topic stream: [${topics.join(', ')}]`, 'text-slate-400');
        }
      });
    });

    mqttClient.on('message', (topic, message) => {
      handleIncomingMqttMessage(topic, message.toString());
    });

    mqttClient.on('error', (err) => {
      logEvent(`MQTT Error: ${err.message}`, 'text-red-400');
      updateMqttBadge('error', 'Broker Error / Disconnected');
    });

    mqttClient.on('close', () => {
      AppState.isConnected = false;
      updateMqttBadge('error', 'Disconnected. Retrying...');
    });

  } catch (err) {
    logEvent(`Connection initialization failed: ${err.message}`, 'text-red-400');
    updateMqttBadge('error', 'Connection Failed');
  }
}

function publishMqtt(topic, payload) {
  const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  
  if (mqttClient && AppState.isConnected) {
    mqttClient.publish(topic, jsonStr, { qos: 1 }, (err) => {
      if (err) {
        logEvent(`Publish error [${topic}]: ${err.message}`, 'text-red-400');
      } else {
        logEvent(`[TX] Sent to ${topic}: ${jsonStr}`, 'text-cyan-300');
      }
    });
  } else {
    logEvent(`[OFFLINE TX] ${topic}: ${jsonStr}`, 'text-yellow-400');
    // If running in-browser fallback, handle locally
    if (AppState.selectedSource === 'inbrowser') {
      handleLocalCommand(topic, payload);
    }
  }
}

function handleIncomingMqttMessage(topic, payloadStr) {
  try {
    const data = JSON.parse(payloadStr);

    // Filter by selected source if specified
    if (topic.includes('esp32') && AppState.selectedSource !== 'esp32') {
      return;
    }
    if (topic.includes('synthetic') && AppState.selectedSource !== 'synthetic') {
      return;
    }

    if (topic === AppState.broker.telemetryTopic || topic === 'factory/telemetry/machine1' || topic === 'factory/telemetry/esp32' || topic === 'factory/telemetry/synthetic') {
      ingestTelemetry(data);
    } else if (topic.startsWith('factory/control/')) {
      handleIncomingControlEcho(topic, data);
    } else if (topic === 'factory/telemetry/alerts') {
      handleAlertPayload(data);
    }
  } catch (e) {
    // Non-JSON payload
  }
}

function handleIncomingControlEcho(topic, data) {
  if (topic === 'factory/control/estop') {
    AppState.machine.status = 'EMERGENCY_STOP';
    AppState.machine.rpm = 0.0;
    audio.alarmSiren();
    updateUI();
    logEvent(`🛑 REMOTE E-STOP INSTRUCTION RECEIVED! Machine stopping immediately.`, 'text-red-400 font-bold');
  } else if (topic === 'factory/control/reset') {
    AppState.machine.status = 'RUNNING';
    AppState.machine.rpm = AppState.machine.targetRpm;
    updateUI();
    logEvent(`🟢 SYSTEM RESUMED via remote reset command.`, 'text-emerald-400');
  } else if (topic === 'factory/control/speed') {
    const spd = data.targetRpm || data.speed;
    if (spd !== undefined) {
      AppState.machine.targetRpm = parseFloat(spd);
      DOM.speedSlider.value = spd;
      DOM.speedSliderValue.textContent = spd;
      updateUI();
    }
  }
}

function handleAlertPayload(data) {
  logEvent(`⚠️ ALARM: ${data.fault || data.event || 'Threshold Exceeded!'}`, 'text-amber-400 font-bold');
  audio.alarmSiren();
}

// ================= TELEMETRY INGESTION & UI BINDING =================
function ingestTelemetry(data) {
  const tel = data.telemetry || {};
  const ai = data.ai_analytics || {};
  const prod = data.production || {};
  const oee = data.oee || {};

  AppState.machine.id = data.machine_id || AppState.machine.id;
  AppState.machine.status = data.status || AppState.machine.status;
  AppState.machine.mode = data.mode || AppState.machine.mode;

  if (tel.rpm !== undefined) AppState.machine.rpm = tel.rpm;
  if (tel.target_rpm !== undefined) AppState.machine.targetRpm = tel.target_rpm;
  if (tel.vibration_rms !== undefined) AppState.machine.vibrationRms = tel.vibration_rms;
  if (tel.vibration_peak !== undefined) AppState.machine.vibrationPeak = tel.vibration_peak;
  if (tel.temperature_c !== undefined) AppState.machine.tempC = tel.temperature_c;
  if (tel.current_a !== undefined) AppState.machine.currentA = tel.current_a;
  if (tel.power_kw !== undefined) AppState.machine.powerKw = tel.power_kw;
  if (tel.pressure_psi !== undefined) AppState.machine.lubricationPsi = tel.pressure_psi;
  if (tel.acoustic_db !== undefined) AppState.machine.acousticDb = tel.acoustic_db;

  if (prod.total_parts !== undefined) AppState.machine.totalParts = prod.total_parts;
  if (prod.defect_parts !== undefined) AppState.machine.defectParts = prod.defect_parts;
  if (prod.good_parts !== undefined) AppState.machine.goodParts = prod.good_parts;
  if (prod.cycle_time_s !== undefined) AppState.machine.cycleTimeS = prod.cycle_time_s;

  if (ai.health_index !== undefined) AppState.machine.healthIndex = ai.health_index;
  if (ai.rul_hours !== undefined) AppState.machine.rulHours = ai.rul_hours;
  if (ai.anomaly_score !== undefined) AppState.machine.anomalyScore = ai.anomaly_score;
  if (ai.active_fault !== undefined) AppState.machine.activeFault = ai.active_fault;
  if (ai.recommendation) AppState.machine.recommendation = ai.recommendation;

  if (oee.overall !== undefined) AppState.machine.oee.overall = oee.overall;
  if (oee.availability !== undefined) AppState.machine.oee.availability = oee.availability;
  if (oee.performance !== undefined) AppState.machine.oee.performance = oee.performance;
  if (oee.quality !== undefined) AppState.machine.oee.quality = oee.quality;

  // Update UI components
  updateUI();

  // Push to Real-Time Chart
  updateTelemetryChart(AppState.machine.vibrationRms, AppState.machine.tempC);
}

function updateUI() {
  const m = AppState.machine;

  // 1. Gauges & Health
  DOM.metricHealthIndex.textContent = m.healthIndex.toFixed(1);
  DOM.barHealthIndex.style.width = `${Math.min(100, Math.max(0, m.healthIndex))}%`;
  DOM.metricRulHours.textContent = `${Math.round(m.rulHours).toLocaleString()} hrs`;

  // Color health index
  if (m.healthIndex > 85) {
    DOM.metricHealthIndex.className = 'text-4xl sm:text-5xl font-black font-mono text-emerald-400';
    DOM.barHealthIndex.className = 'bg-gradient-to-r from-emerald-500 to-cyan-400 h-full rounded-full transition-all duration-500';
    DOM.metricAnomalyStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> Nominal';
    DOM.metricAnomalyStatus.className = 'text-emerald-400 font-medium';
  } else if (m.healthIndex > 65) {
    DOM.metricHealthIndex.className = 'text-4xl sm:text-5xl font-black font-mono text-amber-400';
    DOM.barHealthIndex.className = 'bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-500';
    DOM.metricAnomalyStatus.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Warning';
    DOM.metricAnomalyStatus.className = 'text-amber-400 font-medium';
  } else {
    DOM.metricHealthIndex.className = 'text-4xl sm:text-5xl font-black font-mono text-red-500';
    DOM.barHealthIndex.className = 'bg-gradient-to-r from-red-600 to-rose-500 h-full rounded-full transition-all duration-500';
    DOM.metricAnomalyStatus.innerHTML = '<i class="fa-solid fa-radiation"></i> Critical Failure';
    DOM.metricAnomalyStatus.className = 'text-red-400 font-medium animate-pulse';
  }

  // 2. RPM
  DOM.metricRpm.textContent = Math.round(m.rpm).toLocaleString();
  DOM.metricTargetRpm.textContent = Math.round(m.targetRpm).toLocaleString();

  // 3. Vibration
  DOM.metricVibration.textContent = m.vibrationRms.toFixed(1);
  const vibPercent = Math.min(100, (m.vibrationRms / 20.0) * 100);
  DOM.barVibration.style.width = `${vibPercent}%`;
  DOM.vibPeakText.textContent = `Peak: ${m.vibrationPeak.toFixed(1)}`;
  if (m.vibrationRms > 12.0) {
    DOM.barVibration.className = 'bg-red-500 h-full rounded-full transition-all duration-300';
  } else if (m.vibrationRms > 6.0) {
    DOM.barVibration.className = 'bg-amber-400 h-full rounded-full transition-all duration-300';
  } else {
    DOM.barVibration.className = 'bg-emerald-400 h-full rounded-full transition-all duration-300';
  }

  // 4. Temperature
  DOM.metricTemp.textContent = m.tempC.toFixed(1);
  const tempPercent = Math.min(100, Math.max(0, ((m.tempC - 20) / 90) * 100));
  DOM.barTemp.style.width = `${tempPercent}%`;
  if (m.tempC > 80.0) {
    DOM.tempStatePill.textContent = 'OVERHEAT';
    DOM.tempStatePill.className = 'text-red-400 font-mono text-xs font-bold animate-pulse';
    DOM.barTemp.className = 'bg-red-500 h-full rounded-full transition-all duration-300';
  } else if (m.tempC > 65.0) {
    DOM.tempStatePill.textContent = 'WARM';
    DOM.tempStatePill.className = 'text-amber-400 font-mono text-xs';
    DOM.barTemp.className = 'bg-amber-400 h-full rounded-full transition-all duration-300';
  } else {
    DOM.tempStatePill.textContent = 'COOL';
    DOM.tempStatePill.className = 'text-emerald-400 font-mono text-xs';
    DOM.barTemp.className = 'bg-cyan-400 h-full rounded-full transition-all duration-300';
  }

  // 5. Electrical
  DOM.metricCurrent.textContent = m.currentA.toFixed(1);
  DOM.metricPower.textContent = m.powerKw.toFixed(1);

  // 6. Secondary sensors
  DOM.metricLubePsi.textContent = `${m.lubricationPsi.toFixed(1)} PSI`;
  DOM.metricAcousticDb.textContent = `${m.acousticDb.toFixed(1)} dB`;
  DOM.metricCycleTime.textContent = `${m.cycleTimeS.toFixed(2)} s`;

  // 7. OEE & Counters
  DOM.oeeOverall.textContent = `${m.oee.overall.toFixed(1)}% OEE`;
  DOM.oeeAvailability.textContent = `${m.oee.availability.toFixed(1)}%`;
  DOM.barOeeAvailability.style.width = `${m.oee.availability}%`;
  DOM.oeePerformance.textContent = `${m.oee.performance.toFixed(1)}%`;
  DOM.barOeePerformance.style.width = `${m.oee.performance}%`;
  DOM.oeeQuality.textContent = `${m.oee.quality.toFixed(1)}%`;
  DOM.barOeeQuality.style.width = `${m.oee.quality}%`;

  DOM.countTotalParts.textContent = m.totalParts.toLocaleString();
  DOM.countGoodParts.textContent = m.goodParts.toLocaleString();
  DOM.countDefects.textContent = m.defectParts.toLocaleString();
  DOM.canvasPartsCounter.textContent = m.totalParts.toLocaleString();

  // 8. Machine State Badge & E-Stop Banner
  if (m.status === 'EMERGENCY_STOP') {
    DOM.machineStateBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-950 border border-red-600 text-xs text-red-300 font-semibold font-mono animate-pulse';
    DOM.machineStateText.textContent = 'STATUS: E-STOP ACTIVE';
    DOM.estopAlertBanner.classList.remove('hidden');
    DOM.canvasOverlayFault.textContent = '🛑 EMERGENCY STOP ACTIVATED';
    DOM.canvasOverlayFault.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-red-950/80 border border-red-600 text-red-300 backdrop-blur';
  } else if (m.status === 'CRITICAL_FAULT') {
    DOM.machineStateBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-950 border border-red-700 text-xs text-red-400 font-semibold font-mono';
    DOM.machineStateText.textContent = 'STATUS: CRITICAL FAULT';
    DOM.estopAlertBanner.classList.add('hidden');
    DOM.canvasOverlayFault.textContent = `CRITICAL: ${m.activeFault}`;
    DOM.canvasOverlayFault.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-red-950/80 border border-red-600 text-red-300 backdrop-blur';
  } else if (m.status === 'WARNING') {
    DOM.machineStateBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-950 border border-amber-700 text-xs text-amber-400 font-semibold font-mono';
    DOM.machineStateText.textContent = 'STATUS: WARNING';
    DOM.estopAlertBanner.classList.add('hidden');
    DOM.canvasOverlayFault.textContent = `WARN: ${m.activeFault}`;
    DOM.canvasOverlayFault.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 border border-amber-600 text-amber-300 backdrop-blur';
  } else {
    DOM.machineStateBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950 border border-emerald-700 text-xs text-emerald-400 font-semibold font-mono';
    DOM.machineStateText.textContent = 'STATUS: RUNNING';
    DOM.estopAlertBanner.classList.add('hidden');
    DOM.canvasOverlayFault.textContent = 'HEALTHY • SPINDLE STABLE';
    DOM.canvasOverlayFault.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-600/50 text-emerald-400 backdrop-blur';
  }

  // 9. AI Diagnosis Card
  DOM.aiDiagnosisTitle.textContent = `AI Diagnosis: ${m.activeFault === 'NONE' ? 'Normal Operation' : m.activeFault}`;
  DOM.aiDiagnosisRecommendation.textContent = m.recommendation;
  DOM.aiDiagnosisConfidence.textContent = `${Math.min(99.6, Math.max(88.0, 100 - m.anomalyScore * 20)).toFixed(1)}%`;
}

function updateMqttBadge(status, text) {
  DOM.mqttStatusText.textContent = text;
  if (status === 'connected') {
    DOM.mqttStatusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950 border border-emerald-700 text-xs text-emerald-300';
    DOM.mqttStatusBadge.querySelector('span').className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
  } else if (status === 'connecting') {
    DOM.mqttStatusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300';
    DOM.mqttStatusBadge.querySelector('span').className = 'w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping';
  } else {
    DOM.mqttStatusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-950 border border-red-700 text-xs text-red-300';
    DOM.mqttStatusBadge.querySelector('span').className = 'w-2.5 h-2.5 rounded-full bg-red-400';
  }
}

function logEvent(msg, colorClass = 'text-slate-400') {
  const container = DOM.eventLogContainer;
  const item = document.createElement('div');
  const now = new Date().toTimeString().split(' ')[0];
  item.className = colorClass;
  item.innerHTML = `<span class="text-slate-600">[${now}]</span> ${msg}`;
  container.prepend(item);
  
  while (container.children.length > 25) {
    container.removeChild(container.lastChild);
  }
}

// ================= 2D/3D DIGITAL TWIN CANVAS VISUALIZER =================
class DigitalTwinVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width = 960;
    this.height = canvas.height = 540;
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.fpsTimer = performance.now();
    this.fps = 60;
    
    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame((t) => this.renderLoop(t));
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = 960;
    this.canvas.height = 540;
    this.width = 960;
    this.height = 540;
  }

  renderLoop(currentTime) {
    const dt = (currentTime - this.lastTime) / 1000.0;
    this.lastTime = currentTime;

    // Calculate FPS
    this.frameCount++;
    if (currentTime - this.fpsTimer >= 1000) {
      this.fps = this.frameCount;
      DOM.canvasFps.textContent = this.fps;
      this.frameCount = 0;
      this.fpsTimer = currentTime;
    }

    // Step physics & animation
    this.update(dt);
    this.draw();

    requestAnimationFrame((t) => this.renderLoop(t));
  }

  update(dt) {
    const m = AppState.machine;
    const isStopped = m.status === 'EMERGENCY_STOP' || m.rpm < 20;

    // Spindle rotation speed (radians per second)
    const angularSpeed = (m.rpm / 60.0) * Math.PI * 2;
    if (!isStopped) {
      AppState.sim.spindleAngle += angularSpeed * dt;
      AppState.sim.conveyorOffset = (AppState.sim.conveyorOffset + (m.rpm / 60.0) * 12.0 * dt) % 40;
    }

    // Conveyor parts progression
    if (!isStopped) {
      const conveyorSpeed = (m.rpm / 1750.0) * 80.0 * dt;
      AppState.sim.partsOnBelt.forEach(part => {
        part.x += conveyorSpeed;
        if (part.x > 780) {
          part.x = 100;
          part.isDefect = Math.random() < (m.activeFault === 'NONE' ? 0.02 : 0.35);
        }
      });
    }

    // Vibration Jitter amplitude
    const jitter = isStopped ? 0 : (m.vibrationRms / 20.0) * 6.0;
    DOM.jitterIndicator.textContent = `Jitter: ${jitter.toFixed(1)}mm`;

    // Thermal / Spark particles update
    const particles = AppState.sim.particles;
    
    // Spawn sparks at the milling head if spinning
    if (!isStopped && m.rpm > 500 && Math.random() < 0.45) {
      particles.push({
        x: 520,
        y: 310,
        vx: (Math.random() - 0.5) * 120,
        vy: -Math.random() * 90 - 20,
        life: 0.35,
        maxLife: 0.35,
        color: '#fef08a',
        size: 2.2
      });
    }

    // Spawn thermal smoke/steam if temperature > 75°C
    if (m.tempC > 70.0 && Math.random() < 0.3) {
      particles.push({
        x: 320 + (Math.random() - 0.5) * 60,
        y: 220,
        vx: (Math.random() - 0.5) * 20,
        vy: -Math.random() * 45 - 25,
        life: 0.9,
        maxLife: 0.9,
        color: m.tempC > 85 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(203, 213, 225, 0.3)',
        size: 8
      });
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const m = AppState.machine;

    // Clear background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    // Floor grid (Perspective factory floor)
    this.drawFactoryFloor(ctx, w, h);

    // Jitter transform for motor housing based on vibration RMS
    ctx.save();
    let jitterX = 0;
    let jitterY = 0;
    if (m.status !== 'EMERGENCY_STOP' && m.vibrationRms > 1.0) {
      const mag = (m.vibrationRms / 20.0) * 4.5;
      jitterX = (Math.random() - 0.5) * mag;
      jitterY = (Math.random() - 0.5) * mag;
    }
    ctx.translate(jitterX, jitterY);

    // Draw Machine Base Platform
    this.drawMachineChassis(ctx);

    // Draw Spindle Motor & Bearing Housing (Heat Color Overlay)
    this.drawMotorAssembly(ctx, m);

    // Draw Drive Belt & Pulley System
    this.drawBeltAndPulleys(ctx);

    // Draw Milling Spindle & Workpiece
    this.drawMillingHead(ctx, m);

    // Draw Conveyor Belt System with Machined Parts
    this.drawConveyorSystem(ctx, m);

    // Draw Particles (Sparks & Thermal Smoke)
    this.drawParticles(ctx);

    // Emergency Stop Hazard Warning Overlay
    if (m.status === 'EMERGENCY_STOP') {
      this.drawEstopOverlay(ctx, w, h);
    }

    ctx.restore();
  }

  drawFactoryFloor(ctx, w, h) {
    ctx.strokeStyle = '#172033';
    ctx.lineWidth = 1;
    // Perspective lines
    for (let x = -200; x <= w + 200; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(w / 2 + (x - w / 2) * 0.45, h * 0.58);
      ctx.stroke();
    }
    // Horizontal lines
    for (let y = h * 0.58; y <= h; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  drawMachineChassis(ctx) {
    // Heavy Cast Iron Machine Bed
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(160, 360, 640, 60, 10);
    ctx.fill();
    ctx.stroke();

    // Machine column
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(440, 130, 160, 240);
    ctx.strokeRect(440, 130, 160, 240);
  }

  drawMotorAssembly(ctx, m) {
    const motorX = 260;
    const motorY = 220;

    // Thermal color calculation (Cool blue -> Cyan -> Amber -> Burning Red)
    let thermalColor = '#0284c7';
    if (m.tempC > 85) thermalColor = '#dc2626';
    else if (m.tempC > 70) thermalColor = '#ea580c';
    else if (m.tempC > 55) thermalColor = '#f59e0b';
    else if (m.tempC > 40) thermalColor = '#10b981';

    // Thermal ambient glow
    ctx.save();
    ctx.shadowColor = thermalColor;
    ctx.shadowBlur = m.tempC > 70 ? 25 : 12;

    // Motor Stator Housing
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = thermalColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(motorX, motorY, 130, 95, 8);
    ctx.fill();
    ctx.stroke();

    // Cooling fins
    ctx.fillStyle = '#334155';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(motorX + 15 + i * 18, motorY - 8, 8, 10);
    }

    // Bearing endcap (Left & Right)
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(motorX + 130, motorY + 48, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Rotating Motor Shaft indicator
    ctx.save();
    ctx.translate(motorX + 130, motorY + 48);
    ctx.rotate(AppState.sim.spindleAngle);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-3, -16, 6, 32);
    ctx.fillRect(-16, -3, 32, 6);
    ctx.restore();
  }

  drawBeltAndPulleys(ctx) {
    const p1x = 390;
    const p1y = 268;
    const p2x = 480;
    const p2y = 190;

    // Pulley 1 (Drive on motor)
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(p1x, p1y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Pulley 2 (Driven on spindle head)
    ctx.beginPath();
    ctx.arc(p2x, p2y, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Drive Belt
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y - 20);
    ctx.lineTo(p2x, p2y - 26);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p1x, p1y + 20);
    ctx.lineTo(p2x, p2y + 26);
    ctx.stroke();
  }

  drawMillingHead(ctx, m) {
    const spindleX = 520;
    const spindleY = 220;

    // Spindle head housing
    ctx.fillStyle = '#334155';
    ctx.fillRect(spindleX - 30, spindleY - 20, 60, 80);
    ctx.strokeStyle = '#64748b';
    ctx.strokeRect(spindleX - 30, spindleY - 20, 60, 80);

    // High speed chuck & cutting tool
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(spindleX - 10, spindleY + 60, 20, 24);

    // Tool bit
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(spindleX - 3, spindleY + 84, 6, 18);
  }

  drawConveyorSystem(ctx, m) {
    const beltY = 340;

    // Conveyor rail support
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(100, beltY, 760, 24, 4);
    ctx.fill();
    ctx.stroke();

    // Rollers on ends
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(100, beltY + 12, 14, 0, Math.PI * 2);
    ctx.arc(860, beltY + 12, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Moving conveyor track segments
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    for (let x = 110 + AppState.sim.conveyorOffset; x < 850; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, beltY + 2);
      ctx.lineTo(x, beltY + 22);
      ctx.stroke();
    }

    // Machined workpiece parts travelling on belt
    AppState.sim.partsOnBelt.forEach((part, index) => {
      ctx.save();
      if (part.isDefect) {
        ctx.fillStyle = '#ef4444'; // Defective part (marked red)
        ctx.strokeStyle = '#b91c1c';
      } else {
        ctx.fillStyle = '#38bdf8'; // Good part (cyan billet)
        ctx.strokeStyle = '#0284c7';
      }
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(part.x, beltY - 24, 34, 24, 3);
      ctx.fill();
      ctx.stroke();

      // Top chamfer highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(part.x + 4, beltY - 22, 26, 4);
      ctx.restore();
    });
  }

  drawParticles(ctx) {
    AppState.sim.particles.forEach(p => {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  drawEstopOverlay(ctx, w, h) {
    // Red semi-transparent warning vignette
    ctx.fillStyle = 'rgba(185, 28, 28, 0.2)';
    ctx.fillRect(0, 0, w, h);

    // Hazard warning stripes at top and bottom
    ctx.save();
    const stripeWidth = 30;
    const timeShift = (Date.now() / 40) % (stripeWidth * 2);

    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 0, w, 14);
    ctx.fillRect(0, h - 14, w, 14);

    ctx.fillStyle = '#fef08a';
    for (let x = -stripeWidth * 2; x < w + stripeWidth * 2; x += stripeWidth * 2) {
      ctx.beginPath();
      ctx.moveTo(x + timeShift, 0);
      ctx.lineTo(x + stripeWidth + timeShift, 0);
      ctx.lineTo(x + timeShift, 14);
      ctx.lineTo(x - stripeWidth + timeShift, 14);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ================= IN-BROWSER DEMO SIMULATION ENGINE =================
// Automatically generates live telemetry if Python/ESP32 is not currently connected
function startInBrowserSimulation() {
  setInterval(() => {
    if (AppState.isConnected && AppState.selectedSource !== 'inbrowser') {
      return; // Do not overwrite if live broker feed is active
    }

    const m = AppState.machine;
    const dt = 1.0;

    // Smooth RPM inertia
    if (m.status === 'EMERGENCY_STOP') {
      m.rpm = Math.max(0, m.rpm - 350.0 * dt);
    } else {
      const diff = m.targetRpm - m.rpm;
      m.rpm += diff * 0.4;
    }
    const rpmRatio = m.rpm / 1750.0;

    // Fault progression
    if (m.activeFault !== 'NONE' && m.status !== 'EMERGENCY_STOP') {
      AppState.sim.faultIntensity = Math.min(1.0, AppState.sim.faultIntensity + 0.05);
    } else {
      AppState.sim.faultIntensity = Math.max(0.0, AppState.sim.faultIntensity - 0.1);
    }

    // Dynamic Vibration
    let baseVib = 2.0 * rpmRatio + (Math.random() - 0.5) * 0.3;
    if (m.activeFault === 'BEARING_WEAR') {
      baseVib += 13.5 * AppState.sim.faultIntensity;
    } else if (m.activeFault === 'MOTOR_STALL') {
      baseVib += 5.5 * AppState.sim.faultIntensity;
    }
    m.vibrationRms = Math.max(0.1, parseFloat(baseVib.toFixed(2)));
    m.vibrationPeak = parseFloat((m.vibrationRms * 1.5).toFixed(2));

    // Dynamic Temperature
    let targetTemp = 24.0 + 26.0 * rpmRatio;
    if (m.activeFault === 'THERMAL_RUNAWAY') {
      targetTemp += 58.0 * AppState.sim.faultIntensity;
    } else if (m.activeFault === 'BEARING_WEAR') {
      targetTemp += 22.0 * AppState.sim.faultIntensity;
    }
    m.tempC += (targetTemp - m.tempC) * 0.08 + (Math.random() - 0.5) * 0.2;
    m.tempC = parseFloat(m.tempC.toFixed(1));

    // Current & Power
    let baseCurrent = m.rpm > 10 ? 2.5 + 6.0 * rpmRatio : 0.0;
    if (m.activeFault === 'MOTOR_STALL') {
      baseCurrent += 32.0 * AppState.sim.faultIntensity;
    }
    m.currentA = parseFloat(baseCurrent.toFixed(1));
    m.powerKw = parseFloat(((1.732 * 415 * m.currentA * 0.88) / 1000.0).toFixed(1));

    // Health Score
    const stress = Math.max(0, (m.vibrationRms - 3.5) * 5) + Math.max(0, (m.tempC - 65) * 2.2);
    m.anomalyScore = Math.min(1.0, stress / 75.0);
    m.healthIndex = Math.max(5.0, parseFloat((100.0 - stress).toFixed(1)));
    m.rulHours = Math.max(12, Math.round(1840.0 * Math.pow(m.healthIndex / 100.0, 1.8)));

    // Production count
    if (m.status === 'RUNNING' && m.rpm > 1200) {
      if (Math.random() < 0.25) {
        m.totalParts += 1;
        if (Math.random() < (0.015 + 0.3 * AppState.sim.faultIntensity)) {
          m.defectParts += 1;
        }
        m.goodParts = m.totalParts - m.defectParts;
      }
    }

    // Machine Status Classification
    if (m.status !== 'EMERGENCY_STOP') {
      if (m.tempC > 85.0 || m.vibrationRms > 16.0) {
        m.status = 'CRITICAL_FAULT';
      } else if (m.tempC > 68.0 || m.vibrationRms > 7.0) {
        m.status = 'WARNING';
      } else {
        m.status = 'RUNNING';
      }
    }

    updateUI();
    updateTelemetryChart(m.vibrationRms, m.tempC);
  }, 1000);
}

function handleLocalCommand(topic, payload) {
  const m = AppState.machine;
  if (topic.includes('estop')) {
    m.status = 'EMERGENCY_STOP';
    m.targetRpm = 0.0;
    audio.alarmSiren();
    updateUI();
  } else if (topic.includes('reset')) {
    m.status = 'RUNNING';
    m.targetRpm = 1750.0;
    m.activeFault = 'NONE';
    AppState.sim.faultIntensity = 0.0;
    updateUI();
  } else if (topic.includes('speed')) {
    m.targetRpm = parseFloat(payload.targetRpm || payload);
    updateUI();
  } else if (topic.includes('anomaly_inject')) {
    m.activeFault = payload.type || 'NONE';
    AppState.sim.faultIntensity = m.activeFault === 'NONE' ? 0.0 : 0.2;
    updateUI();
  }
}

// ================= USER INTERACTION & EVENT LISTENERS =================
function setupEventListeners() {
  // 1. Emergency Stop Button
  DOM.btnEstop.addEventListener('click', () => {
    audio.alarmSiren();
    publishMqtt(`${AppState.broker.controlPrefix}estop`, {
      command: 'ESTOP',
      source: 'WebDashboard',
      timestamp: new Date().toISOString()
    });
    DOM.btnEstop.classList.add('scale-95');
    setTimeout(() => DOM.btnEstop.classList.remove('scale-95'), 150);
  });

  // 2. Resume / Start Button
  DOM.btnResume.addEventListener('click', () => {
    audio.beep(750, 'sine', 0.12, 0.1);
    publishMqtt(`${AppState.broker.controlPrefix}reset`, {
      command: 'RESET',
      source: 'WebDashboard'
    });
  });

  // 3. Reset Alarms Button & Banner Reset
  DOM.btnResetAlarms.addEventListener('click', () => {
    audio.beep(600, 'sine', 0.1, 0.08);
    publishMqtt(`${AppState.broker.controlPrefix}reset`, { command: 'RESET' });
  });

  DOM.btnBannerReset.addEventListener('click', () => {
    audio.beep(600, 'sine', 0.1, 0.08);
    publishMqtt(`${AppState.broker.controlPrefix}reset`, { command: 'RESET' });
  });

  // 4. Target Speed Slider
  DOM.speedSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    DOM.speedSliderValue.textContent = val;
  });

  DOM.speedSlider.addEventListener('change', (e) => {
    const val = parseFloat(e.target.value);
    audio.beep(500, 'triangle', 0.08, 0.05);
    publishMqtt(`${AppState.broker.controlPrefix}speed`, { targetRpm: val });
  });

  // Preset Speed Buttons
  document.querySelectorAll('.preset-speed').forEach(btn => {
    btn.addEventListener('click', () => {
      const rpm = parseFloat(btn.dataset.rpm);
      DOM.speedSlider.value = rpm;
      DOM.speedSliderValue.textContent = rpm;
      audio.beep(550, 'sine', 0.08, 0.06);
      publishMqtt(`${AppState.broker.controlPrefix}speed`, { targetRpm: rpm });
    });
  });

  // 5. Operating Mode Selector
  DOM.selectMode.addEventListener('change', (e) => {
    const mode = e.target.value;
    publishMqtt(`${AppState.broker.controlPrefix}mode`, { mode: mode });
  });

  // 6. Data Source Selector
  DOM.selectDataSource.addEventListener('change', (e) => {
    const src = e.target.value;
    AppState.selectedSource = src;
    DOM.activeSourceText.textContent = `Source: ${src.toUpperCase()}`;
    publishMqtt(`${AppState.broker.controlPrefix}source_select`, { source: src });
    logEvent(`Primary Telemetry Source shifted to: ${src.toUpperCase()}`, 'text-cyan-400 font-bold');
  });

  // 7. Fault Injection Buttons
  DOM.btnInjectBearing.addEventListener('click', () => {
    audio.beep(320, 'sawtooth', 0.2, 0.1);
    publishMqtt(`${AppState.broker.controlPrefix}anomaly_inject`, { type: 'BEARING_WEAR' });
    logEvent('Injected Bearing Fault anomaly!', 'text-purple-400 font-bold');
  });

  DOM.btnInjectThermal.addEventListener('click', () => {
    audio.beep(320, 'sawtooth', 0.2, 0.1);
    publishMqtt(`${AppState.broker.controlPrefix}anomaly_inject`, { type: 'THERMAL_RUNAWAY' });
    logEvent('Injected Thermal Runaway anomaly!', 'text-amber-400 font-bold');
  });

  DOM.btnInjectStall.addEventListener('click', () => {
    audio.beep(320, 'sawtooth', 0.2, 0.1);
    publishMqtt(`${AppState.broker.controlPrefix}anomaly_inject`, { type: 'MOTOR_STALL' });
    logEvent('Injected Motor Stall anomaly!', 'text-red-400 font-bold');
  });

  DOM.btnClearFaults.addEventListener('click', () => {
    audio.beep(880, 'sine', 0.15, 0.1);
    publishMqtt(`${AppState.broker.controlPrefix}anomaly_inject`, { type: 'NONE' });
    logEvent('Cleared all injected faults. System healthy.', 'text-emerald-400 font-bold');
  });

  // 8. Audio Toggle
  DOM.btnToggleAudio.addEventListener('click', () => {
    AppState.audioEnabled = !AppState.audioEnabled;
    DOM.audioIcon.className = AppState.audioEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark text-slate-500';
    if (AppState.audioEnabled) audio.beep(660, 'sine', 0.1, 0.1);
  });

  // 9. Clear Log
  DOM.btnClearLog.addEventListener('click', () => {
    DOM.eventLogContainer.innerHTML = '';
  });

  // 10. Broker Settings Modal
  DOM.btnOpenSettings.addEventListener('click', () => {
    document.getElementById('inputMqttHost').value = AppState.broker.host;
    document.getElementById('inputMqttPort').value = AppState.broker.port;
    document.getElementById('inputMqttPath').value = AppState.broker.path;
    document.getElementById('inputTelemetryTopic').value = AppState.broker.telemetryTopic;
    document.getElementById('inputControlPrefix').value = AppState.broker.controlPrefix;
    DOM.settingsModal.classList.remove('hidden');
  });

  DOM.btnCloseSettings.addEventListener('click', () => {
    DOM.settingsModal.classList.add('hidden');
  });

  DOM.btnSaveSettings.addEventListener('click', () => {
    AppState.broker.host = document.getElementById('inputMqttHost').value.trim();
    AppState.broker.port = parseInt(document.getElementById('inputMqttPort').value, 10);
    AppState.broker.path = document.getElementById('inputMqttPath').value.trim();
    AppState.broker.telemetryTopic = document.getElementById('inputTelemetryTopic').value.trim();
    AppState.broker.controlPrefix = document.getElementById('inputControlPrefix').value.trim();
    
    DOM.settingsModal.classList.add('hidden');
    connectMqtt();
  });

  DOM.btnResetSettings.addEventListener('click', () => {
    document.getElementById('inputMqttHost').value = 'broker.hivemq.com';
    document.getElementById('inputMqttPort').value = '8884';
    document.getElementById('inputMqttPath').value = '/mqtt';
    document.getElementById('inputTelemetryTopic').value = 'factory/telemetry/machine1';
    document.getElementById('inputControlPrefix').value = 'factory/control/';
  });
}

// ================= BOOTSTRAP INITIALIZATION =================
window.addEventListener('DOMContentLoaded', () => {
  console.log('[INIT] Smart Factory Digital Twin starting...');
  
  // Setup Chart
  initTelemetryChart();

  // Setup Event Listeners
  setupEventListeners();

  // Start Canvas Physics Twin
  new DigitalTwinVisualizer(DOM.canvas);

  // Connect to HiveMQ MQTT Broker
  connectMqtt();

  // Start In-Browser Simulation Loop (Standby fallback)
  startInBrowserSimulation();
});

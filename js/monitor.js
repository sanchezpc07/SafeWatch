/**
 * MONITOR.JS
 * Integra WebRTC, Teachable Machine Pose (TensorFlow.js) y modelo de audio de voz.
 * Modelo POSE:  https://teachablemachine.withgoogle.com/models/MSQN5JiSD/
 * Modelo AUDIO: https://teachablemachine.withgoogle.com/models/zktd2sDJJ/
 * Clases pose:  Sentado | Parado | Caida | Sin presencia
 * Clases audio: Background Noise | Estoy bien | No estoy bien
 */

// ─── URLs de modelos ──────────────────────────────────────────────────────────
const URL_POSE_MODEL  = "https://teachablemachine.withgoogle.com/models/MSQN5JiSD/";
const URL_AUDIO_MODEL = "https://teachablemachine.withgoogle.com/models/zktd2sDJJ/";

// ─── Configuración de clases de pose ─────────────────────────────────────────
const CLASS_CONFIG = {
  "sentado":        { color: "#3b82f6", emoji: "🪑", label: "Sentado"        },
  "parado":         { color: "#22c55e", emoji: "🧍", label: "Parado"         },
  "caida":          { color: "#ef4444", emoji: "🚨", label: "Caída"          },
  "sin presencia":  { color: "#6b7280", emoji: "👻", label: "Sin presencia"  },
};

// ─── Configuración de clases de audio ────────────────────────────────────────
const AUDIO_CONFIG = {
  "Background Noise": { color: "#6b7280", emoji: "🔇", label: "Silencio / Ruido" },
  "Estoy bien":       { color: "#22c55e", emoji: "✅", label: "Estoy bien"        },
  "No estoy bien":    { color: "#ef4444", emoji: "🆘", label: "No estoy bien"     },
};

// ─── Estado global ────────────────────────────────────────────────────────────
let poseModel, webcam, labelContainer, maxPredictions;
let ctx;
let isRunning           = false;
let fallDetectionStartTime = null;
const FALL_THRESHOLD_MS = 3000;  // 3 s sostenido para confirmar caída
let interactionActive   = false;
let currentPatientId    = null;

// Estado del modelo de audio
let audioRecognizer     = null;
let audioModelLoaded    = false;
let audioLoadingInProgress = false;
let voiceCountdownTimer = null;
let voiceListenTimeout  = null;

// Registro de voz para BD
let voiceTranscriptBuffer = []; 
let voiceMetadata = { 
  clase: "Ninguna", 
  confianza: 0 
};

// ─── Botones de control ───────────────────────────────────────────────────────

async function startMonitoring() {
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled  = false;
  isRunning = true;
  document.getElementById('pose-status').textContent = "Cargando modelo de pose…";

  // Cargar modelo de audio en paralelo (para tenerlo listo cuando se necesite)
  preloadAudioModel();

  await initTeachableMachinePose();
}

async function stopMonitoring() {
  isRunning = false;
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled  = true;
  stopVoiceListening();
  if (webcam) {
    webcam.stop();
    document.getElementById("webcam-container").innerHTML = "";
  }
  document.getElementById('pose-status').textContent = 'Monitoreo detenido.';
  document.getElementById('label-container').innerHTML = '';
  updateStatusUI('safe', 'Normal');
}

// ─── Precarga silenciosa del modelo de audio ──────────────────────────────────

async function preloadAudioModel() {
  if (audioModelLoaded || audioLoadingInProgress) return;
  audioLoadingInProgress = true;
  try {
    const checkpointURL = URL_AUDIO_MODEL + "model.json";
    const metadataURL   = URL_AUDIO_MODEL + "metadata.json";

    audioRecognizer = speechCommands.create(
      "BROWSER_FFT",   // tipo de extractor de características
      undefined,
      checkpointURL,
      metadataURL
    );
    await audioRecognizer.ensureModelLoaded();
    audioModelLoaded = true;
    console.log("[Audio] Modelo de voz cargado. Clases:", audioRecognizer.wordLabels());
  } catch (e) {
    console.warn("[Audio] No se pudo precargar el modelo de voz:", e.message);
    audioModelLoaded = false;
  } finally {
    audioLoadingInProgress = false;
  }
}

// ─── Inicialización Teachable Machine Pose ────────────────────────────────────

async function initTeachableMachinePose() {
  try {
    const modelURL    = URL_POSE_MODEL + "model.json";
    const metadataURL = URL_POSE_MODEL + "metadata.json";

    poseModel      = await tmPose.load(modelURL, metadataURL);
    maxPredictions = poseModel.getTotalClasses();

    const camWidth  = 560;
    const camHeight = 420;
    const flip      = true;
    webcam = new tmPose.Webcam(camWidth, camHeight, flip);
    await webcam.setup();
    await webcam.play();

    const canvas  = document.createElement("canvas");
    canvas.width  = camWidth;
    canvas.height = camHeight;
    canvas.style.cssText = "display:block; width:100%; border-radius:12px;";
    ctx = canvas.getContext("2d");

    const container = document.getElementById("webcam-container");
    container.innerHTML = "";
    container.appendChild(canvas);

    // Barras de probabilidad de pose
    labelContainer = document.getElementById("label-container");
    labelContainer.innerHTML = "";
    for (let i = 0; i < maxPredictions; i++) {
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "margin-bottom:0.75rem;";

      const header = document.createElement("div");
      header.style.cssText = "display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px; font-weight:500;";
      header.innerHTML = `<span class="bar-label-${i}">—</span><span class="bar-pct-${i}">0%</span>`;

      const track = document.createElement("div");
      track.style.cssText = "background:rgba(255,255,255,0.08); border-radius:99px; height:8px; overflow:hidden;";

      const fill = document.createElement("div");
      fill.className = `bar-fill-${i}`;
      fill.style.cssText = "height:100%; width:0%; border-radius:99px; transition:width 0.25s, background 0.25s;";

      track.appendChild(fill);
      wrapper.appendChild(header);
      wrapper.appendChild(track);
      labelContainer.appendChild(wrapper);
    }

    // Obtener ID del paciente
    try {
      const { data } = await dbClient.auth.getSession();
      const mockUser = localStorage.getItem('safewatch_mock_user');
      // ID Demo Fijo: 00000000-0000-0000-0000-000000000001 (Simula un registro válido)
      currentPatientId = data?.session?.user?.id || (mockUser ? '00000000-0000-0000-0000-000000000001' : 'paciente-demo');
    } catch (_) {
      currentPatientId = 'paciente-demo';
    }

    document.getElementById('pose-status').textContent = "✅ Modelo de pose cargado – Monitoreando…";
    updateStatusUI('safe', '✅ Normal');
    window.requestAnimationFrame(loop);

  } catch (e) {
    console.error("Error al cargar modelo de TM Pose:", e);
    document.getElementById('pose-status').textContent = "❌ Error al cargar el modelo.";
    alert("Error al cargar la cámara o el modelo de pose.\n\n" + e.message);
    stopMonitoring();
  }
}

// ─── Loop de predicción de pose ───────────────────────────────────────────────

async function loop() {
  if (!isRunning) return;
  webcam.update();
  try {
    if (!interactionActive) {
      await predict();
    } else {
      ctx.drawImage(webcam.canvas, 0, 0);
    }
  } catch (e) {
    console.warn("[Monitor] Error en frame:", e.message);
  }
  window.requestAnimationFrame(loop);
}

async function predict() {
  const { pose, posenetOutput } = await poseModel.estimatePose(webcam.canvas);
  const prediction = await poseModel.predict(posenetOutput);

  ctx.drawImage(webcam.canvas, 0, 0);
  if (pose) drawPose(pose);

  let isFalling = false;
  let topClass  = { name: "", prob: 0 };

  prediction.forEach((p, i) => {
    const pct = (p.probability * 100).toFixed(1);
    const key = p.className.toLowerCase();
    const cfg = CLASS_CONFIG[key] || { color: "#a855f7", emoji: "❓", label: p.className };

    const labelEl = labelContainer.querySelector(`.bar-label-${i}`);
    const pctEl   = labelContainer.querySelector(`.bar-pct-${i}`);
    const fillEl  = labelContainer.querySelector(`.bar-fill-${i}`);

    if (labelEl) labelEl.textContent = `${cfg.emoji} ${cfg.label}`;
    if (pctEl)   pctEl.textContent   = `${pct}%`;
    if (fillEl) {
      fillEl.style.width      = `${pct}%`;
      fillEl.style.background = cfg.color;
    }

    if (p.probability > topClass.prob) topClass = { name: key, prob: p.probability };
    if (key === "caida" && p.probability > 0.80) isFalling = true;
  });

  if (!isFalling && topClass.prob > 0.60) {
    const cfg = CLASS_CONFIG[topClass.name] || {};
    if (topClass.name !== "caida") {
      updateStatusUI('safe', `${cfg.emoji || ''} ${cfg.label || topClass.name}`);
    }
  }

  handleFallLogic(isFalling);
}

// ─── Dibujar esqueleto de pose ────────────────────────────────────────────────

function drawPose(pose) {
  if (!pose || !pose.keypoints) return;

  ctx.strokeStyle = "rgba(0, 245, 255, 0.85)";
  ctx.lineWidth   = 2;
  ctx.shadowBlur  = 8;
  ctx.shadowColor = "#00f5ff";

  if (typeof posenet !== 'undefined' && posenet.drawSkeleton) {
    posenet.drawSkeleton(pose.keypoints, 0.5, ctx);
    posenet.drawKeypoints(pose.keypoints, 0.5, ctx);
    ctx.shadowBlur = 0;
    return;
  }

  ctx.fillStyle  = "#ffffff";
  ctx.shadowBlur = 4;
  pose.keypoints.forEach(kp => {
    if (kp.score >= 0.5) {
      ctx.beginPath();
      ctx.arc(kp.position.x, kp.position.y, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
  ctx.shadowBlur = 0;
}

// ─── Lógica de caída ──────────────────────────────────────────────────────────

function handleFallLogic(isFalling) {
  if (isFalling) {
    if (!fallDetectionStartTime) {
      fallDetectionStartTime = Date.now();
      updateStatusUI('alerta', '⚠️ Posible caída…');
    } else {
      const elapsed = Date.now() - fallDetectionStartTime;
      if (elapsed >= FALL_THRESHOLD_MS) {
        triggerVoiceInteraction();
      }
    }
  } else {
    if (fallDetectionStartTime && !interactionActive) {
      fallDetectionStartTime = null;
    }
  }
}

function updateStatusUI(statusClass, text) {
  const statusDiv = document.getElementById('statusIndicator');
  statusDiv.className = `status-indicator ${statusClass === 'alerta' ? 'danger' : 'safe'}`;
  statusDiv.innerText = text;
}

// ─── Activar verificación de voz con IA ──────────────────────────────────────

function triggerVoiceInteraction() {
  if (interactionActive) return;
  interactionActive      = true;
  fallDetectionStartTime = null;

  updateStatusUI('alerta', '🚨 Posible Caída — Verificando voz…');

  // Actualizar estado en BD
  try {
    dbClient.from('pacientes_estado')
      .update({ estado_actual: 'posible_caida' })
      .eq('paciente_id', currentPatientId);
  } catch (e) {
    console.warn("DB Update Error", e);
  }
  
  if (currentPatientId.includes('000000')) {
     logActivity("⚠️ Posible caída detectada (Demo Guardada)");
  }

  // Abrir modal
  document.getElementById('vapiModal').classList.add('active');

  // Anunciar por síntesis de voz
  const msg  = new SpeechSynthesisUtterance("¿Te encuentras bien? Por favor responde.");
  msg.lang   = 'es-ES';
  msg.rate   = 0.9;
  
  // Cambiar estado visual antes de empezar
  document.getElementById('listenStatusText').textContent = "Esperando que termine el anuncio...";

  // SOLO iniciar la escucha cuando el asistente termine de hablar
  msg.onend = () => {
    console.log("[Voice] Anuncio terminado. Iniciando escucha...");
    startVoiceListening();
  };

  window.speechSynthesis.speak(msg);
}

// ─── Escucha activa con Teachable Machine Audio ───────────────────────────────

async function startVoiceListening() {
  const statusText    = document.getElementById('listenStatusText');
  const barContainer  = document.getElementById('voiceBarContainer');
  const countdownEl   = document.getElementById('voiceCountdown');
  const resultEl      = document.getElementById('voiceResult');
  const micIcon       = document.getElementById('micIcon');

  barContainer.innerHTML = "";
  countdownEl.textContent = "";
  resultEl.textContent    = "";

  // Reset de buffer y metadatos para esta nueva sesión de escucha
  voiceTranscriptBuffer = [];
  voiceMetadata = { clase: "Silencio", confianza: 0 };

  // Esperar a que el modelo esté listo (se precargó al iniciar el monitoreo)
  if (!audioModelLoaded) {
    statusText.textContent = "Cargando modelo de voz…";
    await preloadAudioModel();
  }

  if (!audioModelLoaded || !audioRecognizer) {
    statusText.textContent = "❌ Modelo de voz no disponible — usa los botones";
    return;
  }

  // PREVENCIÓN: Si ya está escuchando, no volver a iniciar
  if (audioRecognizer.isListening()) {
    console.warn("[Audio] Ya hay una escucha activa, ignorando nueva petición.");
    return;
  }

  // Construir barras de confianza de audio en tiempo real
  const wordLabels = audioRecognizer.wordLabels();
  const barElements = {};
  wordLabels.forEach(label => {
    const cfg = AUDIO_CONFIG[label] || { color: "#a855f7", emoji: "🎙️", label };
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "margin-bottom:0.6rem;";

    const header = document.createElement("div");
    header.style.cssText = "display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:3px; font-weight:500;";
    header.innerHTML = `<span>${cfg.emoji} ${cfg.label}</span><span class="audio-pct-${label.replace(/\s/g,'_')}">0%</span>`;

    const track = document.createElement("div");
    track.style.cssText = "background:rgba(255,255,255,0.08); border-radius:99px; height:7px; overflow:hidden;";

    const fill = document.createElement("div");
    fill.className = `audio-fill-${label.replace(/\s/g,'_')}`;
    fill.style.cssText = `height:100%; width:0%; border-radius:99px; background:${cfg.color}; transition:width 0.15s, background 0.15s;`;

    track.appendChild(fill);
    wrapper.appendChild(header);
    wrapper.appendChild(track);
    barContainer.appendChild(wrapper);
    barElements[label] = { pctEl: header.querySelector(`.audio-pct-${label.replace(/\s/g,'_')}`), fillEl: fill };
  });

  // Activar animación del micrófono
  micIcon.classList.add('mic-listening');
  statusText.textContent = "🎙️ Escuchando... ¡Habla ahora!";
  statusText.style.color = "#6366f1";
  statusText.style.fontWeight = "bold";

  // Cuenta regresiva de 10 segundos
  let secondsLeft = 10;
  countdownEl.textContent = secondsLeft;
  voiceCountdownTimer = setInterval(() => {
    secondsLeft--;
    countdownEl.textContent = secondsLeft > 0 ? secondsLeft : "";
    if (secondsLeft <= 0) {
      clearInterval(voiceCountdownTimer);
    }
  }, 1000);

  // Resultado acumulado (tomamos la clase de mayor confianza sostenida)
  let detectedAnswer = null;
  let bestConfidence = 0;

  try {
    await audioRecognizer.listen(result => {
      const scores     = result.scores;
      const labels     = audioRecognizer.wordLabels();
      let topLabel     = "";
      let topScore     = 0;

      labels.forEach((label, idx) => {
        const score = scores[idx];
        const pct   = (score * 100).toFixed(1);
        const els = barElements[label];
        if (els) {
          if (els.pctEl)  els.pctEl.textContent     = `${pct}%`;
          if (els.fillEl) els.fillEl.style.width     = `${pct}%`;
        }
        if (score > topScore) {
          topScore = score;
          topLabel = label;
        }
      });

      // Registro frame a frame para la transcripción raw
      voiceTranscriptBuffer.push(`${new Date().toLocaleTimeString()} - ${topLabel} (${(topScore * 100).toFixed(1)}%)`);

      // Guardar la mejor predicción no-ruido con umbral 70%
      if (topLabel !== "Background Noise" && topScore > 0.70) {
        if (topScore > bestConfidence) {
          bestConfidence = topScore;
          detectedAnswer = topLabel;
          
          voiceMetadata.clase = topLabel;
          voiceMetadata.confianza = topScore * 100;
        }

        const cfg = AUDIO_CONFIG[topLabel] || {};
        resultEl.textContent = `${cfg.emoji || ''} Detectado: "${cfg.label || topLabel}" (${(topScore*100).toFixed(0)}%)`;
        resultEl.style.color = cfg.color || "#fff";

        // Actualizar Log de Debug en la pantalla principal
        const logEl = document.getElementById('voice-debug-log');
        if (logEl) {
          const entry = document.createElement('div');
          entry.style.marginBottom = "4px";
          entry.style.borderBottom = "1px solid rgba(255,255,255,0.02)";
          entry.innerHTML = `<span style="color:#6b7280;">[${new Date().toLocaleTimeString()}]</span> ${cfg.emoji || '🎙️'} <strong>${topLabel}</strong> (${(topScore*100).toFixed(0)}%)`;
          logEl.insertBefore(entry, logEl.firstChild);
        }
      }

    }, {
      includeSpectrogram: false,
      probabilityThreshold: 0.60,
      invokeCallbackOnNoiseAndUnknown: true,
      overlapFactor: 0.50
    });
  } catch (e) {
    console.warn("[Audio] Error al iniciar escucha:", e.message);
    statusText.textContent = "❌ Sin acceso al micrófono — usa los botones";
    micIcon.classList.remove('mic-listening');
    clearInterval(voiceCountdownTimer);
    return;
  }

  // Timeout de 10 segundos → decidir basado en lo detectado
  voiceListenTimeout = setTimeout(() => {
    stopVoiceListening();

    if (detectedAnswer === "Estoy bien") {
      resultEl.textContent = "✅ Respuesta reconocida: Estoy bien";
      resultEl.style.color = "#22c55e";
      setTimeout(() => simularRespuestaVAPI('estoy bien'), 800);
    } else if (detectedAnswer === "No estoy bien") {
      resultEl.textContent = "🆘 Respuesta reconocida: No estoy bien";
      resultEl.style.color = "#ef4444";
      setTimeout(() => simularRespuestaVAPI('no_responde'), 800);
    } else {
      resultEl.textContent = "⏰ Sin respuesta detectada — enviando alerta";
      resultEl.style.color = "#f59e0b";
      setTimeout(() => simularRespuestaVAPI('no_responde'), 1200);
    }
  }, 10000);
}

function stopVoiceListening() {
  clearInterval(voiceCountdownTimer);
  clearTimeout(voiceListenTimeout);

  const micIcon = document.getElementById('micIcon');
  if (micIcon) micIcon.classList.remove('mic-listening');

  try {
    if (audioRecognizer && audioRecognizer.isListening()) {
      audioRecognizer.stopListening();
    }
  } catch (_) {}
}

let alertInProgress = false;

// ─── Procesar respuesta (VAPI - manual o automático) ─────────────────────────

async function simularRespuestaVAPI(respuestaUsuario) {
  if (alertInProgress) return;
  alertInProgress = true; 

  stopVoiceListening();
  clearTimeout(window.vapiTimeout);
  document.getElementById('vapiModal').classList.remove('active');

  const esBien = ['estoy bien', 'afirmativo', 'si'].includes(respuestaUsuario);

  // Preparar datos para el evento con un ID garantizado como único
  const eventosData = {
    id: crypto.randomUUID(), // Forzamos un ID nuevo en cada intento para evitar el 409 Conflict
    paciente_id: currentPatientId,
    incidente: esBien ? 'caida_detectada' : 'alerta_enviada',
    respuesta_recibida: esBien ? 'El paciente respondió que se encuentra bien.' : 'Sin respuesta o respuesta negativa.',
    transcripcion_voz: voiceTranscriptBuffer.join('\n'), 
    clase_detectada: voiceMetadata.clase,
    confianza_modelo: voiceMetadata.confianza,
    fecha_hora: new Date().toISOString()
  };

  if (esBien) {
    updateStatusUI('safe', '✅ Normal' + (currentPatientId.includes('0000') ? ' (Demo)' : ''));
    try {
      await dbClient.from('eventos').insert(eventosData);
      await dbClient.from('pacientes_estado')
        .update({ estado_actual: 'normal' })
        .eq('paciente_id', currentPatientId);
      logActivity(esBien ? "✅ El paciente confirmó estar bien (Guardado)" : "🚨 Alerta crítica simulada (Guardada)");
    } catch (e) { console.warn("DB Write Error", e); }
  } else {
    updateStatusUI('alerta', '🚨 ALERTA CRÍTICA' + (currentPatientId.includes('0000') ? ' (Demo)' : ''));
    try {
      await dbClient.from('eventos').insert(eventosData);
      await dbClient.from('pacientes_estado')
        .update({ estado_actual: 'alerta' })
        .eq('paciente_id', currentPatientId);
      logActivity("🚨 Alerta crítica registrada en BD");
      
      // ENVÍO DE EMAIL AUTOMÁTICO VÍA FORMSPREE
      sendEmailAlert(eventosData);

    } catch (e) { console.warn("DB Write Error", e); }
  }

    // (Desactivado temporalmente para evitar errores de red en demo)
    /* 
    fetch('https://webhook.site/placeholder_url', {
      method: 'POST',
      body: JSON.stringify({ paciente: currentPatientId, estado: 'Emergencia' })
    }).catch(() => {});
    */

  interactionActive = false;
}

// Función para enviar reporte por correo con diseño vía FormSpree
async function sendEmailAlert(data) {
  const FORMSPREE_URL = "https://formspree.io/f/mykblyza";
  
  // Obtener el nombre real del paciente desde la interfaz
  const nameEl = document.getElementById('patientName');
  const nombrePaciente = nameEl ? nameEl.innerText.replace('Paciente: ', '') : "Paciente Desconocido";

  logActivity("📧 Enviando reporte por correo...");

  const payload = {
    _subject: "🚨 ALERTA: " + nombrePaciente + " requiere asistencia",
    "REPORTE DE INCIDENTE": "SAFEWATCH GUARDIAN v1.0",
    "PACIENTE": "👤 " + nombrePaciente,
    "ESTADO":  "🚨 EMERGENCIA CONFIRMADA",
    "DETALLE": "⚠️ " + data.incidente.replace('_', ' ').toUpperCase(),
    "CONFIANZA_IA": data.clase_detectada + " [" + Math.round(data.confianza_modelo) + "%]",
    "ANALISIS_VOZ": "🗣️ " + data.respuesta_recibida,
    "HISTORIAL": data.transcripcion_voz,
    "LINK_ACCION": "🔗 Ver ubicación y reporte en: http://127.0.0.1:5500/admin.html",
    "ID_SISTEMA": data.paciente_id,
    "FECHA": new Date().toLocaleString()
  };

  try {
    const response = await fetch(FORMSPREE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      logActivity("✅ Reporte enviado con éxito a la central.");
    } else {
      throw new Error("Error en FormSpree");
    }
  } catch (e) {
    console.error("Error enviando email:", e);
    logActivity("❌ Error al enviar el reporte por correo.");
  }
}

// Función auxiliar para el registro de actividad
function logActivity(text) {
  const logEl = document.getElementById('activity-log');
  if (logEl) {
    const entry = document.createElement('div');
    entry.style.marginBottom = "6px";
    entry.innerHTML = `<span style="color:#6b7280; font-size:0.75rem;">[${new Date().toLocaleTimeString()}]</span> ${text}`;
    logEl.insertBefore(entry, logEl.firstChild);
    
    // Remover mensaje de "Sin eventos"
    if (logEl.lastChild && logEl.lastChild.textContent.includes('Sin eventos')) {
       logEl.removeChild(logEl.lastChild);
    }
  }
}


/**
 * MONITOR.JS
 * Integra WebRTC, Teachable Machine Pose (TensorFlow.js) y la simulación de lógica VAPI.
 * Modelo: https://teachablemachine.withgoogle.com/models/MSQN5JiSD/
 * Clases: Sentado | Parado | Caida | Sin presencia
 */

const URL_TEACHABLE_MACHINE = "https://teachablemachine.withgoogle.com/models/MSQN5JiSD/";

// Clases del modelo y sus colores de indicador
const CLASS_CONFIG = {
  "sentado":        { color: "#3b82f6", emoji: "🪑", label: "Sentado"        },
  "parado":         { color: "#22c55e", emoji: "🧍", label: "Parado"         },
  "caida":          { color: "#ef4444", emoji: "🚨", label: "Caída"          },
  "sin presencia":  { color: "#6b7280", emoji: "👻", label: "Sin presencia"  },
};

let model, webcam, labelContainer, maxPredictions;
let ctx; // canvas context for pose keypoints
let isRunning = false;
let fallDetectionStartTime = null;
const FALL_THRESHOLD_MS = 3000; // 3 segundos para confirmar caída
let interactionActive = false;
let currentPatientId = null;

// ─── Botones de control ───────────────────────────────────────────────────────

async function startMonitoring() {
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  isRunning = true;
  document.getElementById('pose-status').textContent = "Cargando modelo…";
  await initTeachableMachine();
}

async function stopMonitoring() {
  isRunning = false;
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  if (webcam) {
    webcam.stop();
    document.getElementById("webcam-container").innerHTML = "";
  }
  document.getElementById('pose-status').textContent = 'Monitoreo detenido.';
  document.getElementById('label-container').innerHTML = '';
  updateStatusUI('safe', 'Normal');
}

// ─── Inicialización Teachable Machine Pose ────────────────────────────────────

async function initTeachableMachine() {
  try {
    const modelURL    = URL_TEACHABLE_MACHINE + "model.json";
    const metadataURL = URL_TEACHABLE_MACHINE + "metadata.json";

    // Cargar modelo de pose
    model = await tmPose.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();

    // Configurar webcam
    const camWidth  = 560;
    const camHeight = 420;
    const flip      = true;
    webcam = new tmPose.Webcam(camWidth, camHeight, flip);
    await webcam.setup();
    await webcam.play();

    // Canvas para esqueleto de pose sobre el video
    const canvas  = document.createElement("canvas");
    canvas.width  = camWidth;
    canvas.height = camHeight;
    canvas.style.cssText = "display:block; width:100%; border-radius:12px;";
    ctx = canvas.getContext("2d");

    const container = document.getElementById("webcam-container");
    container.innerHTML = "";
    container.appendChild(canvas);

    // Construir barras de probabilidad dinámicas
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

    // Obtener ID del paciente desde la sesión activa
    try {
      const { data } = await dbClient.auth.getSession();
      currentPatientId = data?.session?.user?.id || 'paciente-demo';
    } catch (_) {
      currentPatientId = 'paciente-demo';
    }

    document.getElementById('pose-status').textContent = "✅ Modelo cargado – Monitoreando…";
    updateStatusUI('safe', '✅ Normal');
    window.requestAnimationFrame(loop);

  } catch (e) {
    console.error("Error al cargar modelo de TM Pose:", e);
    document.getElementById('pose-status').textContent = "❌ Error al cargar el modelo.";
    alert("Error al cargar la cámara o el modelo. ¿Permitiste acceso a la webcam?\n\n" + e.message);
    stopMonitoring();
  }
}

// ─── Loop de predicción ───────────────────────────────────────────────────────

async function loop() {
  if (!isRunning) return;
  webcam.update();
  try {
    if (!interactionActive) {
      await predict();
    } else {
      // Mientras hay interacción, solo seguir dibujando el frame
      ctx.drawImage(webcam.canvas, 0, 0);
    }
  } catch (e) {
    console.warn("[Monitor] Error en frame (se mantiene el loop):", e.message);
  }
  window.requestAnimationFrame(loop);
}

async function predict() {
  // Estimar pose + clasificar
  const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
  const prediction = await model.predict(posenetOutput);

  // Dibujar frame de la webcam
  ctx.drawImage(webcam.canvas, 0, 0);

  // Dibujar esqueleto de pose si hay keypoints
  if (pose) {
    drawPose(pose);
  }

  let isFalling = false;
  let topClass = { name: "", prob: 0 };

  prediction.forEach((p, i) => {
    const pct = (p.probability * 100).toFixed(1);
    const key = p.className.toLowerCase();
    const cfg = CLASS_CONFIG[key] || { color: "#a855f7", emoji: "❓", label: p.className };

    // Actualizar etiqueta y porcentaje
    const labelEl = labelContainer.querySelector(`.bar-label-${i}`);
    const pctEl   = labelContainer.querySelector(`.bar-pct-${i}`);
    const fillEl  = labelContainer.querySelector(`.bar-fill-${i}`);

    if (labelEl) labelEl.textContent = `${cfg.emoji} ${cfg.label}`;
    if (pctEl)   pctEl.textContent   = `${pct}%`;
    if (fillEl) {
      fillEl.style.width      = `${pct}%`;
      fillEl.style.background = cfg.color;
    }

    // Rastrear clase dominante
    if (p.probability > topClass.prob) {
      topClass = { name: key, prob: p.probability };
    }

    // Detección de caída con umbral 80%
    if ((key === "caida") && p.probability > 0.80) {
      isFalling = true;
    }
  });

  // Actualizar indicador de estado según clase dominante
  if (!isFalling && topClass.prob > 0.60) {
    const cfg = CLASS_CONFIG[topClass.name] || {};
    if (topClass.name !== "caida") {
      updateStatusUI('safe', `${cfg.emoji || ''} ${cfg.label || topClass.name}`);
    }
  }

  handleFallLogic(isFalling);
}

// ─── Dibujar esqueleto de pose ────────────────────────────────────────────────
// Usa las utilidades de posenet@2.2.1 (globales tras cargar posenet.min.js)
// tmPose.getAdjacentKeyPoints NO existe en @0.8 — no usar.

function drawPose(pose) {
  if (!pose || !pose.keypoints) return;

  ctx.strokeStyle = "rgba(0, 245, 255, 0.85)";
  ctx.lineWidth   = 2;
  ctx.shadowBlur  = 8;
  ctx.shadowColor = "#00f5ff";

  // posenet.drawSkeleton y drawKeypoints están disponibles como globales
  if (typeof posenet !== 'undefined' && posenet.drawSkeleton) {
    posenet.drawSkeleton(pose.keypoints, 0.5, ctx);
    posenet.drawKeypoints(pose.keypoints, 0.5, ctx);
    ctx.shadowBlur = 0;
    return;
  }

  // Fallback manual: solo puntos clave
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

// ─── Lógica de caída con temporizador ────────────────────────────────────────

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
    // Recuperación: reset contador si la postura vuelve a ser normal
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

// ─── Lógica VAPI (Simulada) ───────────────────────────────────────────────────

function triggerVoiceInteraction() {
  if (interactionActive) return;
  interactionActive   = true;
  fallDetectionStartTime = null;

  updateStatusUI('alerta', '🚨 Posible Caída — Verificando voz…');

  try {
    dbClient.from('pacientes_estado')
      .update({ estado_actual: 'posible_caida' })
      .eq('paciente_id', currentPatientId);
  } catch (_) {}

  document.getElementById('vapiModal').classList.add('active');

  const msg = new SpeechSynthesisUtterance("¿Te encuentras bien?");
  msg.lang = 'es-ES';
  window.speechSynthesis.speak(msg);

  window.vapiTimeout = setTimeout(() => {
    simularRespuestaVAPI('no_responde');
  }, 10000);
}

async function simularRespuestaVAPI(respuestaUsuario) {
  clearTimeout(window.vapiTimeout);
  document.getElementById('vapiModal').classList.remove('active');

  const esBien = ['estoy bien', 'afirmativo', 'si'].includes(respuestaUsuario);

  if (esBien) {
    updateStatusUI('safe', '✅ Normal');
    try {
      await dbClient.from('eventos').insert({
        paciente_id: currentPatientId,
        incidente: 'caida_detectada',
        respuesta_recibida: 'El paciente respondió que se encuentra bien.',
      });
      await dbClient.from('pacientes_estado')
        .update({ estado_actual: 'normal' })
        .eq('paciente_id', currentPatientId);
    } catch (_) {}
  } else {
    updateStatusUI('alerta', '🚨 ALERTA CRÍTICA ENVIADA');
    try {
      await dbClient.from('eventos').insert({
        paciente_id: currentPatientId,
        incidente: 'alerta_enviada',
        respuesta_recibida: 'Sin respuesta o respuesta negativa.',
      });
      await dbClient.from('pacientes_estado')
        .update({ estado_actual: 'alerta' })
        .eq('paciente_id', currentPatientId);
    } catch (_) {}

    fetch('https://webhook.site/placeholder_url', {
      method: 'POST',
      body: JSON.stringify({ paciente: currentPatientId, estado: 'Emergencia' })
    }).catch(() => {});
  }

  interactionActive = false;
}

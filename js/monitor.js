/**
 * MONITOR.JS
 * Integra WebRTC, Teachable Machine (TensorFlow.js) y la simulación de lógica VAPI.
 */

// Link de tu propio modelo Teachable Machine entrenado con "Normal" y "Caída"
// Actualmente usa un modelo genérico vacío como placeholder. Debes incluir el tuyo.
const URL_TEACHABLE_MACHINE = "https://teachablemachine.withgoogle.com/models/w_X0D25uR/"; 

let model, webcam, labelContainer, maxPredictions;
let isRuning = false;
let fallDetectionStartTime = null;
let fallThresholdSeconds = 3000; // 3 segundos para confirmar caída
let interactionActive = false;
let currentPatientId = null;

async function startMonitoring() {
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  isRuning = true;
  await initTeachableMachine();
}

async function stopMonitoring() {
  isRuning = false;
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  if(webcam) {
    webcam.stop();
    document.getElementById("webcam-container").innerHTML = "";
  }
}

async function initTeachableMachine() {
    try {
      const modelURL = URL_TEACHABLE_MACHINE + "model.json";
      const metadataURL = URL_TEACHABLE_MACHINE + "metadata.json";

      // Load model
      model = await tmImage.load(modelURL, metadataURL);
      maxPredictions = model.getTotalClasses();

      // Setup WebRTC Video
      const flip = true; 
      webcam = new tmImage.Webcam(600, 400, flip); // width, height, flip
      await webcam.setup(); 
      await webcam.play();
      window.requestAnimationFrame(loop);

      document.getElementById("webcam-container").appendChild(webcam.canvas);
      labelContainer = document.getElementById("label-container");
      for (let i = 0; i < maxPredictions; i++) {
          labelContainer.appendChild(document.createElement("div"));
      }

      // Obtener Paciente de Sesión actual (supongamos mock para UI)
      const { data } = await dbClient.auth.getSession();
      currentPatientId = data?.session?.user?.id || 'paciente-generico-123';
      
      updateStatusUI('normal', 'Seguro / Normal');

    } catch (e) {
      console.error("Error al cargar modelo de TM:", e);
      alert("Error al cargar cámara o el modelo de Teachable Machine. ¿Permitiste acceso a la web cam?");
      stopMonitoring();
    }
}

async function loop() {
  if (!isRuning) return;
  webcam.update(); // Update webcam iframe
  if(!interactionActive) {
      await predict();
  }
  window.requestAnimationFrame(loop);
}

async function predict() {
  const prediction = await model.predict(webcam.canvas);
  let isFalling = false;

  for (let i = 0; i < maxPredictions; i++) {
      const classPrediction = prediction[i].className + ": " + prediction[i].probability.toFixed(2);
      labelContainer.childNodes[i].innerHTML = classPrediction;

      // Logica de Detección
      if (prediction[i].className.toLowerCase() === "caída" || prediction[i].className.toLowerCase() === "caida") {
          if (prediction[i].probability > 0.8) {
              isFalling = true;
          }
      }
  }

  handleFallLogic(isFalling);
}

function handleFallLogic(isFalling) {
    if (isFalling) {
        if (!fallDetectionStartTime) {
            fallDetectionStartTime = Date.now();
        } else {
            const timeElapsed = Date.now() - fallDetectionStartTime;
            if (timeElapsed >= fallThresholdSeconds) {
                // Confirmamos Caída despues de 3 segundos
                triggerVoiceInteraction();
            }
        }
    } else {
        // Resetea el contador si se recupera rápido
        fallDetectionStartTime = null; 
    }
}

function updateStatusUI(statusClass, text) {
    const statusDiv = document.getElementById('statusIndicator');
    statusDiv.className = `status-indicator ${statusClass === 'alerta' ? 'danger' : 'safe'}`;
    statusDiv.innerText = text;
}

// ============== Lógica VAPI (Simulada para visualización de evento) ==============
function triggerVoiceInteraction() {
  if(interactionActive) return;
  interactionActive = true;
  fallDetectionStartTime = null;

  updateStatusUI('alerta', 'Posible Caída - Verificando Voz');
  
  // Registrar en Estado
  dbClient.from('pacientes_estado').update({ estado_actual: 'posible_caida' }).eq('paciente_id', currentPatientId);

  // Modal visual para la simulación
  const modal = document.getElementById('vapiModal');
  modal.classList.add('active');

  // Integración VAPI real aquí (Web SDK):
  // const vapi = new Vapi("VAPI_PUBLIC_KEY");
  // vapi.start("VAPI_ASSISTANT_ID");
  
  // Aquí usamos la voz nativa del navegador para simular a VAPI preguntando
  const msg = new SpeechSynthesisUtterance("¿Te encuentras bien?");
  msg.lang = 'es-ES';
  window.speechSynthesis.speak(msg);

  // Simular tiempo de espera por si el usuario no presiona nada (Timeout 10 segs)
  window.vapiTimeout = setTimeout(() => {
    simularRespuestaVAPI('no_responde');
  }, 10000);
}

async function simularRespuestaVAPI(respuestaUsuario) {
  clearTimeout(window.vapiTimeout);
  const modal = document.getElementById('vapiModal');
  modal.classList.remove('active');

  if (respuestaUsuario === 'estoy bien' || respuestaUsuario === 'afirmativo' || respuestaUsuario === 'si') {
      // Falsa alarma o el usuario se recuperó
      updateStatusUI('safe', 'Normal');
      
      await dbClient.from('eventos').insert({
        paciente_id: currentPatientId,
        incidente: 'caida_detectada',
        respuesta_recibida: 'El paciente respondió que se encuentra bien.',
      });
      
      await dbClient.from('pacientes_estado').update({ estado_actual: 'normal' }).eq('paciente_id', currentPatientId);

  } else {
      // Enviar Alerta Crítica (No respondió o pidió ayuda)
      updateStatusUI('alerta', '🚨 ALERTA CRÍTICA ENVIADA');
      
      await dbClient.from('eventos').insert({
        paciente_id: currentPatientId,
        incidente: 'alerta_enviada',
        respuesta_recibida: 'Sin respuesta o respuesta negativa.',
      });
      
      await dbClient.from('pacientes_estado').update({ estado_actual: 'alerta' }).eq('paciente_id', currentPatientId);
      
      // Llamada de Webhook simulado
      fetch('https://webhook.site/placeholder_url', { 
         method: 'POST', body: JSON.stringify({ paciente: currentPatientId, estado: 'Emergencia' }) 
      }).catch(e => console.log('Webhook test'));
  }

  // Reactivar detección
  interactionActive = false;
}

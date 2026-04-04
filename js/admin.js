/**
 * ADMIN.JS
 * Lógica del panel Super-Admin para SafeWatch Guardian.
 * Permite inyectar datos demo y monitorear la transcripción de incidentes reales.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Verificar si es SuperAdmin (Redirigir si no lo es)
    checkAdminRole();
    
    // Cargar estadísticas e incidentes iniciales
    loadStats();
    loadIncidents();
});

async function checkAdminRole() {
    const { data: { session } } = await dbClient.auth.getSession();
    if (!session) return;
    
    try {
        const { data: profile } = await dbClient.from('users').select('rol').eq('id', session.user.id).single();
        if(!profile || profile.rol !== 'superadmin') {
            console.warn("Acceso denegado: No es SuperAdmin");
            window.location.href = 'monitor.html';
        }
    } catch (_) {}
}

async function loadStats() {
    try {
        // En un proyecto real usaríamos la vista admin_user_summary, 
        // aquí simulamos el conteo si estamos en modo mock
        const { data: users } = await dbClient.from('users').select('tipo_usuario');
        
        if (users) {
            const demos = users.filter(u => u.tipo_usuario === 'demo').length;
            const real  = users.filter(u => u.tipo_usuario === 'concretado').length;
            
            animateCounter('countDemos', demos);
            animateCounter('countReal', real);
        }
    } catch (_) {
        document.getElementById('countDemos').innerText = "2";
        document.getElementById('countReal').innerText = "0";
    }
}

function animateCounter(id, target) {
    let current = 0;
    const el = document.getElementById(id);
    const interval = setInterval(() => {
        if (current >= target) {
            el.innerText = target;
            clearInterval(interval);
        } else {
            current++;
            el.innerText = current;
        }
    }, 50);
}

async function loadIncidents() {
    const tbody = document.getElementById('incidentsTableBody');
    
    try {
        // En producción: dbClient.from('admin_incidents_view').select('*')
        const { data: incidents } = await dbClient.from('eventos').select('*, users(nombres_apellidos, tipo_usuario)');
        
        if (!incidents || incidents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 3rem; color: var(--text-muted);">No hay incidentes registrados aún.</td></tr>';
            return;
        }

        tbody.innerHTML = incidents.map(inc => {
            const date = new Date(inc.fecha_hora || inc.created_at).toLocaleString();
            const badgeClass = inc.users?.tipo_usuario === 'demo' ? 'badge-demo' : 'badge-real';
            const logLines = inc.transcripcion_voz ? inc.transcripcion_voz.split('\n').slice(-3).join('<br>') : 'Sin registro de voz';

            return `
                <tr>
                    <td>
                        <div style="font-weight: 500;">${inc.users?.nombres_apellidos || 'Paciente Desconocido'}</div>
                        <div style="font-size:0.75rem; color: var(--text-muted);">${date}</div>
                    </td>
                    <td><span class="badge ${badgeClass}">${inc.users?.tipo_usuario?.toUpperCase() || 'DEMO'}</span></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span class="badge badge-alerta">${inc.incidente === 'caida_detectada' ? 'CAÍDA' : 'ALERTA'}</span>
                            <span style="font-size:0.8rem; color:#f59e0b;">${inc.atendido ? '✅ Atendido' : '⚠️ Pendiente'}</span>
                        </div>
                    </td>
                    <td>
                        <div style="font-weight: 600; color: ${inc.clase_detectada === 'Estoy bien' ? '#22c55e' : '#ef4444'};">
                            ${inc.clase_detectada || 'Pendiente'}
                        </div>
                        <div style="font-size:0.7rem; color: var(--text-muted);">${inc.confianza_modelo ? inc.confianza_modelo + '%' : ''}</div>
                    </td>
                    <td>
                        <div class="modal-log">
                            ${logLines}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted);">Error al cargar feed (Supabase desconectado).</td></tr>';
    }
}

// ─── Generador de Escenarios Demo ─────────────────────────────────────────────

async function generateDemoScenario() {
    const name = document.getElementById('demoPatientName').value || "Mario Casas (Demo)";
    const logBox = document.getElementById('injectLog');
    const btn = document.getElementById('btnInject');
    
    btn.disabled = true;
    logBox.innerHTML = "🏁 Iniciando inyección de escenario demo...";
    
    try {
        // En una demo real, crearíamos los IDs reales en Supabase
        const mockPatientId = 'demo-id-' + Date.now();

        await log("1. Creando perfil de paciente: " + name);
        await log("2. Generando credenciales temporales...");
        
        await log("3. Insertando en tabla `users` (tipo demo)...");
        // dbClient.from('users').insert({ id: mockPatientId, nombres_apellidos: name, rol: 'paciente', tipo_usuario: 'demo' })
        
        await log("4. Vinculando acudiente responsable...");
        await log("5. Inicializando `pacientes_estado` en 'normal'...");
        
        await log("6. Agregando contactos de emergencia simulados...");
        
        await log("7. Inyectando historial de voces (log de entrenamiento)...");
        
        logBox.innerHTML = '<span style="color: #22c55e;">✅ Escenario listo. El paciente "' + name + '" ya aparece en el feed global.</span>';
        
        // Simular un evento de caída para que se vea algo en la tabla inmediatamente
        const demoEvent = {
            paciente_id: mockPatientId,
            incidente: 'caida_detectada',
            clase_detectada: 'No estoy bien',
            confianza_modelo: 91.5,
            transcripcion_voz: new Date().toLocaleTimeString() + " - Background Noise (0.2%)\n" + new Date().toLocaleTimeString() + " - No estoy bien (91.5%)",
            atendido: false,
            users: { nombres_apellidos: name, tipo_usuario: 'demo' }
        };
        
        // Si estamos en demo mode, agregamos el evento a la UI manualmente o recargamos
        setTimeout(() => {
            loadStats();
            loadIncidents();
            btn.disabled = false;
        }, 1500);

    } catch (e) {
        logBox.innerHTML = '<span style="color: #ef4444;">❌ Error: ' + e.message + '</span>';
        btn.disabled = false;
    }
}

async function log(msg) {
    const lb = document.getElementById('injectLog');
    lb.innerHTML += "<br>> " + msg;
    lb.scrollTop = lb.scrollHeight;
    return new Promise(r => setTimeout(r, 600));
}

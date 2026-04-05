/**
 * REGISTRO.JS
 * Lógica para automatizar el registro de pacientes y roles en Supabase
 * Vincula Authentication con la tabla public.users
 */

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const roleSelect   = document.getElementById('reg-rol');
    const vapiVinculo  = document.getElementById('paciente-vinculo');

    if (registerForm) {
        // Mostrar campo de vínculo solo si es acudiente
        roleSelect.addEventListener('change', (e) => {
            vapiVinculo.style.display = (e.target.value === 'acudiente') ? 'block' : 'none';
        });

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn           = registerForm.querySelector('button');
            const msgEl         = document.getElementById('registerMsg');
            const nombres       = document.getElementById('reg-nombres').value;
            const email         = document.getElementById('reg-email').value;
            const pwd           = document.getElementById('reg-password').value;
            const rol           = document.getElementById('reg-rol').value;
            const pacienteVinculo = document.getElementById('reg-paciente-id').value || null;

            // Bloquear botón y limpiar estados
            btn.disabled = true;
            btn.innerText = "Registrando...";
            msgEl.style.display = 'none';

            try {
                // 1. Enviar registro a Supabase Auth
                // (Nota: Si el correo está repetido o es inválido, Supabase dará error)
                const { data, error } = await dbClient.auth.signUp({
                    email: email,
                    password: pwd,
                    options: {
                        data: {
                            full_name: nombres
                        }
                    }
                });

                if (error) throw error;

                const user = data.user;
                if (!user) throw new Error("No se pudo obtener el ID del usuario creado.");

                // 2. Crear perfil extendido en public.users
                const { error: dbError } = await dbClient.from('users').insert({
                    id: user.id,
                    email: email,
                    rol: rol,
                    nombres_apellidos: nombres,
                    paciente_id: (rol === 'acudiente' && pacienteVinculo) ? pacienteVinculo : null
                });

                if (dbError) {
                   console.warn("Auth OK, pero error en tabla users:", dbError);
                   throw new Error("Se creó el usuario pero hubo un error al asignar el rol. Ajustalo manualmente en Supabase.");
                }

                // 3. Crear registro de estado inicial si es paciente
                if (rol === 'paciente') {
                    await dbClient.from('pacientes_estado').insert({
                        paciente_id: user.id,
                        estado_actual: 'normal'
                    });
                }

                // 4. Éxito
                msgEl.style.display = 'block';
                msgEl.style.background = "rgba(34,197,94,0.15)";
                msgEl.style.color = "#22c55e";
                msgEl.innerHTML = `✅ **¡Usuario registrado!**<br>ID generado: <code>${user.id}</code><br>Por favor verifica que no haya confirmación de correo requerida en Supabase Dashboard.`;
                registerForm.reset();

            } catch (err) {
                console.error("Error completo:", err);
                msgEl.style.display = 'block';
                msgEl.style.background = "rgba(239,68,68,0.15)";
                msgEl.style.color = "#ef4444";

                // Traducir errores comunes de Supabase
                let friendlyMsg = err.message || "Error desconocido.";
                if (friendlyMsg.includes("already registered") || friendlyMsg.includes("unique_email")) {
                    friendlyMsg = "❌ Este correo electrónico ya está registrado. Por favor usa uno diferente para este usuario.";
                } else if (friendlyMsg.includes("insert or update on table \"users\" violates foreign key constraint")) {
                    friendlyMsg = "❌ El ID del paciente no es válido. Verifica que esté bien copiado del directorio.";
                } else if (friendlyMsg.includes("email rate limit exceeded")) {
                    friendlyMsg = "⚠️ Se ha alcanzado el límite de registros permitidos por tiempo. Por seguridad, Supabase bloqueó los registros por unos minutos. Inténtalo de nuevo en 15 minutos.";
                }

                msgEl.innerText = friendlyMsg;
            } finally {
                btn.disabled = false;
                btn.innerText = "Crear Cuenta de Usuario";
            }
        });
    }
});

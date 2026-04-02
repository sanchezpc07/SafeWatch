// INSTRUCCIONES: Reemplaza las siguientes variables con tus credenciales de Supabase
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Iniciar Supabase solo si las credenciales no son el texto por defecto
let dbClient;
try {
  if (SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL') {
    dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.warn("MOCK MODE: Configura tus llaves de Supabase en auth.js. Usando datos simulados.");
    // Mock Supabase Object for demo if not configured
    dbClient = createMockSupabase();
  }
} catch (e) {
  console.error("Error iniciando supabase", e);
}

// Lógica de Inicio de Sesión
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const pwd = document.getElementById('password').value;
      
      try {
        const { data, error } = await dbClient.auth.signInWithPassword({
          email: email,
          password: pwd
        });
        
        if (error) throw error;
        
        // Obtener Rol
        const { data: profileData } = await dbClient.from('users').select('rol').eq('id', data.user.id).single();
        
        if (profileData && profileData.rol === 'superadmin') {
          window.location.href = 'dashboard.html';
        } else {
          window.location.href = 'monitor.html';
        }
      } catch (err) {
        document.getElementById('loginError').style.display = 'block';
        console.error("Login failed", err);
      }
    });
  }
  
  checkSession();
});

async function checkSession() {
  const currentPath = window.location.pathname;
  if (currentPath.includes('index.html')) return; // No chequear restricción en login
  
  const { data: { session } } = await dbClient.auth.getSession();
  if (!session && !SUPABASE_URL.includes("YOUR")) {
    window.location.href = 'index.html';
  } else if (!session) {
    // Si estamos en mock mode, inventamos una sesion falsa
  } else {
    // Session activa, mostrar nombre
    const { data: profileData } = await dbClient.from('users').select('nombres_apellidos').eq('id', session.user.id).single();
    if(profileData) {
      if(document.getElementById('adminName')) document.getElementById('adminName').innerText = profileData.nombres_apellidos;
      if(document.getElementById('patientName')) document.getElementById('patientName').innerText = "Paciente: " + profileData.nombres_apellidos;
    }
  }
}

async function logout() {
  await dbClient.auth.signOut();
  window.location.href = 'index.html';
}

function createMockSupabase() {
  return {
    auth: {
      signInWithPassword: async ({email, password}) => {
        if (email === 'Sanchezpc07@gmail.com' && password === 'S@fewatcH') {
          return { data: { user: { id: 'superadmin-mock-id' } }, error: null };
        } else if (password === '123456') { // paciente de prueba
           return { data: { user: { id: 'patient-mock-id' } }, error: null };
        }
        return { data: null, error: new Error("Invalid credentials") };
      },
      getSession: async () => ({ data: { session: { user: { id: 'mock-id' } } } }),
      signOut: async () => {}
    },
    from: (table) => {
      return {
        select: (cols) => ({
          eq: (field, value) => ({
             single: async () => {
               if (value === 'superadmin-mock-id') return { data: { rol: 'superadmin', nombres_apellidos: 'SuperAdmin' }};
               return { data: { rol: 'paciente', nombres_apellidos: 'Usuario de Prueba' }};
             },
             order: async () => ({ data: getMockData() })
          }),
          order: async () => ({ data: getMockData() })
        }),
        insert: async (data) => ({ error: null }),
        update: async (data) => ({ eq: async () => ({ error: null }) })
      }
    }
  };
}

function getMockData() {
  return [
    { users: { rol: 'paciente', nombres_apellidos: 'Ana López', parentesco: 'N/A' }, pacientes_estado: { estado_actual: 'normal' }, incidente: '-', fecha_hora: '2026-04-02 10:00:00', respuesta_recibida: 'N/A' },
    { users: { rol: 'paciente', nombres_apellidos: 'Carlos Ruiz', parentesco: 'N/A' }, pacientes_estado: { estado_actual: 'alerta' }, incidente: 'caida_detectada', fecha_hora: '2026-04-02 11:30:00', respuesta_recibida: 'Ninguna' },
  ];
}

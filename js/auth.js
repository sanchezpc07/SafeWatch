// INSTRUCCIONES: Reemplaza las siguientes variables con tus credenciales de Supabase
const SUPABASE_URL = 'https://ujusnpmnmvinkwafgbus.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqdXNucG1ubXZpbmt3YWZnYnVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjA0MzEsImV4cCI6MjA5MDczNjQzMX0.jS_muL3OhZw005D-aqkDgTOsnS945SM7LynDxf23LAU';

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
        let sessionData, sessionError;

        const isAdminEmail = email.toLowerCase().includes('admin');

        // REGLAS DEMO: Admin -> S@fewatcH2026 | Paciente -> 123456
        let isDemoLogin = false;
        if (isAdminEmail && pwd === 'S@fewatcH2026') isDemoLogin = true;
        if (!isAdminEmail && pwd === '123456') isDemoLogin = true;

        if (isDemoLogin) {
          console.log("Iniciando en MODO DEMO - Rol:", isAdminEmail ? 'Admin' : 'Paciente');
          sessionData = { user: { id: isAdminEmail ? 'superadmin-mock-id' : 'patient-mock-id', email: email } };
          localStorage.setItem('safewatch_mock_user', sessionData.user.id);
        } else {
          // MODO REAL: Consultar a Supabase
          const { data, error } = await dbClient.auth.signInWithPassword({
            email: email,
            password: pwd
          });
          sessionData = data;
          sessionError = error;
        }
        
        if (sessionError) throw sessionError;
        
        // Determinar redirección
        let rol = 'paciente';
        if (isDemoLogin) {
           rol = isAdminEmail ? 'superadmin' : 'paciente';
        } else {
           // Si no es demo, consultar rol real en base de datos
           const { data: profileData } = await dbClient.from('users').select('rol').eq('id', sessionData.user.id).single();
           if (profileData) rol = profileData.rol;
        }
        
        if (rol === 'superadmin') {
          window.location.href = 'admin.html';
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
  const mockUser = localStorage.getItem('safewatch_mock_user');

  if (!session && !mockUser) {
    if (!currentPath.includes('index.html')) window.location.href = 'index.html';
  } else if (mockUser && !session) {
    // Estamos en modo demo, simular datos de perfil
    if (document.getElementById('adminName')) document.getElementById('adminName').innerText = "Admin Demo";
    if (document.getElementById('patientName')) document.getElementById('patientName').innerText = "Paciente Demo";
  } else if (session) {
    // Session activa, mostrar nombre
    const { data: profileData } = await dbClient.from('users').select('nombres_apellidos').eq('id', session.user.id).single();
    if(profileData) {
      if(document.getElementById('adminName')) document.getElementById('adminName').innerText = profileData.nombres_apellidos;
      if(document.getElementById('patientName')) document.getElementById('patientName').innerText = "Paciente: " + profileData.nombres_apellidos;
    }
  }
}

async function logout() {
  localStorage.removeItem('safewatch_mock_user');
  await dbClient.auth.signOut();
  window.location.href = 'index.html';
}

function createMockSupabase() {
  return {
    auth: {
      signInWithPassword: async ({email, password}) => {
        let userId = 'patient-mock-id';
        if (email === 'Super-Admin@safewatch.com' && password === 'S@fewatcH2026') {
          userId = 'superadmin-mock-id';
        } else if (email.toLowerCase() === 'sanchezpc07@gmail.com') {
          userId = 'mock-david-plata-id';
        } else if (password !== '123456') {
          return { data: null, error: new Error("Invalid credentials") };
        }
        
        localStorage.setItem('safewatch_mock_user', userId);
        return { data: { user: { id: userId } }, error: null };
      },
      getSession: async () => {
        const userId = localStorage.getItem('safewatch_mock_user');
        if (!userId) return { data: { session: null } };
        return { data: { session: { user: { id: userId } } } };
      },
      signOut: async () => {
        localStorage.removeItem('safewatch_mock_user');
      }
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

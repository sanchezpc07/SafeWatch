-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tabla de Usuarios (Perfil extendido)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  rol TEXT CHECK (rol IN ('paciente', 'acudiente', 'responsable', 'superadmin')) NOT NULL,
  nombres_apellidos TEXT NOT NULL,
  parentesco TEXT,
  paciente_id UUID REFERENCES public.users(id),
  tipo_usuario TEXT CHECK (tipo_usuario IN ('demo', 'concretado')) DEFAULT 'demo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Tabla Estado de los Pacientes
CREATE TABLE public.pacientes_estado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  estado_actual TEXT CHECK (estado_actual IN ('normal', 'posible_caida', 'alerta')) NOT NULL DEFAULT 'normal',
  ultima_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Tabla Eventos (Incidentes / Alertas)
CREATE TABLE public.eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  incidente TEXT CHECK (incidente IN ('caida_detectada', 'alerta_enviada')) NOT NULL,
  fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  respuesta_recibida TEXT,
  transcripcion_voz TEXT,
  clase_detectada TEXT,
  confianza_modelo NUMERIC(5,2),
  atendido BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Tabla Contactos de Emergencia
CREATE TABLE public.contactos_emergencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  email TEXT,
  parentesco TEXT
);

-- Desactiva RLS para el MVP de prueba.
-- IMPORTANTE: Para producción, se deben activar politicas (Enable RLS) y limitar los roles.
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes_estado DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contactos_emergencia DISABLE ROW LEVEL SECURITY;

-- Vistas para el Dashboard de SuperAdmin
-- CREATE OR REPLACE VIEW public.admin_user_summary AS
-- SELECT rol, tipo_usuario, count(*) as total FROM public.users GROUP BY rol, tipo_usuario;

-- CREATE OR REPLACE VIEW public.admin_incidents_view AS
-- SELECT e.id, u.nombres_apellidos as paciente, u.tipo_usuario, e.incidente, e.fecha_hora, e.respuesta_recibida, e.transcripcion_voz, e.clase_detectada as deteccion_ia, e.confianza_modelo as confianza, e.atendido
-- FROM public.eventos e JOIN public.users u ON e.paciente_id = u.id ORDER BY e.fecha_hora DESC;

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

-- Insertar SuperAdmin Local (Simulado - Para supabase de verdad hay que crearlo vía auth primero)
-- El password será asignado desde la app o Dashboard de supabase.
-- Email admin de prueba: Sanchezpc07@gmail.com
-- Contraseña prueba (para dashboard): S@fewatcH

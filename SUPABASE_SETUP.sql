-- Supabase (Postgres) setup for horasocial-pro recovery requests.
-- How to apply: Supabase Dashboard > SQL Editor > paste this file > Run.
-- Safe to run multiple times (IF NOT EXISTS, no destructive statements).
-- Tables are read/written with the anon key; adjust RLS/policies per your needs.

create table if not exists solicitudes_recuperacion (
    id bigint generated always as identity primary key,
    usuario text not null,
    nombre_completo text not null,
    telefono text not null,
    curso text not null,
    fecha_solicitud timestamptz not null default now(),
    estado text not null default 'Pendiente'
);

create table if not exists solicitudes_recuperacion_maestros (
    id bigint generated always as identity primary key,
    usuario text not null,
    nombre_completo text not null,
    telefono text not null,
    asignatura text not null,
    fecha_solicitud timestamptz not null default now(),
    estado text not null default 'Pendiente'
);

create table if not exists solicitudes_recuperacion_administradores (
    id bigint generated always as identity primary key,
    usuario text not null,
    nombre_completo text not null,
    telefono text not null,
    correo text not null,
    fecha_solicitud timestamptz not null default now(),
    estado text not null default 'Pendiente'
);

-- NOTE: the legacy MySQL `usuarios_a` password-reset update was intentionally
-- dropped. Password management stays out of the anon-key scope (no Auth admin,
-- no service_role). These tables only track the recovery request state.

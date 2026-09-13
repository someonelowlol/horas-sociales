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

-- User accounts, one table for every role (simplest consistent choice: a single
-- SELECT/INSERT path instead of three mirrored tables, unique per (rol, usuario)
-- so the same username can exist once per role).
-- How to apply: Supabase Dashboard > SQL Editor > paste this file > Run.
-- The app never runs this DDL itself (no remote execution from code).
create table if not exists usuarios (
    id bigint generated always as identity primary key,
    rol text not null check (rol in ('estudiante', 'maestro', 'administrador')),
    usuario text not null,
    nombre_completo text not null,
    password_hash text not null,
    fecha_registro timestamptz not null default now(),
    unique (rol, usuario)
);

-- Minimal RLS for anon-key scope (documented, opt-in):
-- the app checks existence with SELECT by (rol, usuario) and creates accounts
-- with INSERT, so anon needs exactly those two grants. No UPDATE/DELETE for
-- anon: password changes stay out of scope on purpose (same reason as above).
-- Only hashes are stored (bcrypt via bcryptjs); never plaintext.
-- Harden later with Supabase Auth + service_role writes if needed.
-- alter table usuarios enable row level security;
-- drop policy if exists usuarios_anon_select on usuarios;
-- create policy usuarios_anon_select on usuarios for select to anon
--     using (true);
-- drop policy if exists usuarios_anon_insert on usuarios;
-- create policy usuarios_anon_insert on usuarios for insert to anon
--     with check (rol in ('estudiante', 'maestro', 'administrador'));

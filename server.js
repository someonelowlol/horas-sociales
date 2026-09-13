try {
    require('dotenv').config();
} catch (err) {
    // dotenv is optional; Vercel injects env vars directly.
}

const express = require('express');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Single source of truth for every static file served by this app.
// Locally (and on Vercel) the screens sit next to this file, so the root is
// __dirname. Inside a Netlify Function the bundled code runs from
// /var/task/netlify/functions, two levels below the deployed repo root, so
// the root climbs back up to /var/task. Every express.static and
// res.sendFile below resolves against STATIC_ROOT — never __dirname directly.
const STATIC_ROOT = (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME)
    ? path.join(__dirname, '..', '..')
    : __dirname;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Never let the browser serve stale HTML from cache (pages change on every deploy).
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

app.use(express.static(path.join(STATIC_ROOT), { index: false }));
app.use('/stitch', express.static(path.join(STATIC_ROOT, 'stitch_horasocial_pro_landing_page')));

// Supabase client. Local JSON files are used only when env vars are missing.
// Never log or expose key values.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let supabase = null;
if (supabaseConfigured) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client configured.');
} else {
    console.log('Supabase not configured, using local mode');
}

const SOLICITUDES_FILE = path.join(STATIC_ROOT, 'solicitudes_recuperacion.json');

function getLocalRequests() {
    try {
        if (fs.existsSync(SOLICITUDES_FILE)) {
            const data = fs.readFileSync(SOLICITUDES_FILE, 'utf8');
            return JSON.parse(data || '[]');
        }
    } catch (err) {
        console.error('Error reading local file:', err.message);
    }
    return [];
}

function saveLocalRequests(requests) {
    try {
        fs.writeFileSync(SOLICITUDES_FILE, JSON.stringify(requests, null, 2), 'utf8');
    } catch (err) {
        console.error('Error writing local file:', err.message);
    }
}

const SOLICITUDES_MAESTROS_FILE = path.join(STATIC_ROOT, 'solicitudes_recuperacion_maestros.json');

function getLocalMaestroRequests() {
    try {
        if (fs.existsSync(SOLICITUDES_MAESTROS_FILE)) {
            const data = fs.readFileSync(SOLICITUDES_MAESTROS_FILE, 'utf8');
            return JSON.parse(data || '[]');
        }
    } catch (err) {
        console.error('Error reading local teacher file:', err.message);
    }
    return [];
}

function saveLocalMaestroRequests(requests) {
    try {
        fs.writeFileSync(SOLICITUDES_MAESTROS_FILE, JSON.stringify(requests, null, 2), 'utf8');
    } catch (err) {
        console.error('Error writing local teacher file:', err.message);
    }
}

const SOLICITUDES_ADMINISTRADORES_FILE = path.join(STATIC_ROOT, 'solicitudes_recuperacion_administradores.json');

function getLocalAdminRequests() {
    try {
        if (fs.existsSync(SOLICITUDES_ADMINISTRADORES_FILE)) {
            const data = fs.readFileSync(SOLICITUDES_ADMINISTRADORES_FILE, 'utf8');
            return JSON.parse(data || '[]');
        }
    } catch (err) {
        console.error('Error reading local admin file:', err.message);
    }
    return [];
}

function saveLocalAdminRequests(requests) {
    try {
        fs.writeFileSync(SOLICITUDES_ADMINISTRADORES_FILE, JSON.stringify(requests, null, 2), 'utf8');
    } catch (err) {
        console.error('Error writing local admin file:', err.message);
    }
}

// Local user store (local mode only, mirrors the recovery-request pattern).
// Runtime file, never committed. Supabase is the source of truth when env is set.
const USUARIOS_FILE = path.join(STATIC_ROOT, 'usuarios.json');

function normalizeUsuario(value) {
    return String(value || '').trim().toLowerCase();
}

function getLocalUsers() {
    try {
        if (fs.existsSync(USUARIOS_FILE)) {
            const data = fs.readFileSync(USUARIOS_FILE, 'utf8');
            return JSON.parse(data || '[]');
        }
    } catch (err) {
        console.error('Error reading local users file:', err.message);
    }
    return [];
}

function saveLocalUsers(users) {
    try {
        fs.writeFileSync(USUARIOS_FILE, JSON.stringify(users, null, 2), 'utf8');
    } catch (err) {
        console.error('Error writing local users file:', err.message);
    }
}

// User accounts: one `usuarios` table for every role (see SUPABASE_SETUP.sql).
// Signup checks the database first: existing (rol, usuario) -> 409
// "usuario ya registrado", otherwise hashes with bcrypt and inserts -> 201.
// Login validates the hash: bad credentials -> 401, ok -> redirect keeping
// the ?new=1/?demo=1 flags via loginSuffix. Without Supabase env (local mode)
// both keep the previous behavior (no validation, plain redirect).
const SIGNUP_DASHBOARD = {
    estudiante: '/estudiante/dashboard',
    maestro: '/maestro/dashboard',
    administrador: '/admin/dashboard',
};

function validateSignup(body) {
    const usuario = normalizeUsuario(body.usuario || body.username);
    const nombre = String(body.nombre || body.nombre_completo || '').trim();
    const password = String(body.password || '');
    if (!usuario || !nombre || !password) {
        return { error: 'Todos los campos son obligatorios' };
    }
    if (password.length < 6) {
        return { error: 'La contraseña debe tener al menos 6 caracteres' };
    }
    return { usuario, nombre, password };
}

function sendSignupSuccess(req, res, redirect) {
    // fetch clients (signup pages) get the JSON contract; classic form posts
    // asking for HTML keep the POST->redirect navigation instead.
    const accept = String(req.headers.accept || '');
    if (accept.includes('text/html') && !accept.includes('application/json')) {
        return res.redirect(302, redirect);
    }
    return res.status(201).json({ success: true, message: 'Cuenta creada', redirect });
}

async function handleSignup(rol, req, res) {
    const valid = validateSignup(req.body || {});
    if (valid.error) return res.status(400).json({ error: valid.error });
    const { usuario, nombre, password } = valid;
    const redirect = SIGNUP_DASHBOARD[rol] + '?new=1';

    const saveToLocal = async () => {
        const users = getLocalUsers();
        if (users.some((u) => u.rol === rol && normalizeUsuario(u.usuario) === usuario)) {
            return res.status(409).json({ error: 'usuario ya registrado' });
        }
        const password_hash = await bcrypt.hash(password, 10);
        const newUser = {
            id: Date.now(),
            rol,
            usuario,
            nombre_completo: nombre,
            password_hash,
            fecha_registro: new Date().toISOString(),
        };
        users.push(newUser);
        saveLocalUsers(users);
        return sendSignupSuccess(req, res, redirect);
    };

    if (supabaseConfigured && supabase) {
        try {
            const { data: existing, error: selectError } = await supabase
                .from('usuarios')
                .select('id')
                .eq('rol', rol)
                .eq('usuario', usuario)
                .limit(1);
            if (selectError) throw selectError;
            if (existing && existing.length > 0) {
                return res.status(409).json({ error: 'usuario ya registrado' });
            }
            const password_hash = await bcrypt.hash(password, 10);
            const { error: insertError } = await supabase
                .from('usuarios')
                .insert([{ rol, usuario, nombre_completo: nombre, password_hash }]);
            if (insertError) throw insertError;
            return sendSignupSuccess(req, res, redirect);
        } catch (err) {
            // Table missing (SQL not applied yet) or connectivity issue:
            // fall back to the local store instead of bricking signup.
            console.error('Supabase signup failed, falling back to local:', err.message);
            return saveToLocal();
        }
    }
    return saveToLocal();
}

app.post('/api/signup-estudiante', (req, res) => handleSignup('estudiante', req, res));
app.post('/api/signup-maestro', (req, res) => handleSignup('maestro', req, res));
app.post('/api/signup-administrador', (req, res) => handleSignup('administrador', req, res));

async function handleLogin(rol, req, res, dashboardPath) {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }
    // Local mode (no env): previous behavior — redirect without validation.
    if (!supabaseConfigured || !supabase) {
        return res.redirect(302, dashboardPath + loginSuffix(req));
    }
    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('password_hash')
            .eq('rol', rol)
            .eq('usuario', normalizeUsuario(username))
            .limit(1);
        if (error) throw error;
        const row = data && data[0];
        const ok = row && await bcrypt.compare(String(password), row.password_hash);
        if (!ok) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        return res.redirect(302, dashboardPath + loginSuffix(req));
    } catch (err) {
        // Table missing or DB unreachable: keep the previous redirect behavior
        // so logins keep working before the new SQL is applied.
        console.error('Supabase login check failed, falling back to redirect:', err.message);
        return res.redirect(302, dashboardPath + loginSuffix(req));
    }
}

// Lightweight connectivity check. Uses a real GET with limit 1 (not HEAD):
// a HEAD count can mask a missing table, while GET surfaces PGRST205.
app.get('/api/test-db', async (req, res) => {
    if (!supabaseConfigured || !supabase) {
        return res.status(503).json({ error: 'Supabase not configured' });
    }
    try {
        const { data, error } = await supabase
            .from('solicitudes_recuperacion')
            .select('id')
            .limit(1);
        if (error) throw error;
        res.json({ message: 'Supabase OK', rows: data.length });
    } catch (err) {
        console.error('Supabase check failed:', err.message);
        res.status(500).json({ error: 'Database check failed' });
    }
});

app.post('/api/recuperar-contrasena', async (req, res) => {
    const { usuario, nombre, telefono, curso } = req.body;
    if (!usuario || !nombre || !telefono || !curso) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    const saveRequestToLocal = () => {
        const requests = getLocalRequests();
        const newRequest = {
            id: Date.now(),
            usuario,
            nombre_completo: nombre,
            telefono,
            curso,
            fecha_solicitud: new Date().toISOString(),
            estado: 'Pendiente'
        };
        requests.push(newRequest);
        saveLocalRequests(requests);
        res.json({ success: true, message: 'Solicitud enviada (Modo local)', id: newRequest.id });
    };

    if (supabaseConfigured && supabase) {
        try {
            const { data, error } = await supabase
                .from('solicitudes_recuperacion')
                .insert([{ usuario, nombre_completo: nombre, telefono, curso, estado: 'Pendiente' }])
                .select('id')
                .single();
            if (error) throw error;
            return res.json({ success: true, message: 'Solicitud enviada', id: data.id });
        } catch (err) {
            console.error('Supabase insert failed, falling back to local:', err.message);
            return saveRequestToLocal();
        }
    }
    return saveRequestToLocal();
});

app.get('/api/solicitudes-recuperacion', async (req, res) => {
    if (supabaseConfigured && supabase) {
        try {
            const { data, error } = await supabase
                .from('solicitudes_recuperacion')
                .select('*')
                .eq('estado', 'Pendiente')
                .order('fecha_solicitud', { ascending: false });
            if (error) throw error;
            return res.json(data);
        } catch (err) {
            console.error('Supabase select failed, falling back to local:', err.message);
            return res.json(getLocalRequests().filter(r => r.estado === 'Pendiente'));
        }
    }
    return res.json(getLocalRequests().filter(r => r.estado === 'Pendiente'));
});

app.post('/api/autorizar-solicitud', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    const updateRequestLocal = () => {
        const requests = getLocalRequests();
        const index = requests.findIndex(r => r.id === parseInt(id) || r.id === id);
        if (index !== -1) {
            requests[index].estado = 'Autorizado';
            saveLocalRequests(requests);
            res.json({ success: true, message: 'Autorizado (local). Contraseña: 123456' });
        } else {
            res.status(404).json({ error: 'Solicitud no encontrada' });
        }
    };

    if (supabaseConfigured && supabase) {
        // NOTE: password reset against usuarios_a / Auth is intentionally out of
        // scope here; the anon key must never manage credentials. We only flip
        // the recovery request state.
        try {
            const { data, error } = await supabase
                .from('solicitudes_recuperacion')
                .update({ estado: 'Autorizado' })
                .eq('id', id)
                .select('id');
            if (error) throw error;
            if (!data || data.length === 0) return updateRequestLocal();
            return res.json({ success: true, message: 'Autorizado. Contraseña: 123456' });
        } catch (err) {
            console.error('Supabase update failed, falling back to local:', err.message);
            return updateRequestLocal();
        }
    }
    return updateRequestLocal();
});

app.post('/api/rechazar-solicitud', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    const deleteRequestLocal = () => {
        let requests = getLocalRequests();
        requests = requests.filter(r => r.id !== parseInt(id) && r.id !== id);
        saveLocalRequests(requests);
        res.json({ success: true, message: 'Solicitud ignorada' });
    };

    if (supabaseConfigured && supabase) {
        try {
            const { error } = await supabase
                .from('solicitudes_recuperacion')
                .delete()
                .eq('id', id);
            if (error) throw error;
            return res.json({ success: true, message: 'Solicitud ignorada' });
        } catch (err) {
            console.error('Supabase delete failed, falling back to local:', err.message);
            return deleteRequestLocal();
        }
    }
    return deleteRequestLocal();
});

app.post('/api/recuperar-contrasena-maestro', async (req, res) => {
    const { usuario, nombre, telefono, asignatura } = req.body;
    if (!usuario || !nombre || !telefono || !asignatura) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    const saveRequestToLocal = () => {
        const requests = getLocalMaestroRequests();
        const newRequest = {
            id: Date.now(),
            usuario,
            nombre_completo: nombre,
            telefono,
            asignatura,
            fecha_solicitud: new Date().toISOString(),
            estado: 'Pendiente'
        };
        requests.push(newRequest);
        saveLocalMaestroRequests(requests);
        res.json({ success: true, message: 'Solicitud enviada (Modo local)', id: newRequest.id });
    };

    if (supabaseConfigured && supabase) {
        try {
            const { data, error } = await supabase
                .from('solicitudes_recuperacion_maestros')
                .insert([{ usuario, nombre_completo: nombre, telefono, asignatura, estado: 'Pendiente' }])
                .select('id')
                .single();
            if (error) throw error;
            return res.json({ success: true, message: 'Solicitud enviada', id: data.id });
        } catch (err) {
            console.error('Supabase insert failed, falling back to local:', err.message);
            return saveRequestToLocal();
        }
    }
    return saveRequestToLocal();
});

app.get('/api/solicitudes-recuperacion-maestros', async (req, res) => {
    if (supabaseConfigured && supabase) {
        try {
            const { data, error } = await supabase
                .from('solicitudes_recuperacion_maestros')
                .select('*')
                .eq('estado', 'Pendiente')
                .order('fecha_solicitud', { ascending: false });
            if (error) throw error;
            return res.json(data);
        } catch (err) {
            console.error('Supabase select failed, falling back to local:', err.message);
            return res.json(getLocalMaestroRequests().filter(r => r.estado === 'Pendiente'));
        }
    }
    return res.json(getLocalMaestroRequests().filter(r => r.estado === 'Pendiente'));
});

app.post('/api/autorizar-solicitud-maestro', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    const updateRequestLocal = () => {
        const requests = getLocalMaestroRequests();
        const index = requests.findIndex(r => r.id === parseInt(id) || r.id === id);
        if (index !== -1) {
            requests[index].estado = 'Autorizado';
            saveLocalMaestroRequests(requests);
            res.json({ success: true, message: 'Autorizado (local). Contraseña: 123456' });
        } else {
            res.status(404).json({ error: 'Solicitud no encontrada' });
        }
    };

    if (supabaseConfigured && supabase) {
        // NOTE: same as students — no credential management with the anon key.
        try {
            const { data, error } = await supabase
                .from('solicitudes_recuperacion_maestros')
                .update({ estado: 'Autorizado' })
                .eq('id', id)
                .select('id');
            if (error) throw error;
            if (!data || data.length === 0) return updateRequestLocal();
            return res.json({ success: true, message: 'Autorizado. Contraseña: 123456' });
        } catch (err) {
            console.error('Supabase update failed, falling back to local:', err.message);
            return updateRequestLocal();
        }
    }
    return updateRequestLocal();
});

app.post('/api/rechazar-solicitud-maestro', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    const deleteRequestLocal = () => {
        let requests = getLocalMaestroRequests();
        requests = requests.filter(r => r.id !== parseInt(id) && r.id !== id);
        saveLocalMaestroRequests(requests);
        res.json({ success: true, message: 'Solicitud ignorada' });
    };

    if (supabaseConfigured && supabase) {
        try {
            const { error } = await supabase
                .from('solicitudes_recuperacion_maestros')
                .delete()
                .eq('id', id);
            if (error) throw error;
            return res.json({ success: true, message: 'Solicitud ignorada' });
        } catch (err) {
            console.error('Supabase delete failed, falling back to local:', err.message);
            return deleteRequestLocal();
        }
    }
    return deleteRequestLocal();
});

app.post('/api/recuperar-contrasena-administrador', async (req, res) => {
    const { usuario, nombre, correo, telefono } = req.body;
    if (!usuario || !nombre || !correo || !telefono) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    const saveRequestToLocal = () => {
        const requests = getLocalAdminRequests();
        const newRequest = {
            id: Date.now(),
            usuario,
            nombre_completo: nombre,
            correo,
            telefono,
            fecha_solicitud: new Date().toISOString(),
            estado: 'Pendiente'
        };
        requests.push(newRequest);
        saveLocalAdminRequests(requests);
        res.json({ success: true, message: 'Solicitud enviada (Modo local)', id: newRequest.id });
    };

    if (supabaseConfigured && supabase) {
        try {
            const { data, error } = await supabase
                .from('solicitudes_recuperacion_administradores')
                .insert([{ usuario, nombre_completo: nombre, correo, telefono, estado: 'Pendiente' }])
                .select('id')
                .single();
            if (error) throw error;
            return res.json({ success: true, message: 'Solicitud enviada', id: data.id });
        } catch (err) {
            console.error('Supabase insert failed, falling back to local:', err.message);
            return saveRequestToLocal();
        }
    }
    return saveRequestToLocal();
});

app.get('/api/solicitudes-recuperacion-administradores', async (req, res) => {
    if (supabaseConfigured && supabase) {
        try {
            const { data, error } = await supabase
                .from('solicitudes_recuperacion_administradores')
                .select('*')
                .eq('estado', 'Pendiente')
                .order('fecha_solicitud', { ascending: false });
            if (error) throw error;
            return res.json(data);
        } catch (err) {
            console.error('Supabase select failed, falling back to local:', err.message);
            return res.json(getLocalAdminRequests().filter(r => r.estado === 'Pendiente'));
        }
    }
    return res.json(getLocalAdminRequests().filter(r => r.estado === 'Pendiente'));
});

app.post('/api/autorizar-solicitud-administrador', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    const updateRequestLocal = () => {
        const requests = getLocalAdminRequests();
        const index = requests.findIndex(r => r.id === parseInt(id) || r.id === id);
        if (index !== -1) {
            requests[index].estado = 'Autorizado';
            saveLocalAdminRequests(requests);
            res.json({ success: true, message: 'Autorizado (local). Contraseña: 123456' });
        } else {
            res.status(404).json({ error: 'Solicitud no encontrada' });
        }
    };

    if (supabaseConfigured && supabase) {
        try {
            const { data, error } = await supabase
                .from('solicitudes_recuperacion_administradores')
                .update({ estado: 'Autorizado' })
                .eq('id', id)
                .select('id');
            if (error) throw error;
            if (!data || data.length === 0) return updateRequestLocal();
            return res.json({ success: true, message: 'Autorizado. Contraseña: 123456' });
        } catch (err) {
            console.error('Supabase update failed, falling back to local:', err.message);
            return updateRequestLocal();
        }
    }
    return updateRequestLocal();
});

app.post('/api/rechazar-solicitud-administrador', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    const deleteRequestLocal = () => {
        const requests = getLocalAdminRequests();
        const index = requests.findIndex(r => r.id === parseInt(id) || r.id === id);
        if (index !== -1) {
            requests.splice(index, 1);
            saveLocalAdminRequests(requests);
            res.json({ success: true, message: 'Solicitud ignorada' });
        } else {
            res.status(404).json({ error: 'Solicitud no encontrada' });
        }
    };

    if (supabaseConfigured && supabase) {
        try {
            const { error } = await supabase
                .from('solicitudes_recuperacion_administradores')
                .delete()
                .eq('id', id);
            if (error) throw error;
            return res.json({ success: true, message: 'Solicitud ignorada' });
        } catch (err) {
            console.error('Supabase delete failed, falling back to local:', err.message);
            return deleteRequestLocal();
        }
    }
    return deleteRequestLocal();
});

// Student login entry: validates that the user completed the form and
// takes them to the dashboard. Real POST->redirect navigation lets the
// browser offer to save the password. A ?new=1 / ?demo=1 query (set by the
// login page on first signup) is preserved so the dashboard can render the
// fresh-user state instead of sample data.
function loginSuffix(req) {
    if (req.query && req.query.new === '1') return '?new=1';
    if (req.query && req.query.demo === '1') return '?demo=1';
    if (req.body && (req.body.new_user === '1' || req.body.new_user === 1)) return '?new=1';
    return '';
}

app.post('/api/login-estudiante', (req, res) => handleLogin('estudiante', req, res, '/estudiante/dashboard'));

// Teacher login: same as the student one, POST->redirect navigation lets
// the browser offer to save the password.
app.post('/api/login-maestro', (req, res) => handleLogin('maestro', req, res, '/maestro/dashboard'));

app.post('/api/login-administrador', (req, res) => handleLogin('administrador', req, res, '/admin/dashboard'));

// ==========================================
// PAGE ROUTES (single source of truth — keep every page route in this table only)
// ==========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'bienvenido_a_horasocial_pro_1', 'code.html'));
});

// Public demo: same student dashboard shell, client script renders the
// fresh-user state when it sees ?demo=1 (see new-user.js).
app.get('/demo', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'dashboard_estudiante_horasocial_pro', 'index.html'));
});

app.get('/seleccion-rol', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'selecci_n_de_rol_distribuci_n_expandida_vertical', 'code.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'stitch_horasocial_pro_landing_page', 'login_estudiante_distribuci_n_centrada_y_logo_optimizado_2', 'code.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'signup_estudiante_horasocial_pro', 'index.html'));
});

app.get('/profesor/signup', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'signup_maestro_horasocial_pro', 'index.html'));
});

app.get('/admin/signup', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'signup_administrador_horasocial_pro', 'index.html'));
});

app.get('/recuperar-contrasena', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'stitch_horasocial_pro_landing_page', 'recuperar_contrasena_estudiante', 'code.html'));
});

app.get('/profesor/login', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'login_maestro_horasocial_pro', 'index.html'));
});

app.get('/profesor/recuperar-contrasena', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'recuperar_contrasena_maestro_horasocial_pro', 'index.html'));
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'login_administrador_horasocial_pro', 'index.html'));
});

app.get('/admin/recuperar-contrasena', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'recuperar_contrasena_administrador_horasocial_pro', 'index.html'));
});

// Legacy admin login alias (kept for bookmarks and existing links).
app.get('/login_administrador', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'login_administrador_horasocial_pro', 'index.html'));
});

app.get('/sobre', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'stitch_horasocial_pro_landing_page', 'sobre_horasocial_pro_identidad_y_prop_sito', 'code.html'));
});

app.get('/estudiante/dashboard', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'dashboard_estudiante_horasocial_pro', 'index.html'));
});

app.get('/estudiante/agenda', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'agenda_estudiante_horasocial_pro', 'index.html'));
});

app.get('/estudiante/registro', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'registro_estudiante_horasocial_pro', 'index.html'));
});

app.get('/estudiante/mensajes', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'mensajes_estudiante_horasocial_pro', 'index.html'));
});

app.get('/estudiante/chat', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'chat_maestro_estudiante_horasocial_pro', 'index.html'));
});

app.get('/maestro/dashboard', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'dashboard_maestro_horasocial_pro', 'index.html'));
});

app.get('/maestro/estudiantes', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'gestion_estudiantes_maestro_horasocial_pro', 'index.html'));
});

app.get('/maestro/tecnico', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'gestion_tecnica_maestro_horasocial_pro', 'index.html'));
});

app.get('/maestro/chat', (req, res) => {
  res.sendFile(path.join(STATIC_ROOT, 'chat_maestro_horasocial_pro', 'index.html'));
});

app.get('/maestro/mensajes', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'mensajes_maestro_horasocial_pro', 'index.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'dashboard_administrador_horasocial_pro', 'index.html'));
});

app.get('/admin/docentes', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'stitch_horasocial_pro_landing_page', 'coordinaci_n_y_ajuste_de_docentes_admin', 'code.html'));
});

app.get('/admin/alertas', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'stitch_horasocial_pro_landing_page', 'control_de_estudiantes_y_alertas_admin_versi_n_corregida', 'code.html'));
});

// Admin messages screen (Stitch _2 layout).
app.get('/admin/mensajes', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'stitch_horasocial_pro_landing_page', 'mensajer_a_y_canales_admin_horasocial_pro_2', 'code.html'));
});

// Only listen on long-lived hosts. Serverless platforms (Vercel, Netlify
// Functions, AWS Lambda) import the app and expose it via a handler instead.
if (!process.env.VERCEL && !process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;

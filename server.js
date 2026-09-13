try {
    require('dotenv').config();
} catch (err) {
    // dotenv is optional; Vercel injects env vars directly.
}

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

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

app.use(express.static(path.join(__dirname), { index: false }));
app.use('/stitch', express.static(path.join(__dirname, 'stitch_horasocial_pro_landing_page')));

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

const SOLICITUDES_FILE = path.join(__dirname, 'solicitudes_recuperacion.json');

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

const SOLICITUDES_MAESTROS_FILE = path.join(__dirname, 'solicitudes_recuperacion_maestros.json');

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

const SOLICITUDES_ADMINISTRADORES_FILE = path.join(__dirname, 'solicitudes_recuperacion_administradores.json');

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
// browser offer to save the password.
app.post('/api/login-estudiante', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }
    res.redirect(302, '/estudiante/dashboard');
});

// Teacher login: same as the student one, POST->redirect navigation lets
// the browser offer to save the password.
app.post('/api/login-maestro', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }
    res.redirect(302, '/maestro/dashboard');
});

app.post('/api/login-administrador', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }
    res.redirect(302, '/admin/dashboard');
});

// ==========================================
// PAGE ROUTES (single source of truth — keep every page route in this table only)
// ==========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'bienvenido_a_horasocial_pro_1', 'code.html'));
});

app.get('/seleccion-rol', (req, res) => {
    res.sendFile(path.join(__dirname, 'selecci_n_de_rol_distribuci_n_expandida_vertical', 'code.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'login_estudiante_distribuci_n_centrada_y_logo_optimizado_2', 'code.html'));
});

app.get('/recuperar-contrasena', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'recuperar_contrasena_estudiante', 'code.html'));
});

app.get('/profesor/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login_maestro_horasocial_pro', 'index.html'));
});

app.get('/profesor/recuperar-contrasena', (req, res) => {
    res.sendFile(path.join(__dirname, 'recuperar_contrasena_maestro_horasocial_pro', 'index.html'));
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login_administrador_horasocial_pro', 'index.html'));
});

app.get('/admin/recuperar-contrasena', (req, res) => {
    res.sendFile(path.join(__dirname, 'recuperar_contrasena_administrador_horasocial_pro', 'index.html'));
});

// Legacy admin login alias (kept for bookmarks and existing links).
app.get('/login_administrador', (req, res) => {
    res.sendFile(path.join(__dirname, 'login_administrador_horasocial_pro', 'index.html'));
});

app.get('/sobre', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'sobre_horasocial_pro_identidad_y_prop_sito', 'code.html'));
});

app.get('/estudiante/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard_estudiante_horasocial_pro', 'index.html'));
});

app.get('/estudiante/agenda', (req, res) => {
    res.sendFile(path.join(__dirname, 'agenda_estudiante_horasocial_pro', 'index.html'));
});

app.get('/estudiante/registro', (req, res) => {
    res.sendFile(path.join(__dirname, 'registro_estudiante_horasocial_pro', 'index.html'));
});

app.get('/estudiante/mensajes', (req, res) => {
    res.sendFile(path.join(__dirname, 'mensajes_estudiante_horasocial_pro', 'index.html'));
});

app.get('/estudiante/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat_maestro_estudiante_horasocial_pro', 'index.html'));
});

app.get('/maestro/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard_maestro_horasocial_pro', 'index.html'));
});

app.get('/maestro/estudiantes', (req, res) => {
    res.sendFile(path.join(__dirname, 'gestion_estudiantes_maestro_horasocial_pro', 'index.html'));
});

app.get('/maestro/tecnico', (req, res) => {
    res.sendFile(path.join(__dirname, 'gestion_tecnica_maestro_horasocial_pro', 'index.html'));
});

app.get('/maestro/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'chat_maestro_horasocial_pro', 'index.html'));
});

app.get('/maestro/mensajes', (req, res) => {
    res.sendFile(path.join(__dirname, 'mensajes_maestro_horasocial_pro', 'index.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard_administrador_horasocial_pro', 'index.html'));
});

app.get('/admin/docentes', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'coordinaci_n_y_ajuste_de_docentes_admin', 'code.html'));
});

app.get('/admin/alertas', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'control_de_estudiantes_y_alertas_admin_versi_n_corregida', 'code.html'));
});

// Admin messages screen (Stitch _2 layout).
app.get('/admin/mensajes', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'mensajer_a_y_canales_admin_horasocial_pro_2', 'code.html'));
});

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;

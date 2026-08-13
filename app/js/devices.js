// ============ GERENCIAMENTO DE DISPOSITIVOS ============

// Função para obter ID único do dispositivo
function getDeviceId() {
    var deviceId = localStorage.getItem('kayla_device_id');
    if (!deviceId) {
        deviceId = 'DEV-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        localStorage.setItem('kayla_device_id', deviceId);
    }
    return deviceId;
}

// Função para obter nome do dispositivo
function getDeviceName() {
    var userAgent = navigator.userAgent;
    var deviceName = 'Dispositivo Desconhecido';
    
    // Detectar tipo de dispositivo
    if (/Android/i.test(userAgent)) {
        deviceName = 'Android';
        if (/Mobile/i.test(userAgent)) {
            deviceName = 'Android Mobile';
        } else {
            deviceName = 'Android Tablet';
        }
    } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
        if (/iPad/i.test(userAgent)) {
            deviceName = 'iPad';
        } else if (/iPhone/i.test(userAgent)) {
            deviceName = 'iPhone';
        } else {
            deviceName = 'iPod';
        }
    } else if (/Windows/i.test(userAgent)) {
        deviceName = 'Windows';
        if (/Mobile/i.test(userAgent)) {
            deviceName = 'Windows Mobile';
        }
    } else if (/Mac/i.test(userAgent)) {
        deviceName = 'Mac';
    } else if (/Linux/i.test(userAgent)) {
        deviceName = 'Linux';
    }
    
    // Detectar navegador (Melhorado para Edge vs Chrome)
    var browser = 'Navegador';
    var browserVersion = '';
    
    if (/Edg\//i.test(userAgent)) {
        browser = 'Edge';
        var match = userAgent.match(/Edg\/(\d+)/i);
        if (match) browserVersion = ' ' + match[1];
    } else if (/Chrome/i.test(userAgent) && !/Edg\//i.test(userAgent)) {
        browser = 'Chrome';
        var match = userAgent.match(/Chrome\/(\d+)/i);
        if (match) browserVersion = ' ' + match[1];
    } else if (/Firefox/i.test(userAgent)) {
        browser = 'Firefox';
        var match = userAgent.match(/Firefox\/(\d+)/i);
        if (match) browserVersion = ' ' + match[1];
    } else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) {
        browser = 'Safari';
        var match = userAgent.match(/Version\/(\d+)/i);
        if (match) browserVersion = ' ' + match[1];
    }
    
    return deviceName + ' - ' + browser + browserVersion;
}

// Função para obter tipo de dispositivo
function getDeviceType() {
    var userAgent = navigator.userAgent;
    if (/Mobile|Android|iPhone|iPad|iPod/i.test(userAgent)) {
        return 'mobile';
    } else if (/Tablet|iPad/i.test(userAgent)) {
        return 'tablet';
    } else {
        return 'desktop';
    }
}

// ============ REGISTRO DE DISPOSITIVO ============

async function registrarDispositivo() {
    if (!currentUser || typeof chamarFuncaoSegura !== 'function') return null;
    try {
        var resultado = await chamarFuncaoSegura('gerenciar-assinatura', {
            action: 'registrar_dispositivo',
            device_id: getDeviceId(),
            device_name: getDeviceName(),
            device_type: getDeviceType()
        });
        return resultado.success ? resultado : null;
    } catch(e) {
        console.warn('[Dispositivo] Registro seguro indisponível:', e.message);
        return null;
    }
}

async function verificarLimiteDispositivos(assinaturaId) {
    if (!currentUser || !supabaseClient) return { podeAdicionar: false };
    try {
        var { data: assinatura } = await supabaseClient.from('assinaturas').select('dispositivos_max').eq('id', assinaturaId).single();
        var { count: ativos } = await supabaseClient.from('dispositivos').select('id', { count: 'exact', head: true }).eq('assinatura_id', assinaturaId).eq('ativo', true);
        return { podeAdicionar: ativos < assinatura.dispositivos_max, ativos: ativos, max: assinatura.dispositivos_max };
    } catch(e) { return { podeAdicionar: false }; }
}

async function listarDispositivos(assinaturaId) {
    if (!currentUser || !supabaseClient) return [];
    try {
        var { data } = await supabaseClient.from('dispositivos').select('*').eq('assinatura_id', assinaturaId).eq('ativo', true).order('ultimo_acesso', { ascending: false });
        return data || [];
    } catch(e) { return []; }
}

async function removerDispositivo(deviceId) {
    if (!currentUser || typeof chamarFuncaoSegura !== 'function') return false;
    try {
        var resultado = await chamarFuncaoSegura('gerenciar-assinatura', {
            action: 'remover_dispositivo',
            device_id: deviceId
        });
        localStorage.setItem('kayla_pro_devices', resultado.dispositivos_usados + '/' + resultado.dispositivos_max);
        if (typeof verificarStatusPro === 'function') await verificarStatusPro();
        return true;
    } catch(e) {
        console.warn('[Dispositivo] Não foi possível remover:', e.message);
        return false;
    }
}

// Função para listar todos os dispositivos ativos
async function listarDispositivos(assinaturaId) {
    if (!currentUser || !supabaseClient) return [];
    try {
        var { data } = await supabaseClient
            .from('dispositivos')
            .select('*')
            .eq('assinatura_id', assinaturaId)
            .eq('ativo', true)
            .order('ultimo_acesso', { ascending: false });
        return data || [];
    } catch(e) { 
        console.error('[listarDispositivos] Erro:', e);
        return []; 
    }
}

// Tornar global

window.getDeviceId = getDeviceId;
window.getDeviceName = getDeviceName;
window.getDeviceType = getDeviceType;
window.registrarDispositivo = registrarDispositivo;
window.verificarLimiteDispositivos = verificarLimiteDispositivos;
window.listarDispositivos = listarDispositivos;
window.removerDispositivo = removerDispositivo;

console.log('✅ Devices.js carregado');

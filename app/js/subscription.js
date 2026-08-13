// ============ ASSINATURAS E DISPOSITIVOS ============

// Configurações de limites
window.LIMITES = {
    proAtivo: false,
    maxClientes: 3,
    maxProdutos: 10,
    maxVendas: 3,
    bloqueadoPorDispositivo: false
};

// ============ FUNÇÃO DE REGISTRO DE DISPOSITIVO ============

async function registrarDispositivoAtual() {
    if (!currentUser || !supabaseClient || !isOnline) return false;
    try {
        var resultado = await chamarFuncaoSegura('gerenciar-assinatura', {
            action: 'registrar_dispositivo',
            device_id: getDeviceId(),
            device_name: getDeviceName(),
            device_type: getDeviceType()
        });
        localStorage.setItem('kayla_pro_devices', resultado.dispositivos_usados + '/' + resultado.dispositivos_max);
        return resultado.ativo === true;
    } catch(e) {
        console.warn('[Assinatura] Não foi possível registrar o dispositivo:', e.message);
        return false;
    }
}

// ============ VERIFICAR STATUS PRO ============

async function verificarStatusPro() {
    if (!currentUser || !supabaseClient) return false;
    
    try {
        var result = await supabaseClient.from('assinaturas').select('*').eq('user_id', currentUser.id).eq('status', 'ativa').order('created_at', { ascending: false }).limit(1).maybeSingle();
        
        if (result.error || !result.data) {
            resetarStatusLocal();
            return false;
        }
        
        var assinatura = result.data;
        if (assinatura.data_fim && new Date(assinatura.data_fim) < new Date()) {
            // Expiração é processada pelo servidor; o cliente apenas remove o acesso local.
            resetarStatusLocal();
            return false;
        }

        // VERIFICAÇÃO RIGOROSA: Buscar IDs de dispositivos ativos no banco
        var { data: ativos } = await supabaseClient.from('dispositivos').select('device_id').eq('assinatura_id', assinatura.id).eq('ativo', true);
        
        var meuId = getDeviceId();
        var estouAtivo = ativos ? ativos.some(function(d) { return d.device_id === meuId; }) : false;
        var totalAtivos = ativos ? ativos.length : 0;

        // TRAVA: Se não estou na lista de ativos, SOU GRÁTIS neste dispositivo
        if (!estouAtivo) {
            LIMITES.proAtivo = false;
            localStorage.setItem('kayla_pro', 'false');
            localStorage.setItem('kayla_pro_devices', totalAtivos + '/' + assinatura.dispositivos_max);
            
            // ✅ NOVO: Mas ainda armazenar a chave para facilitar ativação posterior
            if (assinatura.key_ativacao) {
                localStorage.setItem('kayla_pro_key', assinatura.key_ativacao);
                localStorage.setItem('kayla_pro_expires', assinatura.data_fim || '');
            }
            
            atualizarBadgePlano();
            return false;
        }
        
        // Se estou ativo, PRO liberado
        LIMITES.proAtivo = true;
        localStorage.setItem('kayla_pro', 'true');
        localStorage.setItem('kayla_pro_key', assinatura.key_ativacao || '');
        localStorage.setItem('kayla_pro_expires', assinatura.data_fim || '');
        localStorage.setItem('kayla_pro_devices', totalAtivos + '/' + assinatura.dispositivos_max);
        atualizarBadgePlano();
        return true;
        
    } catch(e) { return false; }
}

function resetarStatusLocal() {
    LIMITES.proAtivo = false;
    localStorage.removeItem('kayla_pro');
    localStorage.removeItem('kayla_pro_key');
    localStorage.removeItem('kayla_pro_expires');
    localStorage.removeItem('kayla_pro_devices');
    atualizarBadgePlano();
}

function atualizarBadgePlano() {
    var badge = document.getElementById('plan-badge');
    if (!badge) return;
    badge.textContent = LIMITES.proAtivo ? 'PRO' : 'GRÁTIS';
    badge.className = LIMITES.proAtivo ? 'badge-pro' : 'badge-free';
}

function verificarLimite(tipo) {
    if (LIMITES.proAtivo) return true;
    var limite = 0;
    var atual = 0;
    switch(tipo) {
        case 'clientes': limite = LIMITES.maxClientes; atual = (window.clientes || []).length; break;
        case 'produtos': limite = LIMITES.maxProdutos; atual = (window.produtos || []).length; break;
        case 'vendas': limite = LIMITES.maxVendas; atual = (window.vendas || []).length; break;
    }
    return atual < limite;
}

async function getAssinaturaAtiva() {
    if (!currentUser || !supabaseClient) return null;
    try {
        var result = await supabaseClient.from('assinaturas').select('*').eq('user_id', currentUser.id).eq('status', 'ativa').order('created_at', { ascending: false }).limit(1).maybeSingle();
        return result.data;
    } catch(e) { return null; }
}

async function cancelarAssinatura() {
    if (!currentUser) return;
    var assinatura = await getAssinaturaAtiva();
    if (!assinatura) return;

    confirmar('🚫 CANCELAR PRO (1/2)', 'Isso desativará todos os seus dispositivos e você perderá o acesso às funções PRO imediatamente. Confirmar?', function(confirmed) {
        if (!confirmed) return;
        
        setTimeout(function() {
            confirmar('🚨 CONFIRMAÇÃO FINAL (2/2)', 'VOCÊ TEM CERTEZA? Sua assinatura será cancelada PERMANENTEMENTE e não poderá ser recuperada. Deseja continuar?', async function(finalConfirmed) {
                if (!finalConfirmed) return;
                
                try {
                    await chamarFuncaoSegura('gerenciar-assinatura', { action: 'cancelar_assinatura' });
                    
                    resetarStatusLocal();
                    if (typeof mudarAba === 'function') mudarAba('settings');
                    toast('✅ Assinatura cancelada permanentemente.', 'success');
                } catch(e) { 
                    console.error('Erro ao cancelar assinatura:', e);
                    toast('❌ Erro ao cancelar.', 'error'); 
                }
            });
        }, 500);
    });
}

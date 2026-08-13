// ============ PAGAMENTOS E ATIVAÇÃO ============

// Configurações do Mercado Pago
window.MP_CONFIG = {
    // O checkout é criado somente no servidor. Defina uma chave pública aqui
    // apenas se uma futura interface Mercado Pago Bricks realmente precisar dela.
    publicKey: '',
    webhooksUrl: SUPABASE_EDGE_URL + '/webhook-mp'
};

// Configurações de planos
window.PLANOS = {
    mensal: {
        id: 'mensal',
        nome: 'Plano Mensal',
        precoBase: 19.90,
        precoPorDevice: 5.00,
        dispositivosInclusos: 1,
        dispositivosMax: 5,
        duracaoDias: 30,
        tipo: 'mensal'
    },
    anual: {
        id: 'anual',
        nome: 'Plano Anual',
        precoBase: 199.90,
        precoPorDevice: 5.00,
        dispositivosInclusos: 1,
        dispositivosMax: 5,
        duracaoDias: 365,
        tipo: 'anual'
    }
};

// ============ VALIDAÇÃO E ATIVAÇÃO ============

async function validarKeyBackend(keyCode) {
    try {
        var response = await fetch(SUPABASE_EDGE_URL + '/validate-key', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + SUPABASE_KEY
            },
            body: JSON.stringify({
                key_code: keyCode,
                device_id: getDeviceId(),
                device_name: getDeviceName()
            })
        });
        
        var data = await response.json();
        return data;
    } catch (error) {
        console.error('Erro ao validar key:', error);
        return { valid: false, message: 'Erro de conexão' };
    }
}

async function ativarPro() {
    var inputEl = document.getElementById('pro-key') || document.getElementById('pro-key-manual');
    var chave = inputEl ? inputEl.value.trim().toUpperCase() : '';
    if (!chave || !chave.startsWith('PRO-')) {
        toast('Chave inválida', 'error');
        return;
    }
    
    var btn = window.event ? window.event.target : null;
    var texto = btn ? btn.innerText : 'Validando...';
    if (btn) {
        btn.innerText = 'Validando...';
        btn.disabled = true;
    }
    
    var resultado = await validarKeyBackend(chave);
    if (resultado.valid) {
        LIMITES.proAtivo = true;
        localStorage.setItem('kayla_pro', 'true');
        localStorage.setItem('kayla_pro_key', chave);
        localStorage.setItem('kayla_pro_expires', resultado.expires_at || '');
        localStorage.setItem('kayla_pro_devices', resultado.devices_used + '/' + resultado.max_devices);
        toast('✅ Plano PRO ativado! ' + resultado.devices_used + '/' + resultado.max_devices + ' dispositivos', 'success');
        fecharModal();
        atualizarBadgePlano();
        mudarAba('settings');
    } else {
        toast('❌ ' + resultado.message, 'error');
    }
    
    if (btn) {
        btn.innerText = texto;
        btn.disabled = false;
    }
}

// ============ FUNÇÃO AUXILIAR ============

async function getAssinaturaAtiva() {
    if (!currentUser || !supabaseClient) {
        return null;
    }
    
    try {
        var result = await supabaseClient
            .from('assinaturas')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('status', 'ativa')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (result.error) {
            console.warn('[getAssinaturaAtiva] Erro:', result.error);
            return null;
        }
        
        return result.data;
    } catch(e) {
        console.error('[getAssinaturaAtiva] Erro:', e);
        return null;
    }
}

// ============ TELA DE PLANOS ============

function mostrarPlanos() {
    var html = '<div class="modal-handle"></div>';
    html += '<div class="modal-title">🚀 Escolha seu Plano</div>';
    html += '<div class="modal-sub">Selecione o plano ideal para você</div>';
    
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:12px;cursor:pointer;border:2px solid var(--accent)" onclick="selecionarPlano(\'mensal\')">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<div style="font-weight:700;font-size:16px">📅 Mensal</div>';
    html += '<span class="badge-pro">POPULAR</span>';
    html += '</div>';
    html += '<div style="font-size:28px;font-weight:700;color:var(--accent);margin-bottom:4px">R$ 19,90<span style="font-size:14px;color:var(--text2)">/mês</span></div>';
    html += '<div style="font-size:12px;color:var(--text2);margin-bottom:12px">Cancele quando quiser</div>';
    html += '<ul style="padding-left:20px;font-size:12px;color:var(--text2);margin:0">';
    html += '<li>✅ 1 dispositivo incluso</li>';
    html += '<li>✅ Clientes ilimitados</li>';
    html += '<li>✅ Produtos ilimitados</li>';
    html += '<li>✅ Geração de PDF</li>';
    html += '<li>✅ Suporte prioritário</li>';
    html += '</ul></div>';
    
    html += '<div class="card" style="background:linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);padding:16px;margin-bottom:12px;cursor:pointer;border:2px solid var(--accent);position:relative" onclick="selecionarPlano(\'anual\')">';
    html += '<div style="position:absolute;top:-10px;right:16px;background:var(--success);color:#fff;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700">ECONOMIA 17%</div>';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<div style="font-weight:700;font-size:16px;color:#fff">🎯 Anual</div>';
    html += '<span style="background:rgba(255,255,255,0.2);color:#fff;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600">MELHOR VALOR</span>';
    html += '</div>';
    html += '<div style="font-size:28px;font-weight:700;color:#fff;margin-bottom:4px">R$ 199,90<span style="font-size:14px;opacity:0.9">/ano</span></div>';
    html += '<div style="font-size:12px;color:rgba(255,255,255,0.8);margin-bottom:12px">2 meses grátis!</div>';
    html += '<ul style="padding-left:20px;font-size:12px;color:rgba(255,255,255,0.95);margin:0">';
    html += '<li>✅ Tudo do plano mensal</li>';
    html += '<li>✅ Economia de R$ 38,90</li>';
    html += '<li>✅ Suporte VIP</li>';
    html += '</ul></div>';
    
    html += '<div class="card" style="background:var(--bg3);padding:12px;margin-bottom:12px">';
    html += '<div style="font-size:12px;color:var(--text2);text-align:center">';
    html += '💡 <strong>Dispositivos adicionais:</strong> R$ 5,00/mês cada<br>';
    html += 'Máximo de 5 dispositivos por conta';
    html += '</div></div>';
    
    html += '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button>';
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('show');
}

// Handler global
window.confirmarPlanoHandler = function(planoId, numDispositivos) {
    confirmarPlano(planoId, numDispositivos);
};

function selecionarPlano(planoId) {
    var plano = PLANOS[planoId];
    
    var html = '<div class="modal-handle"></div>';
    html += '<div class="modal-title">📱 Dispositivos</div>';
    html += '<div class="modal-sub">Quantos dispositivos deseja usar?</div>';
    
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px">';
    html += '<div style="font-size:13px;color:var(--text2);margin-bottom:16px;text-align:center">';
    html += 'Selecione o número de dispositivos que terão acesso ao plano PRO';
    html += '</div>';
    
    for (var i = 1; i <= 5; i++) {
        var dispositivosExtras = Math.max(0, i - plano.dispositivosInclusos);
        var precoTotal = planoId === 'anual' 
            ? plano.precoBase + (dispositivosExtras * plano.precoPorDevice * 12)
            : plano.precoBase + (dispositivosExtras * plano.precoPorDevice);
        
        var destaque = i === 1 ? 'border:2px solid var(--accent);' : '';
        var descricaoExtra = i === 1 
            ? '<div class="item-detail">Incluso no plano</div>'
            : '<div class="item-detail">+R$ ' + (dispositivosExtras * plano.precoPorDevice).toFixed(2).replace('.', ',') + '/mês extra</div>';
        
        html += '<div class="item-card" style="margin-bottom:8px;cursor:pointer;' + destaque + '" onclick="window.confirmarPlanoHandler(\'' + planoId + '\', ' + i + ')">';
        html += '<div class="item-info">';
        html += '<div class="item-name">' + i + ' dispositivo' + (i > 1 ? 's' : '') + '</div>';
        html += descricaoExtra;
        html += '</div>';
        html += '<div style="font-weight:700;color:var(--accent);font-size:16px">R$ ' + precoTotal.toFixed(2).replace('.', ',') + '</div>';
        html += '</div>';
    }
    
    html += '</div>';
    html += '<button class="btn btn-outline" onclick="mostrarPlanos()">← Voltar</button>';
    
    document.getElementById('modal-body').innerHTML = html;
}

function confirmarPlano(planoId, numDispositivos) {
    var plano = PLANOS[planoId];
    var dispositivosExtras = Math.max(0, numDispositivos - plano.dispositivosInclusos);
    var precoTotal = planoId === 'anual' 
        ? plano.precoBase + (dispositivosExtras * plano.precoPorDevice * 12)
        : plano.precoBase + (dispositivosExtras * plano.precoPorDevice);
    
    var html = '<div class="modal-handle"></div>';
    html += '<div class="modal-title">💳 Pagamento</div>';
    html += '<div class="modal-sub">' + plano.nome + '</div>';
    
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Plano:</span><strong>' + plano.nome + '</strong></div>';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Dispositivos:</span><strong>' + numDispositivos + '</strong></div>';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Duração:</span><strong>' + (planoId === 'anual' ? '12 meses' : '1 mês') + '</strong></div>';
    html += '<div style="display:flex;justify-content:space-between;padding-top:12px;border-top:1px solid var(--border);margin-top:12px"><span style="font-size:16px">Total:</span><strong style="color:var(--accent);font-size:20px">R$ ' + precoTotal.toFixed(2).replace('.', ',') + '</strong></div>';
    html += '</div>';
    
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px">';
    html += '<div style="font-weight:600;margin-bottom:12px">Escolha a forma de pagamento:</div>';
    
    // PIX
    html += '<div class="item-card" style="margin-bottom:8px;cursor:pointer;border:2px solid var(--success)" onclick="selecionarMetodoPagamento(\'pix\', \'' + planoId + '\', ' + numDispositivos + ', ' + precoTotal + ')">';
    html += '<div style="display:flex;align-items:center;gap:12px">';
    html += '<div style="font-size:32px">📱</div>';
    html += '<div style="flex:1">';
    html += '<div style="font-weight:700;font-size:16px">PIX</div>';
    html += '<div style="font-size:12px;color:var(--text2)">Aprovação instantânea</div>';
    html += '</div>';
    html += '<div style="background:var(--success);color:#fff;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:600">RECOMENDADO</div>';
    html += '</div></div>';
    
    // Cartão de Crédito
    html += '<div class="item-card" style="margin-bottom:8px;cursor:pointer" onclick="selecionarMetodoPagamento(\'cartao\', \'' + planoId + '\', ' + numDispositivos + ', ' + precoTotal + ')">';
    html += '<div style="display:flex;align-items:center;gap:12px">';
    html += '<div style="font-size:32px">💳</div>';
    html += '<div style="flex:1">';
    html += '<div style="font-weight:700;font-size:16px">Cartão de Crédito</div>';
    html += '<div style="font-size:12px;color:var(--text2)">Parcele em até 12x</div>';
    html += '</div>';
    html += '</div></div>';
    
    // Débito
    html += '<div class="item-card" style="margin-bottom:8px;cursor:pointer" onclick="selecionarMetodoPagamento(\'debito\', \'' + planoId + '\', ' + numDispositivos + ', ' + precoTotal + ')">';
    html += '<div style="display:flex;align-items:center;gap:12px">';
    html += '<div style="font-size:32px">💳</div>';
    html += '<div style="flex:1">';
    html += '<div style="font-weight:700;font-size:16px">Cartão de Débito</div>';
    html += '<div style="font-size:12px;color:var(--text2)">Aprovação imediata</div>';
    html += '</div>';
    html += '</div></div>';
    
    html += '</div>';
    
    html += '<button class="btn btn-outline" onclick="selecionarPlano(\'' + planoId + '\')">← Voltar</button>';
    
    document.getElementById('modal-body').innerHTML = html;
}

// ============ SELEÇÃO DE MÉTODO DE PAGAMENTO ============

function selecionarMetodoPagamento(metodo, planoId, numDispositivos, valor) {
    var html = '<div class="modal-handle"></div>';
    html += '<div class="modal-title">💳 Confirmar Pagamento</div>';
    
    var metodoNome = metodo === 'pix' ? 'PIX' : (metodo === 'cartao' ? 'Cartão de Crédito' : 'Cartão de Débito');
    var metodoIcon = metodo === 'pix' ? '📱' : '💳';
    var metodoCor = metodo === 'pix' ? 'var(--success)' : 'var(--accent)';
    
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px;text-align:center">';
    html += '<div style="font-size:48px;margin-bottom:12px">' + metodoIcon + '</div>';
    html += '<div style="font-size:18px;font-weight:700;color:' + metodoCor + '">' + metodoNome + '</div>';
    html += '<div style="font-size:14px;color:var(--text2);margin-top:8px">Você será redirecionado para o Mercado Pago</div>';
    html += '</div>';
    
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px">';
    html += '<div style="font-size:12px;color:var(--text2);margin-bottom:12px">';
    if (metodo === 'pix') {
        html += '✅ <strong>Aprovação instantânea</strong><br>';
        html += '✅ <strong>Escaneie o QR Code</strong> ou copie o código<br>';
        html += '✅ <strong>Disponível 24 horas</strong>';
    } else if (metodo === 'cartao') {
        html += '✅ <strong>Parcele em até 12x</strong><br>';
        html += '✅ <strong>Aceita todos os cartões</strong><br>';
        html += '✅ <strong>Aprovação em segundos</strong>';
    } else {
        html += '✅ <strong>Aprovação imediata</strong><br>';
        html += '✅ <strong>Débito direto da conta</strong><br>';
        html += '✅ <strong>Seguro e prático</strong>';
    }
    html += '</div></div>';
    
    html += '<button class="btn btn-primary" onclick="pagarComMercadoPago(\'' + planoId + '\', ' + numDispositivos + ', ' + valor + ', \'' + metodo + '\')" style="width:100%">🚀 Continuar para Pagamento</button>';
    html += '<button class="btn btn-outline" onclick="confirmarPlano(\'' + planoId + '\', ' + numDispositivos + ')" style="margin-top:8px;width:100%">← Voltar</button>';
    
    document.getElementById('modal-body').innerHTML = html;
}

// ============ PAGAMENTO MERCADO PAGO ============

async function chamarFuncaoSegura(nome, payload) {
    if (!supabaseClient) throw new Error('Serviço de autenticação indisponível');
    var sessao = await supabaseClient.auth.getSession();
    var accessToken = sessao && sessao.data && sessao.data.session ? sessao.data.session.access_token : '';
    if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente para continuar.');

    var response = await fetch(SUPABASE_EDGE_URL + '/' + nome, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        },
        body: JSON.stringify(payload)
    });
    var data = await response.json().catch(function() { return {}; });
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação');
    return data;
}

function abrirCheckoutSeguro(resultado, dadosPendentes) {
    if (!resultado || !resultado.init_point || !resultado.payment_id) {
        throw new Error('Resposta de checkout inválida');
    }
    localStorage.setItem('kayla_pending_payment', JSON.stringify({
        preference_id: resultado.preference_id,
        pagamento_id: resultado.payment_id,
        tipo: dadosPendentes.tipo,
        plano_tipo: dadosPendentes.plano_tipo,
        num_dispositivos: dadosPendentes.num_dispositivos,
        metodo: dadosPendentes.metodo_pagamento
    }));
    window.location.assign(resultado.init_point);
}

async function pagarComMercadoPago(planoId, numDispositivos, valorIgnorado, metodoPagamento) {
    metodoPagamento = metodoPagamento === 'cartao' ? 'cartao' : 'pix';
    if (!currentUser) { toast('Faça login primeiro', 'error'); return; }

    toast('Preparando checkout seguro...', 'warning');
    try {
        // O valor exibido é apenas informativo. O servidor calcula e grava o valor definitivo.
        var resultado = await chamarFuncaoSegura('criar-pagamento-seguro', {
            plano_tipo: planoId,
            num_dispositivos: numDispositivos,
            metodo_pagamento: metodoPagamento,
            tipo: 'novo'
        });
        abrirCheckoutSeguro(resultado, {
            tipo: 'novo', plano_tipo: planoId,
            num_dispositivos: numDispositivos, metodo_pagamento: metodoPagamento
        });
    } catch(error) {
        console.error('[MP] Erro ao iniciar checkout:', error);
        toast(error.message || 'Não foi possível iniciar o pagamento', 'error');
    }
}

// ============ QR CODE PIX ============

function mostrarQRCodePIX(dados, pagamentoId) {
    var html = '<div class="modal-handle"></div>';
    html += '<div class="modal-title">📱 Pagamento PIX</div>';
    html += '<div class="modal-sub">Escaneie o QR Code ou copie o código</div>';
    
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px;text-align:center">';
    
    // ✅ CORREÇÃO: Adicionar prefixo data:image se não existir
    var imgSrc = dados.qr_code_base64 || '';
    if (imgSrc && imgSrc.indexOf('data:') !== 0) {
        imgSrc = 'data:image/png;base64,' + imgSrc;
    }
    
    if (imgSrc && imgSrc.length > 100) {
        html += '<div style="background:#fff;padding:16px;border-radius:8px;margin-bottom:16px;display:inline-block">';
        html += '<img src="' + imgSrc + '" alt="QR Code PIX" style="width:250px;height:250px">';
        html += '</div>';
        html += '<div style="font-size:12px;color:var(--success);margin-bottom:16px">✅ QR Code gerado com sucesso!</div>';
    } else {
        html += '<div style="background:var(--bg2);padding:20px;border-radius:8px;margin-bottom:16px">';
        html += '<div style="font-size:48px;margin-bottom:12px">📱</div>';
        html += '<div style="font-size:14px;color:var(--text2);margin-bottom:12px">';
        html += 'O QR Code será gerado no app do seu banco<br>';
        html += 'ou você pode abrir no Mercado Pago';
        html += '</div></div>';
    }
    
    if (dados.qr_code) {
        html += '<div style="margin-bottom:16px">';
        html += '<div style="font-size:12px;color:var(--text2);margin-bottom:8px">Código PIX (Copia e Cola):</div>';
        html += '<textarea id="pix-codigo" readonly style="width:100%;height:80px;padding:8px;border-radius:8px;border:1px solid var(--border);font-size:11px;resize:none;background:var(--bg2);font-family:monospace;color:#fff">' + dados.qr_code + '</textarea>';
        html += '</div>';
        html += '<button class="btn btn-primary" onclick="copiarCodigoPIX()" style="width:100%;margin-bottom:8px">📋 Copiar Código PIX</button>';
    }
    
    if (dados.ticket_url) {
        html += '<a href="' + dados.ticket_url + '" target="_blank" class="btn btn-outline" style="width:100%;display:block;text-align:center;margin-bottom:8px;text-decoration:none;padding:12px"> Abrir QR Code no App do Banco</a>';
    }
    
    html += '</div>';
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px">';
    html += '<div style="font-weight:600;margin-bottom:12px">📋 Como pagar:</div>';
    html += '<ol style="padding-left:20px;font-size:12px;color:var(--text2);margin:0">';
    html += '<li style="margin-bottom:8px">Abra o app do seu banco</li>';
    html += '<li style="margin-bottom:8px">Escolha pagar com PIX</li>';
    html += '<li style="margin-bottom:8px">Escaneie o QR Code ou copie o código</li>';
    html += '<li style="margin-bottom:8px">Confirme o pagamento</li>';
        html += '<li>Aprovação é instantânea!</li>';
    html += '</ol></div>';
    html += '<button class="btn btn-outline" onclick="fecharModal()">Fechar</button>';
    
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('show');
    iniciarPollingPIX(pagamentoId);
}

// ============ RESTO DAS FUNÇÕES (Upgrade, Dispositivos, etc) ============

async function criarRegistroPagamento(planoId, numDispositivos, valor, metodo) {
    if (!currentUser || !supabaseClient) {
        toast('Faça login primeiro', 'error');
        return null;
    }
    
    try {
        var pagamentoData = {
            user_id: currentUser.id,
            valor: valor,
            metodo_pagamento: metodo,
            status: 'pendente'
        };
        
        var result = await supabaseClient
            .from('pagamentos')
            .insert(pagamentoData)
            .select()
            .single();
        
        if (result.error) {
            console.error('Erro ao criar pagamento:', result.error);
            toast('Erro ao iniciar pagamento', 'error');
            return null;
        }
        
        return result.data;
    } catch(e) {
        console.error('Erro no pagamento:', e);
        toast('Erro de conexão', 'error');
        return null;
    }
}

async function verificarStatusPagamento(pagamentoId) {
    toast('Verificando pagamento...', 'warning');
    
    var html = '<div class="modal-handle"></div>';
    html += '<div class="modal-title">✅ Confirmar Pagamento</div>';
    html += '<div class="modal-sub">Insira o código da transação</div>';
    
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px">';
    html += '<div style="font-size:12px;color:var(--text2);margin-bottom:12px">';
    html += 'Após pagar, você receberá um código de confirmação. Insira-o abaixo:';
    html += '</div>';
    html += '<input type="text" class="form-input" id="codigo-transacao" placeholder="Código da transação">';
    html += '</div>';
    
    html += '<button class="btn btn-primary" onclick="confirmarPagamentoManual(\'' + pagamentoId + '\')">✅ Confirmar</button>';
    html += '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button>';
    
    document.getElementById('modal-body').innerHTML = html;
}

async function confirmarPagamentoManual(pagamentoId) {
    var codigo = document.getElementById('codigo-transacao').value.trim();
    if (!codigo) {
        toast('Digite o código da transação', 'warning');
        return;
    }
    
    toast('Pagamento em análise. Aguarde aprovação.', 'warning');
    fecharModal();
}

function calcularUpgradeProporcional(assinaturaAtual, novosDispositivos) {
    var dataFim = new Date(assinaturaAtual.data_fim);
    var hoje = new Date();
    
    var mesesRestantes = 1; 
    
    var dispositivosExtras = novosDispositivos - assinaturaAtual.dispositivos_max;
    
    if (dispositivosExtras <= 0) {
        return {
            dispositivosExtras: 0,
            valorPorMes: 0,
            valorPorDispositivo: 0,
            mesesRestantes: mesesRestantes,
            valorTotal: 0,
            novaDataFim: dataFim.toISOString()
        };
    }
    
    var valorPorMes = 5.00;
    var valorPorDispositivo = 5.00;
    var valorTotal = dispositivosExtras * valorPorMes;
    
    return {
        dispositivosExtras: dispositivosExtras,
        valorPorMes: valorPorMes,
        valorPorDispositivo: valorPorDispositivo,
        mesesRestantes: mesesRestantes,
        valorTotal: valorTotal,
        novaDataFim: dataFim.toISOString()
    };
}

async function fazerUpgradeDispositivos() {
    if (!currentUser) {
        toast('Faça login primeiro', 'error');
        return;
    }
    
    var assinatura = await getAssinaturaAtiva();
    if (!assinatura) {
        toast('Nenhuma assinatura ativa encontrada', 'error');
        mostrarPlanos();
        return;
    }
    
    var html = '<div class="modal-handle"></div>';
    html += '<div class="modal-title">⬆️ Upgrade de Dispositivos</div>';
    html += '<div class="modal-sub">Adicione mais dispositivos ao seu plano</div>';
    
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px">';
    html += '<div style="text-align:center;margin-bottom:16px">';
    html += '<div style="font-size:14px;color:var(--text2)">Dispositivos atuais: <strong>' + assinatura.dispositivos_max + '</strong></div>';
    html += '</div>';
    
    for (var i = assinatura.dispositivos_max + 1; i <= 5; i++) {
        var calculo = calcularUpgradeProporcional(assinatura, i);
        
        html += '<div class="item-card" style="margin-bottom:8px;cursor:pointer" onclick="confirmarUpgradeDispositivos(' + i + ', ' + calculo.valorTotal + ')">';
        html += '<div class="item-info">';
        html += '<div class="item-name">' + i + ' dispositivo' + (i > 1 ? 's' : '') + '</div>';
        html += '<div class="item-detail">+' + (i - assinatura.dispositivos_max) + ' dispositivo(s) extra(s)</div>';
        html += '</div>';
        html += '<div style="font-weight:700;color:var(--accent);font-size:16px">R$ ' + calculo.valorTotal.toFixed(2).replace('.', ',') + '</div>';
        html += '</div>';
    }
    
    html += '</div>';
    html += '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button>';
    
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('show');
}

async function confirmarUpgradeDispositivos(novosDispositivos, valor) {
    if (!currentUser) return;
    
    var assinatura = await getAssinaturaAtiva();
    if (!assinatura) return;
    
    var calculo = calcularUpgradeProporcional(assinatura, novosDispositivos);
    
    var html = '<div class="modal-handle"></div>';
    html += '<div class="modal-title">⬆️ Confirmar Upgrade</div>';
    html += '<div class="modal-sub">Escolha a forma de pagamento</div>';
    
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px">';
    html += '<div style="text-align:center;margin-bottom:16px">';
    html += '<div style="font-size:14px;color:var(--text2)">De ' + assinatura.dispositivos_max + ' para ' + novosDispositivos + ' dispositivo(s)</div>';
    html += '<div style="font-size:12px;color:var(--text2);margin-top:8px">Válido até: <strong>' + new Date(assinatura.data_fim).toLocaleDateString('pt-BR') + '</strong></div>';
    html += '</div>';
    
    html += '<div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:12px">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px">';
    html += '<span style="font-size:12px;color:var(--text2)">Dispositivos extras:</span>';
    html += '<strong>' + calculo.dispositivosExtras + '</strong>';
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px">';
    html += '<span style="font-size:12px;color:var(--text2)">Valor por dispositivo:</span>';
    html += '<strong>R$ ' + calculo.valorPorDispositivo.toFixed(2).replace('.', ',') + '</strong>';
    html += '</div>';
    html += '<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;display:flex;justify-content:space-between">';
    html += '<span style="font-size:16px;font-weight:700">Total:</span>';
    html += '<strong style="color:var(--accent);font-size:20px">R$ ' + calculo.valorTotal.toFixed(2).replace('.', ',') + '</strong>';
    html += '</div>';
    html += '</div>';
    
    html += '<div style="font-size:11px;color:var(--text2);text-align:center;margin-bottom:12px">';
    html += '💡 Os dispositivos extras ficarão ativos até ' + new Date(assinatura.data_fim).toLocaleDateString('pt-BR');
    html += '</div>';
    html += '</div>';
    
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px">';
    html += '<div style="font-weight:600;margin-bottom:12px">Escolha a forma de pagamento:</div>';
    
    // PIX
    html += '<div class="item-card" style="margin-bottom:8px;cursor:pointer;border:2px solid var(--success)" onclick="processarUpgradeDispositivos(' + novosDispositivos + ', ' + calculo.valorTotal + ', \'pix\')">';
    html += '<div style="display:flex;align-items:center;gap:12px">';
    html += '<div style="font-size:32px">📱</div>';
    html += '<div style="flex:1">';
    html += '<div style="font-weight:700;font-size:16px">PIX</div>';
    html += '<div style="font-size:12px;color:var(--text2)">Aprovação instantânea</div>';
    html += '</div>';
    html += '<div style="background:var(--success);color:#fff;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:600">RECOMENDADO</div>';
    html += '</div></div>';
    
    // Cartão de Crédito
    html += '<div class="item-card" style="margin-bottom:8px;cursor:pointer" onclick="processarUpgradeDispositivos(' + novosDispositivos + ', ' + calculo.valorTotal + ', \'cartao\')">';
    html += '<div style="display:flex;align-items:center;gap:12px">';
    html += '<div style="font-size:32px">💳</div>';
    html += '<div style="flex:1">';
    html += '<div style="font-weight:700;font-size:16px">Cartão de Crédito</div>';
    html += '<div style="font-size:12px;color:var(--text2)">Parcele em até 12x</div>';
    html += '</div>';
    html += '</div></div>';
    
    html += '</div>';
    
    html += '<button class="btn btn-outline" onclick="fazerUpgradeDispositivos()">← Voltar</button>';
    
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('show');
}

async function obterTipoPlanoDaAssinatura(assinatura) {
    if (!assinatura || !assinatura.plano_id) return 'mensal';
    var resultado = await supabaseClient.from('planos').select('tipo').eq('id', assinatura.plano_id).maybeSingle();
    return resultado && resultado.data && resultado.data.tipo === 'anual' ? 'anual' : 'mensal';
}

async function processarUpgradeDispositivos(novosDispositivos, valorIgnorado, metodoPagamento) {
    if (!currentUser) return;
    metodoPagamento = metodoPagamento === 'cartao' ? 'cartao' : 'pix';
    var assinatura = await getAssinaturaAtiva();
    if (!assinatura) return;

    try {
        var planoTipo = await obterTipoPlanoDaAssinatura(assinatura);
        var resultado = await chamarFuncaoSegura('criar-pagamento-seguro', {
            plano_tipo: planoTipo,
            num_dispositivos: novosDispositivos,
            metodo_pagamento: metodoPagamento,
            tipo: 'upgrade'
        });
        abrirCheckoutSeguro(resultado, {
            tipo: 'upgrade', plano_tipo: planoTipo,
            num_dispositivos: novosDispositivos, metodo_pagamento: metodoPagamento
        });
    } catch(e) {
        console.error('[Upgrade] Erro ao iniciar checkout:', e);
        toast(e.message || 'Não foi possível iniciar o upgrade', 'error');
    }
}

async function confirmarUpgradePago() {
    // A confirmação é exclusiva do webhook validado no servidor.
    toast('Aguardando confirmação segura do pagamento...', 'warning');
    if (typeof verificarStatusPro === 'function') await verificarStatusPro();
}

async function gerenciarDispositivos() {
    var modalBody = document.getElementById('modal-body');
    if (modalBody) modalBody.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text2)">Carregando...</div>';
    
    if (!currentUser || !supabaseClient) {
        toast('Faça login primeiro', 'error');
        return;
    }
    
    var assinatura = await getAssinaturaAtiva();
    if (!assinatura) {
        toast('Nenhuma assinatura ativa', 'error');
        return;
    }
    
    try {
        // Buscar contagem real de dispositivos ativos no banco
        var { count: totalAtivosReal } = await supabaseClient.from('dispositivos').select('id', { count: 'exact', head: true }).eq('assinatura_id', assinatura.id).eq('ativo', true);
        var qtdAtivos = totalAtivosReal || 0;
        
        var content = await gerarHtmlListaDispositivos();
        var html = '<div class="modal-handle"></div><div class="modal-title">📱 Dispositivos</div>';
        // A contagem já é exibida dentro do 'content' (gerarHtmlListaDispositivos)
        html += content;
        
        if (qtdAtivos < assinatura.dispositivos_max) {
            html += '<button class="btn btn-primary" onclick="fecharModal(); fazerUpgradeDispositivos()" style="margin-top:12px; width:100%">⬆️ Adicionar Dispositivo</button>';
        } else {
            html += '<button class="btn btn-primary" onclick="fecharModal(); fazerUpgradeDispositivos()" style="margin-top:12px; width:100%">⬆️ Fazer Upgrade</button>';
        }
        
        html += '<button class="btn btn-outline" onclick="fecharModal()" style="margin-top:8px; width:100%">Fechar</button>';
        
        modalBody.innerHTML = html;
        document.getElementById('modal-overlay').classList.add('show');
    } catch(e) {
        console.error('Erro ao buscar dispositivos:', e);
        toast('Erro ao carregar dispositivos', 'error');
    }
}

async function removerDispositivo(deviceId) {
    if (!currentUser) { toast('Faça login primeiro', 'error'); return false; }
    try {
        var resultado = await chamarFuncaoSegura('gerenciar-assinatura', {
            action: 'remover_dispositivo',
            device_id: deviceId
        });
        localStorage.setItem('kayla_pro_devices', resultado.dispositivos_usados + '/' + resultado.dispositivos_max);
        if (typeof verificarStatusPro === 'function') await verificarStatusPro();
        if (typeof atualizarBadgePlano === 'function') atualizarBadgePlano();
        if (typeof gerenciarDispositivos === 'function') await gerenciarDispositivos();
        toast('Dispositivo removido com sucesso.', 'success');
        return true;
    } catch(e) {
        console.error('[Dispositivo] Erro:', e);
        toast(e.message || 'Não foi possível remover o dispositivo', 'error');
        return false;
    }
}

// ============ NOVAS FUNÇÕES DE DOWNGRADE E RENOVAÇÃO ============

// Crédito proporcional aos dias não usados (R$ 5/dispositivo/mês = ~R$ 0,17/dia)
function calcularCreditoProporcional(assinatura, qtdRemovida) {
    var MS_POR_DIA = 86400000;
    var dataFim = new Date(assinatura.data_fim).getTime();
    var diasRestantes = Math.max(0, Math.ceil((dataFim - Date.now()) / MS_POR_DIA));
    var creditoPorDispositivo = (5 * diasRestantes) / 30;
    var valorCredito = Math.round(qtdRemovida * creditoPorDispositivo * 100) / 100;
    return { diasRestantes: diasRestantes, creditoPorDispositivo: creditoPorDispositivo, valorCredito: valorCredito };
}

async function cancelarDispositivos(novosDispositivos) {
    if (!currentUser) { toast('Faça login primeiro', 'error'); return; }
    var assinatura = await getAssinaturaAtiva();
    if (!assinatura) { toast('Nenhuma assinatura ativa encontrada', 'error'); return; }
    if (novosDispositivos >= assinatura.dispositivos_max) { toast('Você só pode reduzir o número de dispositivos.', 'warning'); return; }

    var dispositivosRemovidos = assinatura.dispositivos_max - novosDispositivos;
    var calc = calcularCreditoProporcional(assinatura, dispositivosRemovidos);
    var valorCredito = calc.valorCredito;

    var html = '<div class="modal-handle"></div>';
    html += '<div class="modal-title">📉 Reduzir Dispositivos</div>';
    html += '<div class="modal-sub">Removendo <strong>' + dispositivosRemovidos + '</strong> dispositivo(s) (de ' + assinatura.dispositivos_max + ' para ' + novosDispositivos + ')</div>';

    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center">';
    html += '<div style="display:flex;flex-direction:column;align-items:flex-start">';
    html += '<span style="font-weight:700;font-size:16px;color:var(--success)">Crédito a receber:</span>';
    html += '<span style="font-size:11px;color:var(--text2);margin-top:4px;max-width:230px">Proporcional a <strong>' + calc.diasRestantes + ' dia(s)</strong> restantes (R$ ' + calc.creditoPorDispositivo.toFixed(2).replace('.', ',') + ' por dispositivo)</span>';
    html += '</div>';
    html += '<strong style="color:var(--success);font-size:20px">R$ ' + valorCredito.toFixed(2).replace('.', ',') + '</strong>';
    html += '</div>';
    html += '<div style="margin-top:12px;padding:10px;background:rgba(124,92,252,0.08);border:1px solid var(--border);border-radius:8px;font-size:11px;color:var(--text2);line-height:1.5">';
    html += 'ℹ️ Este crédito é <strong>proporcional aos dias não usados</strong> até o vencimento e entra <strong>automaticamente como desconto na sua próxima renovação</strong>. Não é devolvido em dinheiro nem em PIX.';
    html += '</div>';
    html += '</div>';

    html += '<button class="btn btn-primary" onclick="confirmarCancelamentoDispositivos(' + novosDispositivos + ', ' + valorCredito + ', \'' + assinatura.id + '\')">✅ Confirmar Redução</button>';
    html += '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button>';
    document.getElementById('modal-body').innerHTML = html; document.getElementById('modal-overlay').classList.add('show');
}

async function confirmarCancelamentoDispositivos(novosDispositivos) {
    if (!currentUser) { toast('Erro de autenticação', 'error'); return; }
    try {
        var resultado = await chamarFuncaoSegura('gerenciar-assinatura', {
            action: 'reduzir_dispositivos',
            num_dispositivos: novosDispositivos
        });
        localStorage.setItem('kayla_pro_devices', resultado.dispositivos_usados + '/' + resultado.dispositivos_max);
        fecharModal();
        if (typeof verificarStatusPro === 'function') await verificarStatusPro();
        if (typeof mudarAba === 'function') mudarAba('settings');
        toast('Redução concluída. Crédito calculado no servidor: R$ ' + Number(resultado.credito || 0).toFixed(2).replace('.', ','), 'success');
    } catch(e) { toast(e.message || 'Não foi possível reduzir os dispositivos', 'error'); }
}

function iniciarCancelamentoDispositivos() {
    if (!currentUser) { toast('Faça login primeiro', 'error'); return; }
    getAssinaturaAtiva().then(function(assinatura) {
        if (!assinatura || assinatura.dispositivos_max <= 1) { toast('Você já está no mínimo de 1 dispositivo.', 'warning'); return; }

        var html = '<div class="modal-handle"></div><div class="modal-title">📉 Reduzir Dispositivos</div><div class="modal-sub">Atual: ' + assinatura.dispositivos_max + ' dispositivo(s)</div>';
        html += '<div style="margin:0 0 10px;padding:10px;background:rgba(124,92,252,0.08);border:1px solid var(--border);border-radius:8px;font-size:11px;color:var(--text2);line-height:1.5">ℹ️ O crédito é <strong>proporcional aos dias que faltam</strong> até o vencimento e vale <strong>só na próxima renovação</strong> (não volta em dinheiro/PIX).</div>';
        html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px">';
        for (var i = 1; i < assinatura.dispositivos_max; i++) {
            var qtdRemovida = assinatura.dispositivos_max - i;
            var calc = calcularCreditoProporcional(assinatura, qtdRemovida);
            html += '<div class="item-card" style="margin-bottom:8px;cursor:pointer;border:1px solid var(--border)" onclick="cancelarDispositivos(' + i + ')">';
            html += '<div class="item-info"><div class="item-name">' + i + ' dispositivo(s)</div>';
            html += '<div class="item-detail">Remove <strong>' + qtdRemovida + '</strong> • Crédito na renovação: <strong style="color:var(--success)">R$ ' + calc.valorCredito.toFixed(2).replace('.', ',') + '</strong> (' + calc.diasRestantes + 'd restantes)</div></div>';
            html += '<div style="font-weight:700;color:var(--accent)">Selecionar →</div></div>';
        }
        html += '</div><button class="btn btn-outline" onclick="fecharModal()">Cancelar</button>';
        document.getElementById('modal-body').innerHTML = html; document.getElementById('modal-overlay').classList.add('show');
    });
}

function iniciarRenovacao() {
    if (!currentUser) { toast('Faça login primeiro', 'error'); return; }
    getAssinaturaAtiva().then(async function(assinatura) {
        if (!assinatura) { toast('Nenhuma assinatura ativa para renovar', 'error'); return; }
        if (Math.ceil((new Date(assinatura.data_fim) - new Date()) / (1000 * 60 * 60 * 24)) > 15) { toast('⚠️ Renove apenas quando faltar menos de 15 dias.', 'warning'); return; }
        
        var html = '<div class="modal-handle"></div><div class="modal-title">🔄 Renovar Assinatura</div><div class="modal-sub">Atual: ' + assinatura.dispositivos_max + ' dispositivo(s)</div>';
        html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px"><div style="font-size:13px;color:var(--text2);margin-bottom:12px;text-align:center">Escolha quantos dispositivos deseja renovar:</div>';
        
        for (var i = 1; i <= 5; i++) {
            var precoFinal = 19.90 + ((i - 1) * 5);
            var destaque = i === assinatura.dispositivos_max ? 'border:2px solid var(--accent);' : '';
            
            html += '<div class="item-card" style="margin-bottom:8px;cursor:pointer;' + destaque + '" onclick="confirmarRenovacao(' + i + ')">';
            html += '<div class="item-info"><div class="item-name">' + i + ' dispositivo(s)</div></div>';
            html += '<div style="font-weight:700;color:var(--accent);font-size:16px">R$ ' + precoFinal.toFixed(2).replace('.', ',') + '</div></div>';
        }
        html += '</div><button class="btn btn-outline" onclick="fecharModal()">Cancelar</button>';
        document.getElementById('modal-body').innerHTML = html; document.getElementById('modal-overlay').classList.add('show');
    });
}

async function confirmarRenovacao(novosDispositivos) {
    if (!currentUser) { toast('Erro de autenticação', 'error'); return; }
    try {
        var assinatura = await getAssinaturaAtiva();
        if (!assinatura) { toast('Assinatura não encontrada', 'error'); return; }
        var planoTipo = await obterTipoPlanoDaAssinatura(assinatura);
        var resultado = await chamarFuncaoSegura('criar-pagamento-seguro', {
            plano_tipo: planoTipo,
            num_dispositivos: novosDispositivos,
            metodo_pagamento: 'pix',
            tipo: 'renovacao'
        });
        abrirCheckoutSeguro(resultado, {
            tipo: 'renovacao', plano_tipo: planoTipo,
            num_dispositivos: novosDispositivos, metodo_pagamento: 'pix'
        });
    } catch(e) { toast(e.message || 'Não foi possível iniciar a renovação', 'error'); }
}

async function mostrarInfoAssinatura() {
    if (!currentUser || !supabaseClient) {
        toast('Faça login primeiro', 'error');
        return;
    }
    
    var result = await supabaseClient
        .from('assinaturas')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('status', 'ativa')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    
    if (result.error || !result.data) {
        if (localStorage.getItem('kayla_pro')) {
            localStorage.removeItem('kayla_pro');
            localStorage.removeItem('kayla_pro_key');
            localStorage.removeItem('kayla_pro_expires');
            localStorage.removeItem('kayla_pro_devices');
            LIMITES.proAtivo = false;
        }
        var html = '<div class="modal-handle"></div>';
        html += '<div class="modal-title">📋 Minha Assinatura</div>';
        html += '<div class="card" style="background:var(--bg3);padding:20px;text-align:center;margin-bottom:16px">';
        html += '<div style="font-size:48px;margin-bottom:12px">🆓</div>';
        html += '<div style="font-size:16px;font-weight:700;margin-bottom:8px">Plano Gratuito</div>';
        html += '<div style="font-size:13px;color:var(--text2);margin-bottom:16px">';
        html += 'Você está usando o plano gratuito com limitações.';
        html += '</div>';
        html += '</div>';
        html += '<button class="btn btn-primary" onclick="fecharModal(); mostrarPlanos()">🚀 Assinar PRO</button>';
        html += '<button class="btn btn-outline" onclick="fecharModal()">Fechar</button>';
        document.getElementById('modal-body').innerHTML = html;
        document.getElementById('modal-overlay').classList.add('show');
        return;
    }
    
    var assinatura = result.data;
    var dataFim = new Date(assinatura.data_fim).toLocaleDateString('pt-BR');
    var diasRestantes = Math.floor((new Date(assinatura.data_fim) - new Date()) / (1000 * 60 * 60 * 24));

    // Buscar contagem real de dispositivos ativos no banco
    var qtdAtivosReal = 0;
    try {
        var { count: cntAtivos } = await supabaseClient.from('dispositivos').select('id', { count: 'exact', head: true }).eq('assinatura_id', assinatura.id).eq('ativo', true);
        qtdAtivosReal = cntAtivos || 0;
    } catch(e) { qtdAtivosReal = assinatura.dispositivos_usados || 0; }

    var saldoCredito = 0;
    try {
        var { data: creditos, error: credError } = await supabaseClient
            .from('creditos')
            .select('valor')
            .eq('user_id', currentUser.id)
            .eq('utilizado', false);
        if (!credError && creditos && creditos.length > 0) {
            creditos.forEach(function(cred) { saldoCredito += cred.valor; });
        }
    } catch(e) { console.warn('Erro ao buscar créditos:', e); }
    
    // Apenas salvar a key e a validade; não forçar PRO ativo (isso depende do dispositivo estar registrado)
    localStorage.setItem('kayla_pro_key', assinatura.key_ativacao || '');
    localStorage.setItem('kayla_pro_expires', assinatura.data_fim || '');
    localStorage.setItem('kayla_pro_devices', qtdAtivosReal + '/' + assinatura.dispositivos_max);
    
    var html = '<div class="modal-handle"></div>';
    html += '<div class="modal-title">📋 Minha Assinatura</div>';

    if (saldoCredito > 0) {
        html += '<div style="background:#15803d;color:#fff;padding:12px;border-radius:8px;text-align:center;margin-bottom:12px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px">';
        html += '💰 Você tem <strong>R$ ' + saldoCredito.toFixed(2).replace('.', ',') + '</strong> em crédito disponível para sua próxima renovação!';
        html += '</div>';
    }
    
    html += '<div class="card" style="background:var(--bg3);padding:16px;margin-bottom:16px">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:12px">';
    html += '<span style="color:var(--text2)">Status:</span>';
    html += '<span class="badge-pro">ATIVA</span>';
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:12px">';
    html += '<span style="color:var(--text2)">Key:</span>';
    html += '<strong style="font-family:monospace;font-size:12px">' + (assinatura.key_ativacao || 'N/A') + '</strong>';
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:12px">';
    html += '<span style="color:var(--text2)">Dispositivos:</span>';
    html += '<strong>' + qtdAtivosReal + '/' + assinatura.dispositivos_max + '</strong>';
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:12px">';
    html += '<span style="color:var(--text2)">Validade:</span>';
    html += '<strong>' + dataFim + '</strong>';
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between">';
    html += '<span style="color:var(--text2)">Dias restantes:</span>';
    html += '<strong style="color:' + (diasRestantes <= 7 ? 'var(--warning)' : 'var(--success)') + '">' + diasRestantes + ' dias</strong>';
    html += '</div>';
    html += '</div>';
    
    html += '<button class="btn btn-outline" onclick="fecharModal()" style="width:100%">Fechar</button>';
    
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('show');
}

// ============ VERIFICAÇÃO APÓS RETORNO DO PAGAMENTO ============

function verificarRetornoPagamento() {
    var urlParams = new URLSearchParams(window.location.search);
    var collectionStatus = urlParams.get('collection_status');
    var paymentId = urlParams.get('payment_id');
    var preferenceId = urlParams.get('preference_id');
    var externalReference = urlParams.get('external_reference');
    
    console.log('[Pagamento] Retorno detectado:', { 
        collectionStatus, 
        paymentId, 
        preferenceId, 
        externalReference 
    });
    
    // ✅ CORREÇÃO 1: Inicializar LIMITES se não existir
    if (typeof window.LIMITES === 'undefined') {
        window.LIMITES = {
            proAtivo: false,
            maxClientes: 3,
            maxProdutos: 10,
            maxVendas: 3,
            bloqueadoPorDispositivo: false
        };
        console.log('[Pagamento] LIMITES inicializado');
    }
    
    if (collectionStatus || paymentId || preferenceId) {
        console.log('[Pagamento] ✅ Retorno do Mercado Pago detectado!');
        
        // Limpar cache PRO antigo
        localStorage.removeItem('kayla_pro');
        localStorage.removeItem('kayla_pro_key');
        localStorage.removeItem('kayla_pro_expires');
        localStorage.removeItem('kayla_pro_devices');
        LIMITES.proAtivo = false;
        
        // ✅ CORREÇÃO 2: Lidar com diferentes status
        if (collectionStatus === 'approved') {
            toast('✅ Pagamento aprovado! Ativando sua conta...', 'success');
            setTimeout(async function() {
                console.log('[Pagamento] Chamando verificarStatusPro()...');
                if (typeof window.verificarStatusPro === 'function') {
                    await window.verificarStatusPro();
                }
                if (LIMITES.proAtivo) {
                    toast('🎉 Plano PRO ativado com sucesso!', 'success');
                    atualizarBadgePlano();
                    if (typeof mudarAba === 'function') {
                        mudarAba('settings');
                    }
                } else {
                    toast('⚠️ Pagamento aprovado, mas assinatura não ativada. Aguarde 10 segundos e recarregue.', 'warning');
                    setTimeout(async function() {
                        if (typeof window.verificarStatusPro === 'function') {
                            await window.verificarStatusPro();
                        }
                        if (LIMITES.proAtivo) {
                            toast('🎉 Plano PRO ativado!', 'success');
                            atualizarBadgePlano();
                            if (typeof mudarAba === 'function') {
                                mudarAba('settings');
                            }
                        }
                    }, 10000);
                }
            }, 3000);
        } else if (collectionStatus === 'pending' || collectionStatus === 'in_process') {
            // ✅ CORREÇÃO 3: Pagamento pendente/em processamento - verificar periodicamente
            toast('⏳ Pagamento em processamento. Aguarde...', 'warning');
            
            // Verificar status a cada 5 segundos por 2 minutos
            var tentativas = 0;
            var maxTentativas = 24; // 24 x 5s = 2 minutos
            
            var intervaloVerificacao = setInterval(async function() {
                tentativas++;
                console.log('[Pagamento] Verificando status... tentativa ' + tentativas);
                
                if (typeof window.verificarStatusPro === 'function') {
                    await window.verificarStatusPro();
                }
                
                if (LIMITES.proAtivo) {
                    clearInterval(intervaloVerificacao);
                    toast(' Plano PRO ativado!', 'success');
                    atualizarBadgePlano();
                    if (typeof mudarAba === 'function') {
                        mudarAba('settings');
                    }
                } else if (tentativas >= maxTentativas) {
                    clearInterval(intervaloVerificacao);
                    toast('️ Pagamento ainda pendente. Entre em contato com o suporte.', 'error');
                }
            }, 5000);
            
            // Limpar intervalo quando sair da página
            window.addEventListener('beforeunload', function() {
                clearInterval(intervaloVerificacao);
            });
        } else {
            // Pagamento rejeitado/cancelado
            toast('❌ Pagamento não aprovado. Status: ' + collectionStatus, 'error');
        }
        
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

if (typeof window !== 'undefined') {
    verificarRetornoPagamento();
    window.addEventListener('DOMContentLoaded', function() {
        setTimeout(verificarRetornoPagamento, 500);
    });
}
window.ativarProManual = ativarPro;

// ============ VIGÍLIA DO PIX (fecha e ativa sozinho quando aprova) ============
var _pixPollingTimer = null;
function iniciarPollingPIX(pagamentoId) {
    if (!pagamentoId || !supabaseClient) return;
    if (_pixPollingTimer) { clearInterval(_pixPollingTimer); _pixPollingTimer = null; }
    var tentativas = 0;
    var maxTentativas = 100; // 100 x 3s = 5 minutos
    _pixPollingTimer = setInterval(async function() {
        tentativas++;
        try {
            var r = await supabaseClient.from('pagamentos').select('status').eq('id', pagamentoId).maybeSingle();
            if (r && r.data && r.data.status === 'aprovado') {
                clearInterval(_pixPollingTimer); _pixPollingTimer = null;
                console.log('[PIX] aprovado detectado pela vigília:', pagamentoId);
                try { fecharModal(); } catch(e){}
                toast('✅ Pagamento aprovado! Ativando PRO...', 'success');
                if (typeof window.verificarStatusPro === 'function') { try { await window.verificarStatusPro(); } catch(e){} }
                if (typeof atualizarBadgePlano === 'function') atualizarBadgePlano();
                try { var _c = document.getElementById('content'); if (_c && typeof renderizarConfig === 'function' && document.querySelector('.nav-btn:nth-child(6).active')) _c.innerHTML = renderizarConfig(); } catch(e){}
                return;
            }
        } catch(e) { console.warn('[PIX] erro na vigília:', e); }
        if (tentativas >= maxTentativas) { clearInterval(_pixPollingTimer); _pixPollingTimer = null; }
    }, 3000);
}
window.iniciarPollingPIX = iniciarPollingPIX;

console.log('✅ Payments.js carregado');

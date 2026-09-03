/* ============================================================================
   chat_juridico.js — Chat com o Gerente de Interface Jurídica
   ============================================================================ */

(function () {
    'use strict';

    let chatDrawer = null;
    let chatOverlay = null;
    let chatBtn = null;
    let currentProcessoId = null;
    let currentNotificacaoId = null;
    let currentChatData = null;
    let selectedFileAttachment = null;
    let syncInterval = null;
    let perfilCache = null;
    let modoListaConversas = false;

    // ── Helper: Obter perfil do usuário logado (Assíncrono com Fallbacks) ──────
    async function getPerfilAtualAsync() {
        if (perfilCache && perfilCache.nome && perfilCache.nome !== 'Usuário') return perfilCache;

        if (window.currentUserProfile && window.currentUserProfile.nome && window.currentUserProfile.nome !== 'Usuário') {
            perfilCache = window.currentUserProfile;
            return perfilCache;
        }
        if (window.perfilAtual && window.perfilAtual.nome && window.perfilAtual.nome !== 'Usuário') {
            perfilCache = window.perfilAtual;
            return perfilCache;
        }

        // Tentar obter do Supabase Auth
        try {
            if (typeof supabaseClient !== 'undefined') {
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (session?.user) {
                    const { data: p } = await supabaseClient
                        .from('profiles')
                        .select('id, nome, cargo, matricula')
                        .eq('auth_id', session.user.id)
                        .maybeSingle();

                    if (p && p.nome) {
                        perfilCache = p;
                        window.currentUserProfile = p;
                        return p;
                    }
                }
            }
        } catch (e) { }

        // Tentar obter do localStorage
        try {
            const raw = localStorage.getItem('usuario_logado');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.nome && parsed.nome !== 'Usuário') {
                    perfilCache = parsed;
                    return parsed;
                }
            }
        } catch (e) { }

        // Tentar obter do DOM (header de perfil)
        const nomeHeader = document.getElementById('perfilHeaderNome')?.textContent;
        const cargoHeader = document.getElementById('perfilHeaderCargo')?.textContent;
        if (nomeHeader && nomeHeader !== 'Meu Perfil' && nomeHeader.trim() !== '') {
            perfilCache = { nome: nomeHeader.trim(), cargo: cargoHeader || 'Fiscal de Postura' };
            return perfilCache;
        }

        return { nome: 'Luiza', cargo: 'Fiscal de Postura', id: null };
    }

    // ── Helper: Obter parâmetro da URL ──────────────────────────────────────
    function getParamURL(key) {
        return new URLSearchParams(window.location.search).get(key);
    }

    // ── Criar HTML dos elementos do Chat ───────────────────────────────────
    function injectChatElements() {
        if (document.getElementById('btnFloatingChatJuridico')) return;

        // Estilos CSS do Widget de Chat
        const style = document.createElement('style');
        style.textContent = `
            .floating-chat-btn {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 99990;
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: linear-gradient(135deg, #80A1D4 0%, #75C9C8 100%);
                color: white;
                border: none;
                box-shadow: 0 8px 24px rgba(117, 201, 200, 0.4);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .floating-chat-btn:hover {
                transform: scale(1.08) translateY(-2px);
                box-shadow: 0 12px 28px rgba(117, 201, 200, 0.55);
            }
            .floating-chat-btn .chat-badge {
                position: absolute;
                top: -2px;
                right: -2px;
                background: #ef4444;
                color: white;
                font-size: 0.72rem;
                font-weight: 700;
                padding: 2px 7px;
                border-radius: 12px;
                border: 2px solid white;
                display: none;
            }

            .chat-drawer-overlay {
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.4);
                backdrop-filter: blur(3px);
                z-index: 99991;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            .chat-drawer-overlay.active {
                opacity: 1;
                visibility: visible;
            }

            .chat-drawer {
                position: fixed;
                top: 0;
                right: 0;
                width: 420px;
                max-width: 100vw;
                height: 100vh;
                background: white;
                z-index: 99992;
                box-shadow: -8px 0 32px rgba(0,0,0,0.15);
                display: flex;
                flex-direction: column;
                transform: translateX(100%);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .chat-drawer.active {
                transform: translateX(0);
            }

            .chat-header {
                padding: 18px 20px;
                background: linear-gradient(135deg, #2b3a58 0%, #465a82 40%, #80A1D4 100%);
                color: white;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .chat-header-info h3 {
                margin: 0;
                font-size: 1.05rem;
                font-weight: 700;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .chat-header-info p {
                margin: 4px 0 0 0;
                font-size: 0.78rem;
                color: #e2e8f0;
            }
            .chat-header-actions {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .chat-btn-subtle {
                background: rgba(255,255,255,0.18);
                border: none;
                color: white;
                padding: 4px 10px;
                border-radius: 6px;
                font-size: 0.75rem;
                cursor: pointer;
                transition: background 0.2s ease;
            }
            .chat-btn-subtle:hover { background: rgba(255,255,255,0.3); }

            .chat-close-btn {
                background: rgba(255,255,255,0.18);
                border: none;
                color: white;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s ease;
            }
            .chat-close-btn:hover { background: rgba(255,255,255,0.3); }

            .chat-body {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                background: #F7F4EA;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }

            .chat-msg {
                display: flex;
                flex-direction: column;
                max-width: 82%;
                gap: 4px;
            }
            .chat-msg.sent {
                align-self: flex-end;
                align-items: flex-end;
            }
            .chat-msg.received {
                align-self: flex-start;
                align-items: flex-start;
            }

            .chat-msg-author {
                font-size: 0.72rem;
                font-weight: 600;
                color: #475569;
                padding: 0 4px;
            }
            .chat-msg-bubble {
                padding: 12px 16px;
                border-radius: 14px;
                font-size: 0.88rem;
                line-height: 1.45;
                word-break: break-word;
                box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            }
            .chat-msg.sent .chat-msg-bubble {
                background: #80A1D4;
                color: white;
                border-bottom-right-radius: 2px;
            }
            .chat-msg.received .chat-msg-bubble {
                background: white;
                color: #1e293b;
                border: 1px solid #DED9E2;
                border-bottom-left-radius: 2px;
            }

            .chat-msg-time {
                font-size: 0.65rem;
                color: #94a3b8;
                margin-top: 2px;
            }

            .chat-attachment-card {
                margin-top: 8px;
                padding: 8px 12px;
                border-radius: 8px;
                background: rgba(0,0,0,0.06);
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.78rem;
                text-decoration: none;
                color: inherit;
            }
            .chat-msg.sent .chat-attachment-card {
                background: rgba(255,255,255,0.2);
                color: white;
            }

            .chat-footer {
                padding: 16px;
                background: white;
                border-top: 1px solid #DED9E2;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .chat-file-preview {
                display: none;
                align-items: center;
                justify-content: space-between;
                background: #F7F4EA;
                border: 1px solid #C0B9DD;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 0.78rem;
                color: #2b3a58;
            }

            .chat-input-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .chat-input {
                flex: 1;
                border: 1px solid #DED9E2;
                border-radius: 20px;
                padding: 10px 16px;
                font-size: 0.88rem;
                outline: none;
                transition: border 0.2s ease;
            }
            .chat-input:focus { border-color: #80A1D4; }
            .chat-icon-btn {
                background: #f1f5f9;
                border: none;
                color: #475569;
                width: 38px;
                height: 38px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }
            .chat-icon-btn:hover { background: #DED9E2; color: #1e293b; }
            .chat-send-btn {
                background: #80A1D4;
                color: white;
                border: none;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(128, 161, 212, 0.4);
                transition: all 0.2s ease;
            }
            .chat-send-btn:hover { background: #6888bc; transform: scale(1.05); }
        `;
        document.head.appendChild(style);

        // Botão Flutuante
        chatBtn = document.createElement('button');
        chatBtn.id = 'btnFloatingChatJuridico';
        chatBtn.className = 'floating-chat-btn';
        chatBtn.title = 'Falar com a Interface Jurídica / Gerência';
        chatBtn.innerHTML = `
            <img src="assets/img/chat_cat_icon.svg" alt="Chat Logo" style="width: 53px; height: 53px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); display: block;" />
            <span class="chat-badge" id="chatJuridicoBadge">0</span>
        `;
        document.body.appendChild(chatBtn);

        // Overlay
        chatOverlay = document.createElement('div');
        chatOverlay.className = 'chat-drawer-overlay';
        document.body.appendChild(chatOverlay);

        // Drawer
        chatDrawer = document.createElement('div');
        chatDrawer.className = 'chat-drawer';
        chatDrawer.innerHTML = `
            <div class="chat-header">
                <div class="chat-header-info">
                    <h3 style="display: flex; align-items: center; gap: 8px;">
                        <img src="assets/img/chat_cat_icon.svg" alt="Chat Logo" style="width: 50px; height: 50px; display: inline-block; vertical-align: middle;" />
                        Canal de Comunicação
                    </h3>
                    <div style="margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.75rem; color: #e2e8f0; font-weight: 600;">Para:</span>
                        <select id="chatDestinatarioSelect" style="background: rgba(255,255,255,0.25); color: white; border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; padding: 2px 8px; font-size: 0.78rem; font-weight: 600; outline: none; cursor: pointer;">
                            <option value="juridico" style="color: #0f172a;">Interface Jurídica</option>
                            <option value="gerente" style="color: #0f172a;">Gerência de Posturas</option>
                        </select>
                    </div>
                </div>
                <div class="chat-header-actions">
                    <button type="button" class="chat-btn-subtle" id="btnAlternarListaChat" style="display:none;">&larr; Conversas</button>
                    <button class="chat-close-btn" id="btnFecharChatJuridico">&times;</button>
                </div>
            </div>
            <div class="chat-body" id="chatJuridicoMensagens">
                <div style="text-align:center; color:#94a3b8; font-size:0.85rem; margin-top:40px;">
                    Carregando conversas...
                </div>
            </div>
            <div class="chat-footer" id="chatJuridicoFooter">
                <div class="chat-file-preview" id="chatFilePreview">
                    <span id="chatFileName">arquivo.pdf</span>
                    <button type="button" style="border:none; background:none; color:#ef4444; cursor:pointer; font-weight:700;" id="btnRemoverAnexoChat">&times;</button>
                </div>
                <div class="chat-input-row">
                    <input type="file" id="inputAnexoChat" style="display:none;">
                    <button type="button" class="chat-icon-btn" id="btnAnexoChat" title="Anexar arquivo">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                        </svg>
                    </button>
                    <input type="text" class="chat-input" id="inputTextoChat" placeholder="Escreva uma mensagem..." autocomplete="off">
                    <button type="button" class="chat-send-btn" id="btnEnviarMsgChat" title="Enviar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(chatDrawer);

        // Eventos
        chatBtn.addEventListener('click', abrirChat);
        chatOverlay.addEventListener('click', fecharChat);
        document.getElementById('btnFecharChatJuridico').addEventListener('click', fecharChat);
        document.getElementById('btnAlternarListaChat').addEventListener('click', carregarListaConversas);

        const inputAnexo = document.getElementById('inputAnexoChat');
        document.getElementById('btnAnexoChat').addEventListener('click', () => inputAnexo.click());
        inputAnexo.addEventListener('change', tratarAnexoSelecionado);
        document.getElementById('btnRemoverAnexoChat').addEventListener('click', removerAnexoSelecionado);

        document.getElementById('btnEnviarMsgChat').addEventListener('click', enviarMensagem);
        document.getElementById('inputTextoChat').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                enviarMensagem();
            }
        });
    }

    // ── Tratar anexo selecionado ──────────────────────────────────────────
    function tratarAnexoSelecionado(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            alert('O arquivo não pode exceder 10MB.');
            e.target.value = '';
            return;
        }

        selectedFileAttachment = file;
        document.getElementById('chatFileName').textContent = file.name;
        document.getElementById('chatFilePreview').style.display = 'flex';
    }

    function removerAnexoSelecionado() {
        selectedFileAttachment = null;
        document.getElementById('inputAnexoChat').value = '';
        document.getElementById('chatFilePreview').style.display = 'none';
    }

    // ── Carregar Lista de Conversas (Histórico Geral) ────────────────────
    async function carregarListaConversas() {
        modoListaConversas = true;
        const container = document.getElementById('chatJuridicoMensagens');
        const footer = document.getElementById('chatJuridicoFooter');
        const btnAlternar = document.getElementById('btnAlternarListaChat');
        const headerSub = document.getElementById('chatHeaderSub');

        if (footer) footer.style.display = 'none';
        if (btnAlternar) btnAlternar.style.display = 'none';
        if (headerSub) headerSub.textContent = 'Histórico de Conversas';

        container.innerHTML = `
            <div style="text-align:center; color:#64748b; font-size:0.85rem; margin-top:40px;">
                Buscando histórico de conversas...
            </div>
        `;

        try {
            let conversas = [];

            // 1. Tentar buscar da tabela chats_interface_juridica
            try {
                const { data: resTable } = await supabaseClient
                    .from('chats_interface_juridica')
                    .select('*')
                    .order('updated_at', { ascending: false });

                if (resTable && resTable.length > 0) {
                    conversas = resTable.map(c => ({
                        processo_id: c.processo_id,
                        notificacao_id: c.notificacao_id,
                        solicitante_nome: c.solicitante_nome,
                        solicitante_cargo: c.solicitante_cargo,
                        mensagens: c.mensagens || [],
                        updated_at: c.updated_at
                    }));
                }
            } catch (e) { }

            // 2. Tentar buscar da tabela processos (dados.chat_juridico) apenas se a tabela principal não retornar nada
            if (conversas.length === 0) {
                const { data: procs } = await supabaseClient
                    .from('processos')
                    .select('id, numero_processo, dados, updated_at')
                    .order('updated_at', { ascending: false });

                (procs || []).forEach(p => {
                    const chatObj = p?.chat_juridico || p?.dados?.chat_juridico;
                    const msgs = chatObj?.mensagens || [];
                    if (msgs.length > 0) {
                        const jaExiste = conversas.some(c => c.processo_id === p.id);
                        if (!jaExiste) {
                            conversas.push({
                                processo_id: p.id,
                                numero_processo: p.numero_processo,
                                mensagens: msgs,
                                updated_at: chatObj?.updated_at || p.updated_at
                            });
                        } else {
                            // Atribui número do processo se faltar
                            const item = conversas.find(c => c.processo_id === p.id);
                            if (item && !item.numero_processo) item.numero_processo = p.numero_processo;
                        }
                    }
                });
            }

            if (conversas.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; color:#64748b; font-size:0.85rem; margin-top:40px; padding:0 20px;">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" style="margin-bottom:12px;">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <p style="font-weight:600; color:#334155; margin-bottom:4px;">Nenhuma conversa iniciada</p>
                        <p style="font-size:0.78rem;">As conversas sobre os processos com a Interface Jurídica e Gerência aparecerão aqui.</p>
                    </div>
                `;
                return;
            }

            const html = conversas.map(conv => {
                const ultMsg = conv.mensagens[conv.mensagens.length - 1] || {};
                const numProc = conv.numero_processo || 'Processo';
                const dataFmt = ultMsg.created_at ? new Date(ultMsg.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
                const autor = ultMsg.sender_nome || 'Usuário';

                return `
                    <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:14px; box-shadow:0 1px 3px rgba(0,0,0,0.04); display:flex; flex-direction:column; gap:8px; cursor:pointer; transition:all 0.2s;"
                         onclick="window.location.href='etapa.html?processo=${conv.processo_id}&chat=1${conv.notificacao_id ? '&notificacao=' + conv.notificacao_id : ''}'">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:700; font-size:0.88rem; color:#1e1b4b;">Proc: ${numProc}</span>
                            <span style="font-size:0.7rem; color:#94a3b8;">${dataFmt}</span>
                        </div>
                        <div style="font-size:0.82rem; color:#475569; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
                            <strong>${autor}:</strong> ${ultMsg.texto || (ultMsg.anexos?.length ? '📎 [Arquivo Anexo]' : '')}
                        </div>
                        <div style="display:flex; justify-content:flex-end; margin-top:4px;">
                            <span style="background:#80A1D4; color:white; font-size:0.72rem; font-weight:600; padding:4px 10px; border-radius:6px;">
                                Ver Chat &rarr;
                            </span>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = html;

        } catch (err) {
            console.error('Erro ao carregar lista de conversas:', err);
            container.innerHTML = `<div style="color:#ef4444; font-size:0.8rem; text-align:center;">Erro ao carregar histórico.</div>`;
        }
    }

    // ── Carregar histórico de mensagens de um processo ────────────────────
    async function carregarMensagensChat() {
        if (!currentProcessoId) {
            carregarListaConversas();
            return;
        }

        modoListaConversas = false;
        const container = document.getElementById('chatJuridicoMensagens');
        const footer = document.getElementById('chatJuridicoFooter');
        const btnAlternar = document.getElementById('btnAlternarListaChat');
        const headerSub = document.getElementById('chatHeaderSub');

        if (footer) footer.style.display = 'flex';
        if (btnAlternar) btnAlternar.style.display = 'inline-block';
        if (headerSub) headerSub.textContent = 'Gerente de Interface Jurídica';

        const perfil = await getPerfilAtualAsync();

        try {
            let chatData = null;

            // 1. Tentar ler da tabela dedicada
            try {
                const { data: resTable, error: errTable } = await supabaseClient
                    .from('chats_interface_juridica')
                    .select('*')
                    .eq('processo_id', currentProcessoId)
                    .maybeSingle();

                if (!errTable && resTable) {
                    chatData = resTable;
                }
            } catch (eTable) { }

            // 2. Fallback para processos.dados.chat_juridico
            if (!chatData) {
                const { data: procData } = await supabaseClient
                    .from('processos')
                    .select('dados')
                    .eq('id', currentProcessoId)
                    .maybeSingle();

                chatData = procData?.dados?.chat_juridico || null;
            }

            currentChatData = chatData;
            const mensagens = chatData?.mensagens || [];

            if (mensagens.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; color:#64748b; font-size:0.85rem; margin-top:40px; padding:0 20px;">
                        <p style="font-weight:600; color:#334155; margin-bottom:4px;">Nenhuma mensagem ainda</p>
                        <p style="font-size:0.78rem;">Inicie a conversa com o Gerente de Interface Jurídica sobre este processo.</p>
                    </div>
                `;
                return;
            }

            const html = mensagens.map(msg => {
                const eMinha = (msg.sender_id && msg.sender_id === perfil.id) || (msg.sender_nome === perfil.nome);
                const dataFmt = msg.created_at ? new Date(msg.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
                const autorNome = msg.sender_nome && msg.sender_nome !== 'Usuário' ? msg.sender_nome : (eMinha ? (perfil.nome || 'Fiscal') : 'Atendimento');
                const tagDestino = msg.destinatario === 'gerente' ? 'Gerência' : 'Jurídico';

                let anexoHtml = '';
                if (msg.anexos && msg.anexos.length > 0) {
                    anexoHtml = msg.anexos.map(anexo => `
                        <a href="${anexo.url}" target="_blank" class="chat-attachment-card" download="${anexo.nome}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">${anexo.nome}</span>
                        </a>
                    `).join('');
                }

                return `
                    <div class="chat-msg ${eMinha ? 'sent' : 'received'}">
                        <div class="chat-msg-author">${autorNome} (${msg.sender_cargo || 'Fiscal'}) &bull; <span style="opacity:0.8; font-size:0.68rem;">Para: ${tagDestino}</span></div>
                        <div class="chat-msg-bubble">
                            <div>${msg.texto || ''}</div>
                            ${anexoHtml}
                        </div>
                        <div class="chat-msg-time">${dataFmt}</div>
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
            container.scrollTop = container.scrollHeight;

        } catch (err) {
            console.error('Erro ao carregar chat:', err);
            container.innerHTML = `<div style="color:#ef4444; font-size:0.8rem; text-align:center;">Erro ao carregar mensagens.</div>`;
        }
    }

    // ── Enviar mensagem ──────────────────────────────────────────────────
    async function enviarMensagem() {
        const inputTexto = document.getElementById('inputTextoChat');
        const texto = inputTexto.value.trim();

        if (!texto && !selectedFileAttachment) return;
        if (!currentProcessoId) {
            alert('Aguarde o carregamento do processo.');
            return;
        }

        const perfil = await getPerfilAtualAsync();
        let anexos = [];

        // Converte anexo se houver
        if (selectedFileAttachment) {
            try {
                const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(selectedFileAttachment);
                });

                anexos.push({
                    nome: selectedFileAttachment.name,
                    url: base64,
                    tipo: selectedFileAttachment.type
                });
            } catch (e) {
                console.error('Erro ao ler anexo:', e);
            }
        }

        const nomeRemetente = perfil.nome && perfil.nome !== 'Usuário' ? perfil.nome : 'Luiza';
        const isGerente = (perfil.cargo && perfil.cargo.toLowerCase().includes('interface')) || (perfil.cargo && perfil.cargo.toLowerCase().includes('gerente'));
        const destinatarioVal = document.getElementById('chatDestinatarioSelect')?.value || 'juridico';
        const nomeDestinatarioRotulo = (destinatarioVal === 'gerente') ? 'Gerência de Posturas' : 'Interface Jurídica';

        const novaMensagem = {
            id: crypto.randomUUID(),
            sender_id: perfil.id || null,
            sender_nome: nomeRemetente,
            sender_cargo: perfil.cargo || 'Fiscal de Postura',
            destinatario: destinatarioVal,
            texto: texto,
            anexos: anexos,
            created_at: new Date().toISOString()
        };

        inputTexto.value = '';
        removerAnexoSelecionado();

        try {
            // Obter processo para dados de número e notificação
            const { data: proc } = await supabaseClient
                .from('processos')
                .select('*')
                .eq('id', currentProcessoId)
                .single();

            const numProcesso = proc?.numero_processo || 'Processo';

            // 1. Tentar salvar via tabela chats_interface_juridica
            let salvouTabela = false;
            let mensagensAtuais = [];

            try {
                const { data: resTable } = await supabaseClient
                    .from('chats_interface_juridica')
                    .select('*')
                    .eq('processo_id', currentProcessoId)
                    .maybeSingle();

                mensagensAtuais = resTable?.mensagens || proc?.dados?.chat_juridico?.mensagens || [];
                mensagensAtuais.push(novaMensagem);

                if (resTable) {
                    const { error: errUpd } = await supabaseClient
                        .from('chats_interface_juridica')
                        .update({
                            mensagens: mensagensAtuais,
                            lida_gerente: isGerente ? true : false,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', resTable.id);
                    if (!errUpd) salvouTabela = true;
                } else {
                    const { error: errIns } = await supabaseClient
                        .from('chats_interface_juridica')
                        .insert({
                            processo_id: currentProcessoId,
                            notificacao_id: currentNotificacaoId || null,
                            solicitante_id: perfil.id || null,
                            solicitante_nome: nomeRemetente,
                            solicitante_cargo: perfil.cargo,
                            mensagens: mensagensAtuais,
                            lida_gerente: isGerente ? true : false
                        });
                    if (!errIns) salvouTabela = true;
                }
            } catch (eDB) {
                console.warn('Fallback silencioso de persistência JSONB do chat:', eDB);
            }

            if (!salvouTabela && mensagensAtuais.length === 0) {
                mensagensAtuais = proc?.dados?.chat_juridico?.mensagens || [];
                mensagensAtuais.push(novaMensagem);
            }

            // Fallback para persistir dentro de dados.chat_juridico
            const dadosAtualizados = proc.dados || {};
            dadosAtualizados.chat_juridico = {
                mensagens: mensagensAtuais,
                updated_at: new Date().toISOString()
            };

            // Adicionar Notificação do Sistema para o destinatário correto
            dadosAtualizados.notificacoes_menu = dadosAtualizados.notificacoes_menu || [];

            let destinatarioCargo = 'Fiscal de Postura';
            let tituloNotif = 'Nova mensagem no Chat';

            if (isGerente) {
                destinatarioCargo = 'Fiscal de Postura';
                tituloNotif = (destinatarioVal === 'gerente') ? 'Resposta da Gerência' : 'Resposta da Interface Jurídica';
            } else {
                if (destinatarioVal === 'gerente') {
                    destinatarioCargo = 'Gerente';
                    tituloNotif = 'Nova mensagem para a Gerência';
                } else {
                    destinatarioCargo = 'Gerente de Interface Jurídica';
                    tituloNotif = 'Nova mensagem no Chat Jurídico';
                }
            }

            dadosAtualizados.notificacoes_menu.push({
                id: crypto.randomUUID(),
                tipo: 'chat_juridico',
                titulo: tituloNotif,
                mensagem: `${nomeRemetente} (${perfil.cargo || 'Usuário'}) para [${nomeDestinatarioRotulo}]: "${texto.slice(0, 50)}${texto.length > 50 ? '...' : ''}"`,
                processo_id: currentProcessoId,
                numero_processo: numProcesso,
                notificacao_id: currentNotificacaoId || null,
                destinatario_cargo: destinatarioCargo,
                lida: false,
                created_at: new Date().toISOString()
            });

            await supabaseClient
                .from('processos')
                .update({ dados: dadosAtualizados })
                .eq('id', currentProcessoId);

            // Recarregar chat
            await carregarMensagensChat();

        } catch (err) {
            console.error('Erro ao enviar mensagem:', err);
            alert('Não foi possível enviar a mensagem.');
        }
    }

    // ── Abrir/Fechar Chat Drawer ──────────────────────────────────────────
    async function abrirChat() {
        if (!chatDrawer) injectChatElements();
        chatOverlay.classList.add('active');
        chatDrawer.classList.add('active');
        await getPerfilAtualAsync();

        if (currentProcessoId) {
            carregarMensagensChat();
        } else {
            carregarListaConversas();
        }

        // Inicia sincronização suave a cada 8 segundos (apenas se a página estiver visível)
        if (!syncInterval) {
            syncInterval = setInterval(() => {
                if (document.hidden) return;
                if (modoListaConversas) {
                    carregarListaConversas();
                } else if (currentProcessoId) {
                    carregarMensagensChat();
                }
            }, 8000);
        }
    }

    function fecharChat() {
        if (!chatDrawer) return;
        chatOverlay.classList.remove('active');
        chatDrawer.classList.remove('active');
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
    }

    // ── Inicialização ─────────────────────────────────────────────────────
    async function init() {
        injectChatElements();
        await getPerfilAtualAsync();

        currentProcessoId = getParamURL('processo');
        currentNotificacaoId = getParamURL('notificacao');

        // Se a URL contiver chat=1, abre automaticamente o chat
        if (getParamURL('chat') === '1') {
            setTimeout(abrirChat, 400);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

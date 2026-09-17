#!/usr/bin/env node
/* ============================================================================
   MIGRAÇÃO DE ANEXOS: base64 no banco → Cloudinary

   Tira os arquivos de Anexo AR e Multa que estão gravados como base64 dentro do
   banco e troca cada um por um link do Cloudinary — sem perder nenhum.

   Cada documento passa por esta ordem, e a etapa seguinte só acontece se a
   anterior foi confirmada:
     1. Lê o base64 do banco e grava DUAS cópias locais em migracao/backup/:
        o texto original exato e o arquivo decodificado (para abrir e conferir).
     2. Relê as cópias do disco e confere o hash SHA-256 de cada uma.
     3. Envia o arquivo para o Cloudinary.
     4. Baixa o arquivo de volta do Cloudinary e confere se é idêntico, byte a
        byte (mesmo SHA-256 do original).
     5. Pede ao banco para trocar o base64 pelo link. O próprio banco confere que
        ainda guarda exatamente o conteúdo copiado; se mudou, recusa.
     6. Relê o banco e confirma que o link está lá.
   Qualquer resultado inesperado PARA a execução inteira.

   Comandos:
     node migracao/migrar_anexos.mjs autoteste     testa a lógica, sem rede
     node migracao/migrar_anexos.mjs conferir      faz o backup local; NÃO altera nada
     node migracao/migrar_anexos.mjs migrar --limite 5
     node migracao/migrar_anexos.mjs migrar        migra todos os que têm backup
     node migracao/migrar_anexos.mjs status        resumo do manifesto, sem rede
     node migracao/migrar_anexos.mjs reverter --id <uuid>
     node migracao/migrar_anexos.mjs reverter --todos

   Login: usa MIGRACAO_CPF e MIGRACAO_SENHA do ambiente, ou pergunta na hora.
   Requer Node 18 ou mais novo. Não precisa instalar nada.
   ============================================================================ */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const RAIZ_PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TIPOS_MIGRADOS = ['Anexo AR', 'Multa'];
// Mesmas pastas usadas pelos uploads novos (etapa.js), para ficar tudo junto
const PASTA_CLOUDINARY = { 'Anexo AR': 'Fluxograma/anexos_ar', 'Multa': 'Fluxograma/multas' };
// Limite por arquivo no plano gratuito do Cloudinary
const LIMITE_BYTES_CLOUDINARY = 10 * 1024 * 1024;
// Pausa entre documentos, para não pesar num banco que já anda no limite
const PAUSA_ENTRE_ITENS_MS = 300;

const EXTENSAO_POR_MIME = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/heic': 'heic'
};

// ── Utilitários ─────────────────────────────────────────────────────────────

const sha256 = (conteudo) => createHash('sha256').update(conteudo).digest('hex');
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const agora = () => new Date().toISOString();
const formatarBytes = (n) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`;

function caminhosBackup(pastaBackup) {
    return {
        pasta: pastaBackup,
        arquivos: path.join(pastaBackup, 'arquivos'),
        originais: path.join(pastaBackup, 'originais'),
        manifesto: path.join(pastaBackup, 'manifesto.json')
    };
}

// ── Decodificação e validação do base64 ─────────────────────────────────────

/**
 * Decodifica um data URL base64 e prova que a decodificação foi exata.
 * O Buffer do Node ignora caracteres inválidos em silêncio, então um base64
 * corrompido viraria um arquivo corrompido sem nenhum aviso. Para evitar isso:
 * só aceita o alfabeto base64 e exige que recodificar devolva o mesmo texto.
 */
export function decodificarDataUrl(dataUrl) {
    const m = /^data:([^,]*?),(.*)$/s.exec(dataUrl || '');
    if (!m) return { erro: 'não é um data URL válido' };

    const partes = m[1].split(';');
    const ehBase64 = partes.slice(1).some(p => p.trim().toLowerCase() === 'base64');
    if (!ehBase64) return { erro: 'data URL sem ";base64" (formato não suportado)' };

    const mime = (partes[0] || '').trim().toLowerCase() || 'application/octet-stream';
    const payload = m[2].replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) return { erro: 'base64 com caracteres inválidos' };

    const bytes = Buffer.from(payload, 'base64');
    if (bytes.length === 0) return { erro: 'arquivo vazio' };

    const semPreenchimento = (s) => s.replace(/=+$/, '');
    if (semPreenchimento(bytes.toString('base64')) !== semPreenchimento(payload)) {
        return { erro: 'base64 corrompido (recodificar não devolve o mesmo texto)' };
    }
    return { mime, bytes };
}

/** Confere se o começo do arquivo combina com o tipo declarado. Só informa, não bloqueia. */
export function assinaturaConfere(mime, bytes) {
    if (mime === 'application/pdf') return bytes.subarray(0, 4).toString('latin1') === '%PDF';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
    if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
    return null; // tipo sem assinatura conhecida
}

function extensaoDoArquivo(mime, nomeArquivo) {
    if (EXTENSAO_POR_MIME[mime]) return EXTENSAO_POR_MIME[mime];
    const doNome = /\.([a-z0-9]{2,5})$/i.exec(nomeArquivo || '');
    return doNome ? doNome[1].toLowerCase() : 'bin';
}

// ── Cópias em disco que nunca sobrescrevem ──────────────────────────────────

/**
 * Grava uma cópia e confere lendo de volta do disco.
 * A flag 'wx' faz o próprio sistema operacional recusar a gravação se o arquivo
 * já existir — uma cópia de backup nunca é substituída. Se já existe com o mesmo
 * conteúdo (rodada anterior), reaproveita; se existe com conteúdo diferente,
 * mantém a antiga e grava a nova com outro nome.
 */
export async function guardarCopia(caminho, conteudo, sha256Esperado) {
    let destino = caminho;
    try {
        await fs.writeFile(destino, conteudo, { flag: 'wx' });
    } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        const existente = await fs.readFile(destino);
        if (sha256(existente) !== sha256Esperado) {
            destino = caminho.replace(/(\.[^./]+)$/, `.${Date.now()}$1`);
            await fs.writeFile(destino, conteudo, { flag: 'wx' });
        }
    }
    const relido = await fs.readFile(destino);
    if (sha256(relido) !== sha256Esperado) {
        throw new Error(`A cópia gravada em disco não confere com o original: ${destino}`);
    }
    return destino;
}

// ── Manifesto: o registro de cada documento, gravado a cada passo ───────────

async function lerManifesto(caminhos) {
    try {
        return JSON.parse(await fs.readFile(caminhos.manifesto, 'utf8'));
    } catch (e) {
        if (e.code === 'ENOENT') return { criado_em: agora(), documentos: {} };
        throw new Error(`Não foi possível ler o manifesto (${caminhos.manifesto}): ${e.message}`);
    }
}

// Grava em arquivo temporário e renomeia: se o processo cair no meio, o
// manifesto anterior continua inteiro.
async function salvarManifesto(caminhos, manifesto) {
    manifesto.atualizado_em = agora();
    const temporario = `${caminhos.manifesto}.tmp`;
    await fs.writeFile(temporario, JSON.stringify(manifesto, null, 2));
    await fs.rename(temporario, caminhos.manifesto);
}

function registrar(item, evento) {
    item.historico = item.historico || [];
    item.historico.push({ quando: agora(), evento });
}

// ── Configuração e login ────────────────────────────────────────────────────

async function carregarConfiguracao() {
    const supabase = await fs.readFile(path.join(RAIZ_PROJETO, 'assets/js/supabase-config.js'), 'utf8');
    const cloudinary = await fs.readFile(path.join(RAIZ_PROJETO, 'assets/js/cloudinary-config.js'), 'utf8');
    const extrair = (texto, regex) => (regex.exec(texto) || [])[1];

    const cfg = {
        supabaseUrl: process.env.SUPABASE_URL || extrair(supabase, /SUPABASE_URL\s*=\s*'([^']+)'/),
        supabaseKey: process.env.SUPABASE_ANON_KEY || extrair(supabase, /SUPABASE_KEY\s*=\s*'([^']+)'/),
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || extrair(cloudinary, /CLOUDINARY_CLOUD_NAME\s*\|\|\s*'([^']+)'/),
        uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || extrair(cloudinary, /CLOUDINARY_UPLOAD_PRESET\s*\|\|\s*'([^']+)'/),
        // Só muda em teste, para apontar para um servidor simulado
        cloudinaryApi: process.env.CLOUDINARY_API_BASE || 'https://api.cloudinary.com'
    };
    for (const [chave, valor] of Object.entries(cfg)) {
        if (!valor) throw new Error(`Configuração não encontrada: ${chave}`);
    }
    return cfg;
}

function perguntar(pergunta, { oculto = false } = {}) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        if (oculto) {
            process.stdout.write(pergunta);
            rl._writeToOutput = () => {}; // não ecoa a senha
            rl.question('', (resposta) => { rl.close(); process.stdout.write('\n'); resolve(resposta); });
        } else {
            rl.question(pergunta, (resposta) => { rl.close(); resolve(resposta); });
        }
    });
}

class ClienteSupabase {
    constructor(cfg) {
        this.url = cfg.supabaseUrl;
        this.chave = cfg.supabaseKey;
    }

    guardarSessao(corpo) {
        this.token = corpo.access_token;
        this.refreshToken = corpo.refresh_token;
        this.expiraEm = Date.now() + (corpo.expires_in || 3600) * 1000;
    }

    async entrar() {
        const cpf = (process.env.MIGRACAO_CPF || await perguntar('CPF do usuário: ')).replace(/\D/g, '');
        const senha = process.env.MIGRACAO_SENHA || await perguntar('Senha: ', { oculto: true });

        const resp = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { apikey: this.chave, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: `${cpf}@email.com`, password: senha })
        });
        const corpo = await resp.json().catch(() => ({}));
        if (!resp.ok || !corpo.access_token) {
            throw new Error(`Falha no login: ${corpo.error_description || corpo.msg || `HTTP ${resp.status}`}`);
        }
        this.guardarSessao(corpo);
    }

    // A migração completa pode passar de uma hora; renova a sessão antes de expirar
    async garantirSessao() {
        if (Date.now() < this.expiraEm - 5 * 60 * 1000) return;
        const resp = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { apikey: this.chave, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: this.refreshToken })
        });
        const corpo = await resp.json().catch(() => ({}));
        if (!resp.ok || !corpo.access_token) throw new Error('Não foi possível renovar a sessão. Rode de novo para continuar de onde parou.');
        this.guardarSessao(corpo);
    }

    async requisitar(caminho, opcoes = {}) {
        await this.garantirSessao();
        const resp = await fetch(`${this.url}${caminho}`, {
            ...opcoes,
            headers: { apikey: this.chave, Authorization: `Bearer ${this.token}`, ...(opcoes.headers || {}) }
        });
        const texto = await resp.text();
        let corpo = null;
        try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} em ${caminho.split('?')[0]}: ${corpo?.message || String(texto).slice(0, 300)}`);
        }
        return corpo;
    }

    // Lista sem a coluna url: é a coluna pesada, e aqui só precisamos dos ids
    async listarDocumentos() {
        const tipos = TIPOS_MIGRADOS.map(t => `"${t}"`).join(',');
        const todos = [];
        const tamanhoPagina = 500;
        for (let inicio = 0; ; inicio += tamanhoPagina) {
            const consulta = [
                // processos(numero_processo) lê só essa coluna, sem tocar em `dados`
                'select=id,tipo,nome_arquivo,processo_id,created_at,processos(numero_processo)',
                `tipo=in.(${encodeURIComponent(tipos)})`,
                'order=created_at.asc,id.asc',
                `limit=${tamanhoPagina}`,
                `offset=${inicio}`
            ].join('&');
            const pagina = await this.requisitar(`/rest/v1/documentos?${consulta}`);
            todos.push(...pagina);
            if (pagina.length < tamanhoPagina) break;
        }
        return todos;
    }

    // Um documento por vez, para não pedir ao banco dezenas de MB numa consulta só
    async lerUrl(id) {
        const linhas = await this.requisitar(`/rest/v1/documentos?select=url&id=eq.${encodeURIComponent(id)}`);
        if (!Array.isArray(linhas)) throw new Error(`Resposta inesperada ao ler o documento ${id}`);
        return linhas.length === 1 ? { existe: true, url: linhas[0].url } : { existe: false, url: null };
    }

    rpc(nome, argumentos) {
        return this.requisitar(`/rest/v1/rpc/${nome}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(argumentos)
        });
    }

    // Confere que o 01_preparar.sql foi rodado ANTES de enviar qualquer arquivo.
    // Chama a função com um id que não existe: sem efeito nenhum no banco.
    async verificarFuncoesPreparadas() {
        let resposta;
        try {
            resposta = await this.rpc('migracao_anexo_aplicar', {
                p_documento_id: '00000000-0000-0000-0000-000000000000',
                p_sha256_original: 'verificacao',
                p_url_nova: 'https://verificacao.invalid'
            });
        } catch (e) {
            throw new Error(`As funções da migração não estão disponíveis no banco. Rode migracao/01_preparar.sql no SQL Editor. (${e.message})`);
        }
        if (resposta?.status !== 'nao_encontrado') {
            throw new Error(`Resposta inesperada ao verificar as funções da migração: ${JSON.stringify(resposta)}`);
        }
    }
}

// ── Cloudinary ──────────────────────────────────────────────────────────────

async function baixarEConferir(url, sha256Esperado) {
    let motivo = '';
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                motivo = `HTTP ${resp.status} ao baixar`;
            } else {
                const bytes = Buffer.from(await resp.arrayBuffer());
                // Hash diferente não melhora tentando de novo: responde na hora
                return sha256(bytes) === sha256Esperado
                    ? { ok: true }
                    : { ok: false, motivo: `o arquivo baixado é diferente do original (${formatarBytes(bytes.length)})` };
            }
        } catch (e) {
            motivo = e.message;
        }
        await esperar(1000 * tentativa);
    }
    return { ok: false, motivo };
}

/**
 * Envia e confere. Imagens vão primeiro como `image` (igual aos uploads novos do
 * sistema) e PDFs como `auto`. Se o arquivo baixado de volta não for idêntico
 * — por exemplo, se o Cloudinary alterar algum byte da imagem — tenta como `raw`,
 * que entrega exatamente os bytes enviados. Só aceita um envio que passou na conferência.
 */
async function enviarParaCloudinary(cfg, item, bytes) {
    const tiposRecurso = item.mime.startsWith('image/') ? ['image', 'raw'] : ['auto', 'raw'];
    const falhas = [];

    for (const tipoRecurso of tiposRecurso) {
        const formulario = new FormData();
        formulario.append('file', new Blob([bytes], { type: item.mime }), `${item.id}.${item.extensao}`);
        formulario.append('upload_preset', cfg.uploadPreset);
        formulario.append('folder', PASTA_CLOUDINARY[item.tipo]);

        let corpo = {};
        try {
            const resp = await fetch(`${cfg.cloudinaryApi}/v1_1/${cfg.cloudName}/${tipoRecurso}/upload`, {
                method: 'POST',
                body: formulario
            });
            corpo = await resp.json().catch(() => ({}));
            if (!resp.ok || !corpo.secure_url) {
                falhas.push(`${tipoRecurso}: ${corpo?.error?.message || `HTTP ${resp.status}`}`);
                continue;
            }
        } catch (e) {
            falhas.push(`${tipoRecurso}: ${e.message}`);
            continue;
        }

        const conferencia = await baixarEConferir(corpo.secure_url, item.sha256_arquivo);
        if (conferencia.ok) return { url: corpo.secure_url, tipoRecurso };
        falhas.push(`${tipoRecurso}: enviado, mas ${conferencia.motivo}`);
    }
    return { falhas };
}

// ── Comando: conferir (backup local, não altera nada) ───────────────────────

async function comandoConferir(caminhos) {
    const cfg = await carregarConfiguracao();
    const cliente = new ClienteSupabase(cfg);
    await cliente.entrar();

    await fs.mkdir(caminhos.arquivos, { recursive: true });
    await fs.mkdir(caminhos.originais, { recursive: true });
    const manifesto = await lerManifesto(caminhos);

    const documentos = await cliente.listarDocumentos();
    console.log(`\n${documentos.length} documentos do tipo ${TIPOS_MIGRADOS.join(' / ')} encontrados.\n`);

    for (const [indice, doc] of documentos.entries()) {
        const rotulo = `[${indice + 1}/${documentos.length}] ${doc.tipo} do processo ${doc.processos?.numero_processo || doc.processo_id}`;
        const anterior = manifesto.documentos[doc.id];

        // Já migrado: não há mais base64 para copiar, e o backup existente é sagrado
        if (anterior?.estado === 'migrado') {
            console.log(`${rotulo} — já migrado, backup preservado`);
            continue;
        }

        const { existe, url } = await cliente.lerUrl(doc.id);
        if (!existe) {
            console.log(`${rotulo} — não existe mais no banco`);
            continue;
        }

        const item = {
            ...(anterior || {}),
            id: doc.id,
            tipo: doc.tipo,
            nome_arquivo: doc.nome_arquivo,
            processo_id: doc.processo_id,
            numero_processo: doc.processos?.numero_processo || null,
            criado_em: doc.created_at
        };
        // Reclassifica do zero: um problema de uma rodada anterior não vale mais
        delete item.problema;

        if (!url) {
            item.estado = 'sem_arquivo';
        } else if (/^https?:\/\//i.test(url)) {
            item.estado = 'ja_em_link';
        } else if (!url.startsWith('data:')) {
            item.estado = 'formato_desconhecido';
        } else {
            // É base64: a cópia do texto original exato é feita SEMPRE,
            // mesmo que o arquivo tenha algum problema e não vá ser migrado.
            const textoOriginal = Buffer.from(url, 'utf8');
            item.sha256_original = sha256(textoOriginal);
            item.tamanho_original = textoOriginal.length;
            item.backup_original = path.relative(caminhos.pasta,
                await guardarCopia(path.join(caminhos.originais, `${doc.id}.txt`), textoOriginal, item.sha256_original));

            const decodificado = decodificarDataUrl(url);
            if (decodificado.erro) {
                item.estado = 'problema';
                item.problema = decodificado.erro;
            } else {
                const { mime, bytes } = decodificado;
                item.mime = mime;
                item.extensao = extensaoDoArquivo(mime, doc.nome_arquivo);
                item.bytes = bytes.length;
                item.sha256_arquivo = sha256(bytes);
                item.assinatura_confere = assinaturaConfere(mime, bytes);
                item.backup_arquivo = path.relative(caminhos.pasta,
                    await guardarCopia(path.join(caminhos.arquivos, `${doc.id}.${item.extensao}`), bytes, item.sha256_arquivo));

                if (bytes.length > LIMITE_BYTES_CLOUDINARY) {
                    item.estado = 'grande_demais';
                    item.problema = `${formatarBytes(bytes.length)} passa do limite de ${formatarBytes(LIMITE_BYTES_CLOUDINARY)} do Cloudinary gratuito`;
                } else if (anterior?.estado === 'enviado' && anterior.sha256_original === item.sha256_original) {
                    item.estado = 'enviado'; // envio anterior continua valendo para este mesmo conteúdo
                } else {
                    item.estado = 'copiado';
                    delete item.url_nova;
                }
            }
        }

        registrar(item, `conferir: ${item.estado}`);
        manifesto.documentos[doc.id] = item;
        await salvarManifesto(caminhos, manifesto);

        const detalhe = item.bytes ? ` (${formatarBytes(item.bytes)}${item.assinatura_confere === false ? ', ⚠ conteúdo não parece ' + item.mime : ''})` : '';
        console.log(`${rotulo} — ${item.estado}${detalhe}${item.problema ? ': ' + item.problema : ''}`);
        await esperar(PAUSA_ENTRE_ITENS_MS);
    }

    imprimirResumo(manifesto);
    console.log(`\nBackup em: ${caminhos.pasta}`);
    console.log('Nada foi alterado no banco nem no Cloudinary.');
}

// ── Comando: migrar ─────────────────────────────────────────────────────────

async function comandoMigrar(caminhos, { limite }) {
    const manifesto = await lerManifesto(caminhos);
    const candidatos = Object.values(manifesto.documentos)
        .filter(i => i.estado === 'copiado' || i.estado === 'enviado')
        .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
    const lote = limite ? candidatos.slice(0, limite) : candidatos;

    if (lote.length === 0) {
        console.log('Nenhum documento pronto para migrar. Rode "conferir" primeiro.');
        return;
    }

    const totalBytes = lote.reduce((s, i) => s + (i.bytes || 0), 0);
    console.log(`\nVão ser migrados ${lote.length} documento(s), ${formatarBytes(totalBytes)} no total.`);
    console.log('Cada um só é trocado no banco depois de conferido no Cloudinary.');
    if ((await perguntar('Digite MIGRAR para continuar: ')).trim() !== 'MIGRAR') {
        console.log('Cancelado. Nada foi alterado.');
        return;
    }

    const cfg = await carregarConfiguracao();
    const cliente = new ClienteSupabase(cfg);
    await cliente.entrar();
    await cliente.verificarFuncoesPreparadas();

    let migrados = 0;
    for (const [indice, item] of lote.entries()) {
        const rotulo = `[${indice + 1}/${lote.length}] ${item.tipo} do processo ${item.numero_processo || item.processo_id}`;

        // 1. O backup precisa estar íntegro AGORA, imediatamente antes de mexer
        const original = await fs.readFile(path.join(caminhos.pasta, item.backup_original));
        const arquivo = await fs.readFile(path.join(caminhos.pasta, item.backup_arquivo));
        if (sha256(original) !== item.sha256_original || sha256(arquivo) !== item.sha256_arquivo) {
            throw new Error(`${rotulo}: o backup local não confere mais com o hash registrado. Parando sem alterar nada.`);
        }

        // 2. Envia e confere (ou reconfere um envio de uma rodada anterior)
        if (item.estado === 'enviado' && item.url_nova) {
            const conferencia = await baixarEConferir(item.url_nova, item.sha256_arquivo);
            if (!conferencia.ok) {
                registrar(item, `envio anterior não confere mais (${conferencia.motivo}); reenviando`);
                item.estado = 'copiado';
                delete item.url_nova;
            }
        }
        if (item.estado === 'copiado') {
            const envio = await enviarParaCloudinary(cfg, item, arquivo);
            if (!envio.url) {
                item.problema = `envio falhou: ${envio.falhas.join(' | ')}`;
                registrar(item, item.problema);
                await salvarManifesto(caminhos, manifesto);
                throw new Error(`${rotulo}: ${item.problema}. Parando; o documento continua intacto no banco.`);
            }
            item.url_nova = envio.url;
            item.tipo_recurso_cloudinary = envio.tipoRecurso;
            item.estado = 'enviado';
            registrar(item, `enviado e conferido no Cloudinary (${envio.tipoRecurso})`);
            await salvarManifesto(caminhos, manifesto);
        }

        // 3. Troca no banco — o banco confere o hash antes de aceitar
        const resultado = await cliente.rpc('migracao_anexo_aplicar', {
            p_documento_id: item.id,
            p_sha256_original: item.sha256_original,
            p_url_nova: item.url_nova
        });

        // 4. Relê o banco para confirmar, qualquer que tenha sido a resposta
        const { existe, url: urlNoBanco } = await cliente.lerUrl(item.id);

        if (resultado?.status === 'migrado' || (resultado?.status === 'nao_esta_em_base64' && urlNoBanco === item.url_nova)) {
            if (urlNoBanco !== item.url_nova) {
                registrar(item, `INCONSISTENTE: a função respondeu ${resultado?.status}, mas o banco não tem o link`);
                await salvarManifesto(caminhos, manifesto);
                throw new Error(`${rotulo}: resposta e banco não batem. Parando para verificação manual.`);
            }
            item.estado = 'migrado';
            item.migrado_em = agora();
            if (resultado.status === 'migrado') {
                item.copias_trocadas = {
                    processos: resultado.copias_processos,
                    notificacoes: resultado.copias_notificacoes,
                    autos_infracao: resultado.copias_autos_infracao
                };
            }
            delete item.problema;
            registrar(item, 'migrado e confirmado no banco');
            migrados++;
            const copias = item.copias_trocadas
                ? Object.entries(item.copias_trocadas).filter(([, n]) => n > 0).map(([t, n]) => `${n} em ${t}`).join(', ')
                : '';
            console.log(`${rotulo} — migrado${copias ? ` (cópias trocadas: ${copias})` : ''}`);
        } else {
            // Recusas conhecidas são seguras: o banco não mudou nada
            item.estado = 'recusado';
            item.problema = !existe ? 'o documento foi apagado do banco'
                : resultado?.status === 'conteudo_diferente_do_backup' ? 'o arquivo no banco mudou depois do backup (rode "conferir" de novo)'
                : `resposta do banco: ${resultado?.status ?? JSON.stringify(resultado)}`;
            registrar(item, `recusado: ${item.problema}`);
            console.log(`${rotulo} — NÃO migrado: ${item.problema}`);
        }

        await salvarManifesto(caminhos, manifesto);
        await esperar(PAUSA_ENTRE_ITENS_MS);
    }

    console.log(`\n${migrados} de ${lote.length} migrado(s) nesta rodada.`);
    imprimirResumo(manifesto);
}

// ── Comando: reverter ───────────────────────────────────────────────────────

async function comandoReverter(caminhos, { id, todos }) {
    const manifesto = await lerManifesto(caminhos);
    const alvos = Object.values(manifesto.documentos)
        .filter(i => i.estado === 'migrado' && (todos || i.id === id));

    if (alvos.length === 0) {
        console.log(id ? `O documento ${id} não está como migrado no manifesto.` : 'Nenhum documento migrado para reverter.');
        return;
    }

    console.log(`\nVão voltar para base64 no banco: ${alvos.length} documento(s).`);
    if ((await perguntar('Digite REVERTER para continuar: ')).trim() !== 'REVERTER') {
        console.log('Cancelado. Nada foi alterado.');
        return;
    }

    const cfg = await carregarConfiguracao();
    const cliente = new ClienteSupabase(cfg);
    await cliente.entrar();
    await cliente.verificarFuncoesPreparadas();

    for (const [indice, item] of alvos.entries()) {
        const rotulo = `[${indice + 1}/${alvos.length}] ${item.tipo} do processo ${item.numero_processo || item.processo_id}`;
        const original = await fs.readFile(path.join(caminhos.pasta, item.backup_original));
        if (sha256(original) !== item.sha256_original) {
            throw new Error(`${rotulo}: o backup local não confere com o hash registrado. Parando.`);
        }

        const resultado = await cliente.rpc('migracao_anexo_reverter', {
            p_documento_id: item.id,
            p_url_nova: item.url_nova,
            p_url_original: original.toString('utf8'),
            p_sha256_original: item.sha256_original
        });

        const { url: urlNoBanco } = await cliente.lerUrl(item.id);
        if (resultado?.status === 'revertido' && urlNoBanco && sha256(Buffer.from(urlNoBanco, 'utf8')) === item.sha256_original) {
            item.estado = 'revertido';
            registrar(item, 'revertido para o base64 original e confirmado no banco');
            console.log(`${rotulo} — revertido`);
        } else {
            registrar(item, `reversão não aplicada: ${resultado?.status ?? JSON.stringify(resultado)}`);
            console.log(`${rotulo} — NÃO revertido: ${resultado?.status ?? 'resposta inesperada'}`);
        }
        await salvarManifesto(caminhos, manifesto);
        await esperar(PAUSA_ENTRE_ITENS_MS);
    }
    imprimirResumo(manifesto);
}

// ── Resumo ──────────────────────────────────────────────────────────────────

function imprimirResumo(manifesto) {
    const itens = Object.values(manifesto.documentos);
    const porEstado = {};
    for (const i of itens) {
        porEstado[i.estado] = porEstado[i.estado] || { qtd: 0, bytes: 0 };
        porEstado[i.estado].qtd++;
        porEstado[i.estado].bytes += i.bytes || 0;
    }
    const descricao = {
        copiado: 'backup feito, prontos para migrar',
        enviado: 'no Cloudinary e conferidos, falta trocar no banco',
        migrado: 'migrados e confirmados',
        recusado: 'recusados pelo banco (intactos)',
        problema: 'com problema no base64 (backup feito, NÃO migram)',
        grande_demais: 'grandes demais para o Cloudinary (backup feito, NÃO migram)',
        ja_em_link: 'já estavam em link',
        sem_arquivo: 'sem arquivo',
        formato_desconhecido: 'formato desconhecido (NÃO migram)',
        revertido: 'revertidos para base64'
    };
    console.log('\nResumo:');
    for (const [estado, { qtd, bytes }] of Object.entries(porEstado)) {
        console.log(`  ${String(qtd).padStart(4)}  ${descricao[estado] || estado}${bytes ? ` — ${formatarBytes(bytes)}` : ''}`);
    }
    const alertas = itens.filter(i => i.problema || i.assinatura_confere === false);
    if (alertas.length > 0) {
        console.log('\nDocumentos que merecem atenção:');
        for (const i of alertas) {
            console.log(`  ${i.tipo} do processo ${i.numero_processo || i.processo_id} (${i.nome_arquivo || 'sem nome'}, id ${i.id}): ${i.problema || `conteúdo não parece ${i.mime}`}`);
        }
    }
}

// ── Comando: autoteste (sem rede) ───────────────────────────────────────────

async function comandoAutoteste() {
    const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'migracao-autoteste-'));
    const caminhos = caminhosBackup(pasta);
    await fs.mkdir(caminhos.arquivos, { recursive: true });
    let falhas = 0;
    const conferir = (descricao, condicao) => {
        console.log(`  ${condicao ? 'ok   ' : 'FALHA'}  ${descricao}`);
        if (!condicao) falhas++;
    };

    try {
        console.log('Decodificação:');
        const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from([0x00, 0xFF, 0x10, 0x80]), Buffer.from('conteúdo ç')]);
        const dataUrlPdf = `data:application/pdf;base64,${pdf.toString('base64')}`;
        const d1 = decodificarDataUrl(dataUrlPdf);
        conferir('PDF válido decodifica para os mesmos bytes', !d1.erro && d1.bytes.equals(pdf));
        conferir('assinatura de PDF reconhecida', assinaturaConfere('application/pdf', d1.bytes) === true);

        const jpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 5]);
        const d2 = decodificarDataUrl(`data:image/jpeg;base64,${jpg.toString('base64')}`);
        conferir('JPEG válido decodifica e tem assinatura reconhecida', !d2.erro && d2.bytes.equals(jpg) && assinaturaConfere('image/jpeg', d2.bytes));

        const comQuebras = `data:application/pdf;base64,${pdf.toString('base64').replace(/(.{8})/g, '$1\n')}`;
        conferir('base64 com quebras de linha é aceito', decodificarDataUrl(comQuebras).bytes?.equals(pdf));

        conferir('caractere inválido no base64 é recusado', !!decodificarDataUrl('data:application/pdf;base64,JVBER!0xLjQ=').erro);
        conferir('base64 truncado é recusado', !!decodificarDataUrl(`data:application/pdf;base64,${pdf.toString('base64').slice(0, -3)}`).erro);
        conferir('data URL sem ;base64 é recusado', !!decodificarDataUrl('data:text/plain,olá').erro);
        conferir('texto que não é data URL é recusado', !!decodificarDataUrl('https://exemplo.com/a.pdf').erro);
        conferir('base64 vazio é recusado', !!decodificarDataUrl('data:application/pdf;base64,').erro);
        conferir('PDF declarado com conteúdo de outro tipo é sinalizado', assinaturaConfere('application/pdf', jpg) === false);

        console.log('\nCópias em disco:');
        const destino = path.join(caminhos.arquivos, 'doc.pdf');
        const h = sha256(pdf);
        const gravado1 = await guardarCopia(destino, pdf, h);
        conferir('cópia é gravada e confere ao reler', gravado1 === destino && sha256(await fs.readFile(destino)) === h);

        const gravado2 = await guardarCopia(destino, pdf, h);
        conferir('regravar o mesmo conteúdo reaproveita a cópia', gravado2 === destino);

        const outro = Buffer.from('%PDF-outro conteúdo');
        const gravado3 = await guardarCopia(destino, outro, sha256(outro));
        conferir('conteúdo diferente NÃO sobrescreve a cópia existente', gravado3 !== destino && sha256(await fs.readFile(destino)) === h);
        conferir('conteúdo diferente vai para um arquivo novo', sha256(await fs.readFile(gravado3)) === sha256(outro));

        let recusou = false;
        try { await guardarCopia(path.join(caminhos.arquivos, 'x.pdf'), pdf, 'hash-errado'); } catch { recusou = true; }
        conferir('cópia que não confere com o hash esperado gera erro', recusou);

        console.log('\nManifesto:');
        const manifesto = { documentos: { a: { id: 'a', estado: 'copiado' } } };
        await salvarManifesto(caminhos, manifesto);
        const relido = await lerManifesto(caminhos);
        conferir('manifesto é gravado e relido', relido.documentos.a.estado === 'copiado');
        conferir('não sobra arquivo temporário do manifesto', !(await fs.readdir(pasta)).includes('manifesto.json.tmp'));

        console.log('\nHash compatível com o banco:');
        // O banco calcula encode(sha256(convert_to(url, 'UTF8')), 'hex'): SHA-256
        // padrão em hexadecimal minúsculo. Vetor oficial do NIST para "abc":
        conferir('SHA-256 padrão, em hexadecimal minúsculo (vetor NIST)',
            sha256(Buffer.from('abc', 'utf8')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    } finally {
        await fs.rm(pasta, { recursive: true, force: true });
    }

    console.log(falhas === 0 ? '\nTodos os testes passaram.' : `\n${falhas} teste(s) falharam.`);
    process.exitCode = falhas === 0 ? 0 : 1;
}

// ── Entrada ─────────────────────────────────────────────────────────────────

async function principal() {
    const [comando, ...resto] = process.argv.slice(2);
    const opcao = (nome) => {
        const i = resto.indexOf(`--${nome}`);
        return i >= 0 ? (resto[i + 1] && !resto[i + 1].startsWith('--') ? resto[i + 1] : true) : undefined;
    };
    const caminhos = caminhosBackup(path.join(RAIZ_PROJETO, 'migracao', 'backup'));

    switch (comando) {
        case 'autoteste':
            return comandoAutoteste();
        case 'conferir':
            return comandoConferir(caminhos);
        case 'migrar': {
            const limite = opcao('limite') ? parseInt(opcao('limite'), 10) : undefined;
            if (limite !== undefined && !(limite > 0)) throw new Error('--limite precisa ser um número maior que zero');
            return comandoMigrar(caminhos, { limite });
        }
        case 'reverter': {
            const id = typeof opcao('id') === 'string' ? opcao('id') : undefined;
            const todos = opcao('todos') === true;
            if (!id && !todos) throw new Error('Informe --id <uuid> ou --todos');
            return comandoReverter(caminhos, { id, todos });
        }
        case 'status':
            return imprimirResumo(await lerManifesto(caminhos));
        default:
            console.log('Uso: node migracao/migrar_anexos.mjs <autoteste | conferir | migrar [--limite N] | status | reverter --id <uuid> | reverter --todos>');
            process.exitCode = 1;
    }
}

principal().catch((erro) => {
    console.error(`\nERRO: ${erro.message}`);
    process.exitCode = 1;
});

/* ============================================================
   CLOUDINARY CONFIG — Módulo Centralizado de Upload para Cloudinary
   ============================================================ */

window.CLOUDINARY_CLOUD_NAME = window.CLOUDINARY_CLOUD_NAME || 'dsctsogdy';
window.CLOUDINARY_UPLOAD_PRESET = window.CLOUDINARY_UPLOAD_PRESET || 'semac_unsigned';

/**
 * Formatos de imagem aceitos para as imagens de vistoria do Relatório Fiscal.
 * São os formatos que o navegador consegue desenhar em <canvas> (via html2canvas)
 * e, portanto, aparecem corretamente no PDF gerado do relatório.
 * Formatos como HEIC/HEIF, TIFF e AVIF ficam de fora pois não têm suporte
 * confiável de renderização em todos os navegadores.
 */
window.EXTENSOES_IMAGEM_RELATORIO = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'svg'];
window.FORMATOS_IMAGEM_RELATORIO = [
    'image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/x-ms-bmp', 'image/gif', 'image/svg+xml'
];

/**
 * Valida se um arquivo de imagem está em um formato suportado pela geração do
 * Relatório Fiscal em PDF (JPG, JPEG, PNG, WEBP, BMP, GIF ou SVG).
 * Exibe um alerta ao usuário quando o formato não é suportado.
 * @param {File} file - Arquivo selecionado pelo usuário.
 * @param {Object} [opts]
 * @param {Boolean} [opts.alertar=true] - Se deve exibir alert() em caso de formato inválido.
 * @returns {Boolean} true se o formato é válido, false caso contrário.
 */
window.validarFormatoImagemRelatorio = function (file, opts) {
    opts = opts || {};
    const alertar = opts.alertar !== false;
    if (!file) return false;

    const nome = file.name || '';
    const ext = nome.includes('.') ? nome.split('.').pop().toLowerCase() : '';
    const tipo = (file.type || '').toLowerCase();

    const extensaoValida = window.EXTENSOES_IMAGEM_RELATORIO.includes(ext);
    const tipoValido = tipo ? window.FORMATOS_IMAGEM_RELATORIO.includes(tipo) : true;

    if (!extensaoValida || !tipoValido) {
        if (alertar) {
            alert(
                'Formato de imagem não suportado: ' + (ext || tipo || 'desconhecido') + '.\n\n' +
                'Utilize apenas imagens nos formatos JPG, JPEG, PNG, WEBP, BMP, GIF ou SVG, ' +
                'que são os formatos exibidos corretamente no PDF do Relatório Fiscal.'
            );
        }
        return false;
    }
    return true;
};

/**
 * Redimensiona e comprime imagens pesadas (ex: fotos de celular de 8MB+ ou DataURLs)
 * para ~150KB-300KB antes do upload ou conversão em DataURL.
 */
window.otimizarImagemParaUpload = async function (fileOrDataUrl) {
    if (!fileOrDataUrl) return fileOrDataUrl;

    // Se for string DataURL base64 de imagem
    if (typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:image/')) {
        if (fileOrDataUrl.length < 400000) return fileOrDataUrl; // Já é menor que ~300KB
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 1200;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.65));
            };
            img.onerror = () => resolve(fileOrDataUrl);
            img.src = fileOrDataUrl;
        });
    }

    if (!(fileOrDataUrl instanceof File || fileOrDataUrl instanceof Blob)) return fileOrDataUrl;
    const isImg = (fileOrDataUrl.type && fileOrDataUrl.type.startsWith('image/')) || /\.(jpg|jpeg|png|webp|bmp|heic)$/i.test(fileOrDataUrl.name || '');
    if (!isImg) return fileOrDataUrl;

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 1200;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => {
                        if (blob && blob.size < fileOrDataUrl.size) {
                            const fileName = (fileOrDataUrl.name || 'foto.jpg').replace(/\.[^/.]+$/, "") + ".jpg";
                            const newFile = new File([blob], fileName, { type: 'image/jpeg' });
                            resolve(newFile);
                        } else {
                            resolve(fileOrDataUrl);
                        }
                    },
                    'image/jpeg',
                    0.65
                );
            };
            img.onerror = () => resolve(fileOrDataUrl);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(fileOrDataUrl);
        reader.readAsDataURL(fileOrDataUrl);
    });
};

/**
 * Se o arquivo for PDF e tiver mais de 2.5MB (ex: PDFs digitalizados de 15MB),
 * renderiza cada página em canvas e recompila em PDF leve e otimizado.
 */
window.otimizarPdfParaUpload = async function (file) {
    // Desativada a pedido do usuário para não perder qualidade.
    return file;
};

/**
 * Faz o upload de um arquivo (File, Blob ou DataURL) diretamente para o Cloudinary.
 * Se o upload falhar para um arquivo novo (File/Blob), NÃO faz mais fallback para
 * Base64 (isso inflava a coluna `dados` no banco) — avisa o usuário e retorna null.
 * @param {File|Blob|String} fileOrDataUrl - Arquivo ou DataURL a ser enviado.
 * @param {String} folder - Pasta no Cloudinary. Default: 'semac_documentos'
 * @returns {Promise<String|null>} URL HTTPS do arquivo, ou null se o upload falhou.
 */
window.uploadParaCloudinary = async function (fileOrDataUrl, folder = 'semac_documentos') {
    const cloudName = window.CLOUDINARY_CLOUD_NAME || 'dsctsogdy';
    const uploadPreset = window.CLOUDINARY_UPLOAD_PRESET || 'semac_unsigned';

    // 1. Otimiza arquivo ou blob (Imagem / PDF)
    if (fileOrDataUrl instanceof File || fileOrDataUrl instanceof Blob) {
        fileOrDataUrl = await window.otimizarImagemParaUpload(fileOrDataUrl);
        fileOrDataUrl = await window.otimizarPdfParaUpload(fileOrDataUrl);
    } else if (typeof fileOrDataUrl === 'string') {
        fileOrDataUrl = await window.otimizarImagemParaUpload(fileOrDataUrl);
    }

    // Se já for uma URL HTTP/HTTPS pronta
    if (typeof fileOrDataUrl === 'string' && (fileOrDataUrl.startsWith('http://') || fileOrDataUrl.startsWith('https://'))) {
        return fileOrDataUrl;
    }

    const isImg = (fileOrDataUrl instanceof File && (fileOrDataUrl.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp)$/i.test(fileOrDataUrl.name)))
        || (typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:image/'));

    const formData = new FormData();
    formData.append('file', fileOrDataUrl);
    formData.append('upload_preset', uploadPreset);
    const baseFolder = window.CLOUDINARY_BASE_FOLDER || 'Fluxograma';
    if (folder) {
        const fullFolder = folder.includes('/') ? folder : `${baseFolder}/${folder}`;
        formData.append('folder', fullFolder);
    } else {
        formData.append('folder', baseFolder);
    }

    const endpoints = isImg
        ? [`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`]
        : [`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`];

    for (const url of endpoints) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                if (data.secure_url || data.url) {
                    return data.secure_url || data.url;
                }
            } else {
                const errData = await response.json().catch(() => ({}));
                console.warn('[Cloudinary Notice]', errData?.error?.message || `HTTP ${response.status}`);
            }
        } catch (err) {
            console.warn('[Cloudinary Warning] Falha ao enviar para', url, err);
        }
    }

    // Falha total no Cloudinary: NÃO fazemos mais fallback para Base64 embutido no banco.
    // Esse fallback silencioso era o principal responsável por inflar a coluna `dados`
    // dos processos (fotos de vistoria em texto base64 gravadas direto no Postgres),
    // o que derruba a performance/consumo de recursos do banco. Em vez disso, avisamos
    // o usuário e devolvemos null para o chamador não salvar nada quebrado.
    if (fileOrDataUrl instanceof Blob || fileOrDataUrl instanceof File) {
        console.error('[Cloudinary] Falha ao enviar arquivo em todos os endpoints. Upload cancelado.');
        if (typeof window.alert === 'function' && !window.__cloudinaryAlertaAtivo) {
            window.__cloudinaryAlertaAtivo = true;
            alert('Não foi possível enviar o arquivo para o servidor de imagens (Cloudinary).\n\nVerifique sua conexão com a internet e tente selecionar o arquivo novamente.\n\nO arquivo NÃO foi salvo.');
            setTimeout(() => { window.__cloudinaryAlertaAtivo = false; }, 3000);
        }
        return null;
    }

    return fileOrDataUrl;
};

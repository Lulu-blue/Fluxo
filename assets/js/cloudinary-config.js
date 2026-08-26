/* ============================================================
   CLOUDINARY CONFIG — Módulo Centralizado de Upload para Cloudinary
   ============================================================ */

window.CLOUDINARY_CLOUD_NAME = window.CLOUDINARY_CLOUD_NAME || 'dsctsogdy';
window.CLOUDINARY_UPLOAD_PRESET = window.CLOUDINARY_UPLOAD_PRESET || 'semac_unsigned';

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
 * Caso a conta ou preset não esteja autorizada, utiliza um fallback gracioso (Base64 DataURL).
 * @param {File|Blob|String} fileOrDataUrl - Arquivo ou DataURL a ser enviado.
 * @param {String} folder - Pasta no Cloudinary. Default: 'semac_documentos'
 * @returns {Promise<String>} Retorna a URL HTTPS do arquivo ou DataURL.
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

    // Fallback Gracioso: Converte File/Blob para DataURL Base64
    if (fileOrDataUrl instanceof Blob || fileOrDataUrl instanceof File) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(fileOrDataUrl);
        });
    }

    return fileOrDataUrl;
};

/* ============================================================
   CLOUDINARY CONFIG — Módulo Centralizado de Upload para Cloudinary
   ============================================================ */

window.CLOUDINARY_CLOUD_NAME = window.CLOUDINARY_CLOUD_NAME || 'dsctsogdy';
window.CLOUDINARY_UPLOAD_PRESET = window.CLOUDINARY_UPLOAD_PRESET || 'semac_unsigned';

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

    // Se já for uma URL HTTP/HTTPS pronta
    if (typeof fileOrDataUrl === 'string' && (fileOrDataUrl.startsWith('http://') || fileOrDataUrl.startsWith('https://'))) {
        return fileOrDataUrl;
    }

    const formData = new FormData();
    formData.append('file', fileOrDataUrl);
    formData.append('upload_preset', uploadPreset);
    const baseFolder = window.CLOUDINARY_BASE_FOLDER || 'Fluxograma';
    if (folder) {
        // If folder already contains a slash, assume it's a full path; otherwise prefix with base folder
        const fullFolder = folder.includes('/') ? folder : `${baseFolder}/${folder}`;
        formData.append('folder', fullFolder);
    } else {
        formData.append('folder', baseFolder);
    }

    try {
        // Tenta enviar via endpoint /auto/upload
        let response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
            method: 'POST',
            body: formData
        });

        // Se falhar, tenta /raw/upload
        if (!response.ok) {
            response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
                method: 'POST',
                body: formData
            });
        }

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
        console.warn('[Cloudinary Warning] Não foi possível conectar ao Cloudinary, acionando fallback:', err);
    }

    // Fallback Gracioso: Converte File/Blob para DataURL Base64 para não interromper a aplicação
    if (fileOrDataUrl instanceof Blob || fileOrDataUrl instanceof File) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(fileOrDataUrl);
        });
    }

    return fileOrDataUrl;
};

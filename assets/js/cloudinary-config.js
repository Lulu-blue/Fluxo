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
    if (!file || !(file instanceof File || file instanceof Blob)) return file;
    if (file.size < 2.5 * 1024 * 1024) return file; // PDFs < 2.5MB não precisam de reconstrução

    const isPdf = (file.type && file.type === 'application/pdf') || /\.pdf$/i.test(file.name || '');
    if (!isPdf) return file;

    console.log(`[PDF Optimizer] Comprimindo PDF pesado (${(file.size / 1024 / 1024).toFixed(2)} MB)...`);

    try {
        if (typeof window.pdfjsLib === 'undefined') {
            await new Promise((res) => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                s.onload = res;
                s.onerror = res;
                document.head.appendChild(s);
            });
        }
        if (typeof window.PDFLib === 'undefined') {
            await new Promise((res) => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
                s.onload = res;
                s.onerror = res;
                document.head.appendChild(s);
            });
        }

        if (typeof window.pdfjsLib === 'undefined' || typeof window.PDFLib === 'undefined') {
            console.warn('[PDF Optimizer] Dependências PDF.js ou PDFLib não carregadas.');
            return file;
        }

        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdfDoc = await loadingTask.promise;
        const numPages = pdfDoc.numPages;

        const mergedPdf = await window.PDFLib.PDFDocument.create();

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.2 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            await page.render({ canvasContext: ctx, viewport: viewport }).promise;

            const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.65);
            const jpegImage = await mergedPdf.embedJpg(jpegDataUrl);

            const newPage = mergedPdf.addPage([viewport.width, viewport.height]);
            newPage.drawImage(jpegImage, {
                x: 0,
                y: 0,
                width: viewport.width,
                height: viewport.height
            });
        }

        const compressedPdfBytes = await mergedPdf.save();
        const compressedBlob = new Blob([compressedPdfBytes], { type: 'application/pdf' });
        const compressedFile = new File([compressedBlob], file.name, { type: 'application/pdf' });

        console.log(`[PDF Optimizer] PDF comprimido com sucesso: de ${(file.size / 1024 / 1024).toFixed(2)} MB para ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB.`);
        return compressedFile;
    } catch (err) {
        console.warn('[PDF Optimizer] Falha ao comprimir PDF, mantendo arquivo original:', err);
        return file;
    }
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
        : [`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload` ];

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

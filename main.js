const dropArea = document.getElementById("drop_area");
const pdfInput = document.getElementById("pdf_input");
const pdfContainer = document.getElementById("pdf_container");
const canvas = document.getElementById("page_canvas");
const ctx = canvas.getContext("2d");

let pdfDataArr = [];

pdfjsLib.GlobalWorkerOptions.workerSrc = "js/pdf.worker.min-2.5.207.js";

dropArea.addEventListener("click", () => pdfInput.click());
dropArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropArea.classList.add("dragover");
});
dropArea.addEventListener("dragleave", () => dropArea.classList.remove("dragover"));
dropArea.addEventListener("drop", (e) => {
    e.preventDefault();
    dropArea.classList.remove("dragover");
    pdfInput.files = e.dataTransfer.files;
    pdfInput.dispatchEvent(new Event("input"));
});

pdfInput.addEventListener("input", () => {
    const newFiles = Array.from(pdfInput.files).filter(f => f.type === "application/pdf");
    newFiles.forEach(file => {
        const pdfData = {
            file,
            name: file.name,
            quality: 0.5,
            blockEl: null,
            originalPagesContainer: null,
            compressedPagesContainer: null,
            previewImg: null,
        };
        pdfDataArr.push(pdfData);
        createPDFBlock(pdfData);
    });
});

function createPDFBlock(pdfData) {
    const block = document.createElement("div");
    block.classList.add("pdf-block");

    const header = document.createElement("div");
    header.classList.add("pdf-header");
    block.appendChild(header);

    const nameEl = document.createElement("span");
    nameEl.classList.add("pdf-name");
    nameEl.textContent = `${pdfData.name} (${formatFileSize(pdfData.file.size)})`;
    header.appendChild(nameEl);

    const rangeWrap = document.createElement("div");
    rangeWrap.classList.add("pdf-range");

    const rangeLabel = document.createElement("div");
    rangeLabel.classList.add("range-label");
    rangeLabel.textContent = "Quality (0 = worst, 1 = best):";
    rangeWrap.appendChild(rangeLabel);
    header.appendChild(rangeWrap);

    const rangeEl = document.createElement("input");
    rangeEl.type = "range";
    rangeEl.min = "0";
    rangeEl.max = "1";
    rangeEl.step = "0.1";
    rangeEl.value = pdfData.quality;
    rangeWrap.appendChild(rangeEl);

    const rangeVal = document.createElement("span");
    rangeVal.textContent = pdfData.quality;
    rangeWrap.appendChild(rangeVal);

    const compressWrap = document.createElement("div");
    compressWrap.classList.add("compress-wrap");

    const compressLabel = document.createElement("div");
    compressLabel.classList.add("compress-label");
    compressLabel.textContent = "Compression";
    compressWrap.appendChild(compressLabel);

    header.appendChild(compressWrap);

    const syncScrollContainer = document.createElement("div");
    syncScrollContainer.classList.add("pdf-sync-scroll");
    block.appendChild(syncScrollContainer);

    const originalDiv = document.createElement("div");
    originalDiv.classList.add("pdf-side");
    originalDiv.style.display = "flex";
    originalDiv.style.flexDirection = "column";

    const originalLabel = document.createElement("div");
    originalLabel.classList.add("pdf-label");
    originalLabel.textContent = "Original (full quality)";
    originalDiv.appendChild(originalLabel);
    syncScrollContainer.appendChild(originalDiv);

    const compressedDiv = document.createElement("div");
    compressedDiv.classList.add("pdf-side");
    compressedDiv.style.display = "flex";
    compressedDiv.style.flexDirection = "column";

    const compressedLabel = document.createElement("div");
    compressedLabel.classList.add("pdf-label");
    compressedLabel.textContent = "Compressed (current quality)";
    compressedDiv.appendChild(compressedLabel);
    syncScrollContainer.appendChild(compressedDiv);

    pdfData.blockEl = block;
    pdfData.originalPagesContainer = originalDiv;
    pdfData.compressedPagesContainer = compressedDiv;

    pdfContainer.appendChild(block);

    syncScroll(originalDiv, compressedDiv);
    renderPagesToContainer(pdfData, originalDiv, 1);
    renderPagesToContainer(pdfData, compressedDiv, 1 - pdfData.quality);

    rangeEl.addEventListener("input", (e) => {
        const val = +e.target.value;
        pdfData.quality = val;
        rangeVal.textContent = val;
        renderPagesToContainer(pdfData, compressedDiv, 1 - val);
    });

    compressBtn.addEventListener("click", () => {
        compressBtn.disabled = true;
        compressBtn.textContent = "Compressing...";
        compressBtn.classList.add("loading");
        compressSinglePDF(pdfData).finally(() => {
            compressBtn.disabled = false;
            compressBtn.textContent = "Compress";
            compressBtn.classList.remove("loading");
        });
    });
}

function syncScroll(el1, el2) {
    let active = false;
    const sync = (source, target) => {
        if (active) return;
        active = true;
        target.scrollTop = source.scrollTop;
        setTimeout(() => active = false, 10);
    };
    el1.addEventListener("scroll", () => sync(el1, el2));
    el2.addEventListener("scroll", () => sync(el2, el1));
}

async function renderPagesToContainer(pdfData, container, quality) {
    const arrayBuff = await pdfData.file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuff }).promise;
    container.innerHTML = "";

    const label = container.querySelector('.pdf-label');
    if (label) {
        container.appendChild(label);
    }
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        const tempCtx = tempCanvas.getContext("2d");
        await page.render({ canvasContext: tempCtx, viewport }).promise;
        let dataURL = quality >= 0.99 ? tempCanvas.toDataURL("image/png") : tempCanvas.toDataURL("image/jpeg", quality);
        const img = new Image();
        img.src = dataURL;
        container.appendChild(img);
    }
}

function compressSinglePDF(pdfData) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            pdf2imgSingle(e.target.result, pdfData).then(resolve).catch(reject);
        };
        reader.readAsDataURL(pdfData.file);
    });
}

async function pdf2imgSingle(dataUrl, pdfData) {
    const pdfDoc = await readPDF(dataUrl);
    const imgDataMap = await renderAllPagesToImages(pdfDoc, pdfData);
    buildSinglePDF(imgDataMap, pdfData);
}

function readPDF(dataUrl) {
    return pdfjsLib.getDocument(dataUrl).promise;
}

async function renderAllPagesToImages(pdfDoc, pdfData) {
    const pageCount = pdfDoc.numPages;
    const imgDataMap = {};
    const pageQuality = 1 - pdfData.quality;
    for (let i = 1; i <= pageCount; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        const tempCtx = tempCanvas.getContext("2d");
        await page.render({ canvasContext: tempCtx, viewport }).promise;
        imgDataMap[i] = tempCanvas.toDataURL("image/jpeg", pageQuality);
    }
    return imgDataMap;
}

function buildSinglePDF(imgDataMap, pdfData) {
    const doc = new PDFDocument({ autoFirstPage: false, compress: false });
    doc.info = { Title: pdfData.name, Author: "Img2Pdf" };
    const stream = doc.pipe(blobStream());
    (async () => {
        const pageNums = Object.keys(imgDataMap).map(n => +n).sort((a, b) => a - b);
        for (const i of pageNums) {
            const img = await getImgObj(imgDataMap[i]);
            doc.addPage({ size: [img.width, img.height] });
            doc.image(img.src, 0, 0);
        }
        doc.end();
        stream.on("finish", () => {
            const blob = stream.toBlob("application/pdf");

            const maxSizeBytes = 5 * 1024 * 1024;
            if (blob.size > maxSizeBytes) {
                alert("Compressed file exceeds 5MB (" + formatFileSize(blob.size) + "). Try reducing quality.");
                return;
            }

            const outName = pdfData.name.replace(/\.pdf$/i, '') + `_compressed_${pdfData.quality}.pdf`;
            saveAs(blob, outName);
        });
    })();
}

function getImgObj(dataURL) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = dataURL;
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

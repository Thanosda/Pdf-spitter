document.addEventListener('DOMContentLoaded', () => {
    // --- Theme Toggle ---
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle.querySelector('i');
    
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('pdf-splitter-theme', theme);
        if (theme === 'light') {
            themeIcon.className = 'fa-solid fa-sun';
        } else {
            themeIcon.className = 'fa-solid fa-moon';
        }
        // Update meta theme-color for mobile status bar
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            metaTheme.content = theme === 'light' ? '#f4f6fb' : '#09090b';
        }
    }

    // Load saved theme or default to dark
    const savedTheme = localStorage.getItem('pdf-splitter-theme') || 'dark';
    setTheme(savedTheme);

    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'light' ? 'dark' : 'light');
    });

    // --- State ---
    let currentFile = null;
    let currentPdfDoc = null;
    let passwordRequired = false;
    let totalPages = 0;
    let splitFiles = [];
    let zipBlob = null;

    
    // --- DOM Elements ---
    const screens = {
        upload: document.getElementById('screen-upload'),
        preview: document.getElementById('screen-preview'),
        processing: document.getElementById('screen-processing'),
        success: document.getElementById('screen-success')
    };

    // Upload Screen
    const uploadArea = document.getElementById('upload-area');
    const pdfInput = document.getElementById('pdf-input');
    const btnNextUpload = document.getElementById('btn-next-upload');
    const fileInfo = document.getElementById('selected-file-info');
    const fileNameDisplay = document.getElementById('file-name-display');
    const fileSizeDisplay = document.getElementById('file-size-display');
    const removeFileBtn = document.getElementById('remove-file-btn');

    // Preview Screen
    const previewFilename = document.getElementById('preview-filename');
    const previewPagecount = document.getElementById('preview-pagecount');
    const btnSplit = document.getElementById('btn-split');
    const optionCards = document.querySelectorAll('.option-card');
    const rangeInputs = document.getElementById('range-inputs');
    const rangeStart = document.getElementById('range-start');
    const rangeEnd = document.getElementById('range-end');
    const passwordContainer = document.getElementById('password-container');
    const pdfPassword = document.getElementById('pdf-password');
    const passwordError = document.getElementById('password-error');
    const navBack = document.querySelector('.nav-back');

    // Success Screen
    const successCount = document.getElementById('success-count');
    const fileList = document.getElementById('file-list');
    const btnDownloadAll = document.getElementById('btn-download-all');
    const btnStartOver = document.getElementById('btn-start-over');
    const toastEl = document.getElementById('toast');

    // --- Screen Navigation ---
    function navigateTo(screenName) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[screenName].classList.add('active');
    }

    // --- Helpers ---
    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function showToast(message, duration = 3000) {
        toastEl.textContent = message;
        toastEl.classList.add('show');
        setTimeout(() => toastEl.classList.remove('show'), duration);
    }

    function resetState() {
        currentFile = null;
        currentPdfDoc = null;
        passwordRequired = false;
        totalPages = 0;
        splitFiles = [];
        zipBlob = null;
        
        pdfInput.value = '';
        uploadArea.classList.remove('hidden');
        fileInfo.classList.add('hidden');
        btnNextUpload.disabled = true;
        
        pdfPassword.value = '';
        passwordContainer.classList.add('hidden');
        passwordError.classList.add('hidden');
        
        document.getElementById('mode-all').checked = true;
        optionCards.forEach(c => c.classList.remove('active'));
        document.getElementById('option-all').classList.add('active');
        rangeInputs.classList.add('disabled');
        
        fileList.innerHTML = '';
    }

    /* --- SCREEN 1: UPLOAD --- */
    uploadArea.addEventListener('click', () => pdfInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFileSelection(e.dataTransfer.files[0]);
    });

    pdfInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFileSelection(e.target.files[0]);
    });

    function handleFileSelection(file) {
        if (file.type !== 'application/pdf') {
            showToast('Please select a valid PDF file.');
            return;
        }
        if (file.size > 104857600) { // 100MB
            showToast('File is too large. Max size is 100MB.');
            return;
        }
        currentFile = file;
        fileNameDisplay.textContent = file.name;
        fileSizeDisplay.textContent = formatBytes(file.size);
        uploadArea.classList.add('hidden');
        fileInfo.classList.remove('hidden');
        btnNextUpload.disabled = false;
    }

    removeFileBtn.addEventListener('click', resetState);

    btnNextUpload.addEventListener('click', async () => {
        if (!currentFile) return;
        previewFilename.textContent = currentFile.name;
        previewPagecount.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading pages...';
        navigateTo('preview');
        await loadPdf(currentFile);
    });

    /* --- SCREEN 2: PREVIEW & PROCESSING --- */
    optionCards.forEach(card => {
        card.addEventListener('click', () => {
            const radioId = card.id.replace('option-', 'mode-');
            document.getElementById(radioId).checked = true;
            optionCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            if (radioId === 'mode-range') rangeInputs.classList.remove('disabled');
            else rangeInputs.classList.add('disabled');
        });
    });

    navBack.addEventListener('click', () => navigateTo('upload'));

    async function loadPdf(file, password = '') {
        try {
            const arrayBuffer = await file.arrayBuffer();
            currentPdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { 
                password,
                ignoreEncryption: false 
            });
            
            totalPages = currentPdfDoc.getPageCount();
            passwordRequired = false;
            passwordError.classList.add('hidden');
            previewPagecount.innerHTML = `<i class="fa-regular fa-file-pdf"></i> ${totalPages} Pages Total`;
            rangeEnd.placeholder = totalPages;
            rangeEnd.value = totalPages;
            rangeStart.value = 1;
            btnSplit.disabled = false;
        } catch (err) {
            if (err.message.includes('encrypted') || err.message.includes('password')) {
                passwordRequired = true;
                passwordContainer.classList.remove('hidden');
                if (password) {
                    passwordError.textContent = "Incorrect password";
                    passwordError.classList.remove('hidden');
                }
                previewPagecount.innerHTML = '<i class="fa-solid fa-lock" style="color:var(--error-color)"></i> Password Required';
                btnSplit.disabled = true;
            } else {
                console.error(err);
                previewPagecount.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Error loading PDF';
            }
        }
    }

    pdfPassword.addEventListener('input', () => {
        passwordError.classList.add('hidden');
        btnSplit.disabled = false;
    });

    pdfPassword.addEventListener('change', () => {
        if (pdfPassword.value) loadPdf(currentFile, pdfPassword.value);
    });

    btnSplit.addEventListener('click', async () => {
        if (passwordRequired && !pdfPassword.value) {
            showToast('Please enter the PDF password');
            return;
        }

        const mode = document.querySelector('input[name="split-mode"]:checked').value;
        let start = 1;
        let end = totalPages;

        if (mode === 'range') {
            start = parseInt(rangeStart.value) || 1;
            end = parseInt(rangeEnd.value) || totalPages;
            if (start > end || start < 1 || end > totalPages) {
                showToast('Invalid page range');
                return;
            }
        }

        navigateTo('processing');
        
        try {
            const zip = new JSZip();
            const originalName = currentFile.name.replace(/\.[^/.]+$/, "");
            
            for (let i = start - 1; i < end; i++) {
                const subPdf = await PDFLib.PDFDocument.create();
                const [copiedPage] = await subPdf.copyPages(currentPdfDoc, [i]);
                subPdf.addPage(copiedPage);
                const pdfBytes = await subPdf.save();
                
                const fileName = `${originalName}_Page_${i + 1}.pdf`;
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                
                splitFiles.push({ name: fileName, url: url });
                zip.file(fileName, pdfBytes);
            }

            zipBlob = await zip.generateAsync({ type: 'blob' });
            renderSuccess();
        } catch (err) {
            console.error(err);
            showToast('Split failed: ' + err.message);
            navigateTo('preview');
        }
    });

    /* --- SCREEN 4: SUCCESS --- */
    function renderSuccess() {
        successCount.textContent = `${splitFiles.length} pages extracted`;
        fileList.innerHTML = '';
        
        splitFiles.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.innerHTML = `
                <div class="file-item-icon"><i class="fa-solid fa-file-pdf"></i></div>
                <div class="file-item-name truncate">${file.name}</div>
                <a href="${file.url}" download="${file.name}" class="btn-icon-dl">
                    <i class="fa-solid fa-download"></i>
                </a>
            `;
            fileList.appendChild(item);
        });
        
        navigateTo('success');
    }

    btnDownloadAll.addEventListener('click', () => {
        if (!zipBlob) return;
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentFile.name.replace(/\.[^/.]+$/, "")}_Pages.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    btnStartOver.addEventListener('click', () => {
        resetState();
        navigateTo('upload');
    });
});

(() => {
  // ==========================================================================
  // STATE & ELEMENTS
  // ==========================================================================
  let themes = [];
  let editingId = null;
  let currentPage = 1;
  const ITEMS_PER_PAGE = 30;
  const STORAGE_KEY = 'keywordBankThemes';

  const DOMElements = {
    themeInput: document.getElementById("themeInput"),
    categorySelect: document.getElementById("categorySelect"),
    customCategoryInput: document.getElementById("customCategoryInput"),
    keywordInput: document.getElementById("keywordInput"),
    searchTheme: document.getElementById("searchTheme"),
    searchKeyword: document.getElementById("searchKeyword"),
    sortSelect: document.getElementById("sortSelect"),
    themeTableBody: document.getElementById("themeTableBody"),
    pagination: document.getElementById("pagination"),
    toast: document.getElementById("toast"),
    totalThemesCounter: document.getElementById("totalThemes"),
    batchJsonInput: document.getElementById('batchJsonInput'),
    bulkDeleteBtn: document.getElementById('bulkDeleteBtn'),
    bulkDeleteCount: document.getElementById('bulkDeleteCount'),
    selectAllCheckbox: document.getElementById('selectAllCheckbox'),
    fileInput: document.getElementById('fileInput'),
  };

  // ==========================================================================
  // CORE FUNCTIONS
  // ==========================================================================
  const saveThemes = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
  
  const loadThemes = () => {
    try {
      const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      themes = savedData.map(t => ({...t, id: t.id || Date.now() + Math.random(), category: t.category || 'Lainnya' }));
    } catch {
      themes = [];
      showToast("Gagal memuat data dari Local Storage.");
    }
  };
  
  const showToast = (msg) => {
    DOMElements.toast.textContent = msg;
    DOMElements.toast.classList.add("show");
    setTimeout(() => DOMElements.toast.classList.remove("show"), 2500);
  };

  const parseKeywords = (input) => [...new Set(input.split(/[\n,]+/).map(k => k.trim().toLowerCase()).filter(Boolean))];

  const updateCategoryDropdown = () => {
    const { sortSelect } = DOMElements;
    const uniqueCategories = [...new Set(themes.map(t => t.category))].sort();
    const currentValue = sortSelect.value;
    
    // Reset dropdown dengan opsi default
    sortSelect.innerHTML = `
      <option value="all">Filter: Semua Kategori</option>
      <option value="latest">Filter: Terbaru</option>
    `;
    
    // Tambahkan kategori unik
    uniqueCategories.forEach(category => {
      if (category && category.trim()) {
        sortSelect.innerHTML += `<option value="${category}">Filter: ${category}</option>`;
      }
    });
    
    // Pertahankan nilai yang dipilih sebelumnya jika masih valid
    if ([...sortSelect.options].some(opt => opt.value === currentValue)) {
      sortSelect.value = currentValue;
    } else {
      sortSelect.value = "all"; // Default ke "all" jika nilai sebelumnya tidak valid
    }
  };

  const updateBulkActionUI = () => {
    const selectedCount = document.querySelectorAll('.theme-checkbox:checked').length;
    DOMElements.bulkDeleteBtn.classList.toggle('hidden', selectedCount === 0);
    if (selectedCount > 0) {
      DOMElements.bulkDeleteCount.textContent = `Hapus (${selectedCount})`;
    }
    const allCheckboxes = document.querySelectorAll('.theme-checkbox');
    DOMElements.selectAllCheckbox.checked = allCheckboxes.length > 0 && selectedCount === allCheckboxes.length;
  };
  
  // ==========================================================================
  // RENDER FUNCTIONS
  // ==========================================================================
  function renderThemes() {
    const { searchTheme, searchKeyword, sortSelect, themeTableBody, totalThemesCounter } = DOMElements;
    let filteredThemes = themes.filter(item => 
      item.theme.toLowerCase().includes(searchTheme.value.toLowerCase().trim()) &&
      (!searchKeyword.value.trim() || item.keywords.some(k => k.toLowerCase().includes(searchKeyword.value.toLowerCase().trim()))) &&
      (sortSelect.value === "all" || sortSelect.value === "latest" || item.category === sortSelect.value)
    );

    if (sortSelect.value === 'latest') filteredThemes.sort((a, b) => b.id - a.id);
    else filteredThemes.sort((a, b) => a.theme.toLowerCase().localeCompare(b.theme.toLowerCase()));

    const totalPages = Math.ceil(filteredThemes.length / ITEMS_PER_PAGE) || 1;
    currentPage = Math.min(currentPage, totalPages);
    const pagedThemes = filteredThemes.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    
    themeTableBody.innerHTML = pagedThemes.map(renderRow).join('') || `<tr><td colspan="7" class="no-data-cell">Tidak ada data.</td></tr>`;
    totalThemesCounter.textContent = themes.length;
    renderPagination(totalPages);
    updateBulkActionUI();
  }

  function renderRow(item, index) {
    const { searchTheme, searchKeyword } = DOMElements;
    if (editingId === item.id) return renderEditRow(item, index);
    
    const createHighlight = (text, filter) => filter ? text.replace(new RegExp(`(${filter.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'), `<mark>$1</mark>`) : text;

    const keywordHTML = item.keywords.map(k => `<span class="keyword-chip" data-keyword="${k}" title="Klik untuk salin">${createHighlight(k, searchKeyword.value)}</span>`).join("");
    
    return `<tr data-row-id="${item.id}">
        <td><input type="checkbox" class="theme-checkbox" data-id="${item.id}"></td>
        <td>${(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
        <td class="theme-title-cell">${createHighlight(item.theme, searchTheme.value)}</td>
        <td><span class="category-badge">${item.category}</span></td>
        <td><div class="keywords">${keywordHTML}</div></td>
        <td class="keyword-count">${item.keywords.length}</td>
        <td class="actions-cell">
          <div class="main-actions-group">
            <button class="icon-btn" data-action="copy-all" data-id="${item.id}" title="Copy Semua Keywords"><span class="material-symbols-outlined">content_copy</span></button>
            <div class="actions-container">
              <button class="kebab-btn" data-action="toggle-menu" aria-label="Aksi lainnya"><span class="material-symbols-outlined">more_vert</span></button>
              <div class="dropdown-menu">
                <button class="dropdown-item edit" data-action="edit" data-id="${item.id}"><span class="material-symbols-outlined">edit</span>Edit</button>
                <button class="dropdown-item delete" data-action="delete" data-id="${item.id}"><span class="material-symbols-outlined">delete</span>Hapus</button>
              </div>
            </div>
          </div>
        </td>
      </tr>`;
  }

  function renderEditRow(item, index) {
    return `<tr class="editing-row">
        <td></td><td>${(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
        <td><input type="text" class="edit-theme-title" value="${item.theme}"></td>
        <td colspan="3"><textarea class="edit-textarea">${item.keywords.join(", ")}</textarea></td>
        <td class="actions-cell">
            <div class="edit-actions-group">
                <button class="btn-cancel" data-action="cancel">Batal</button>
                <button class="btn-save" data-action="save" data-id="${item.id}">Simpan</button>
            </div>
        </td>
    </tr>`;
  }

  function renderPagination(totalPages) {
    let html = "";
    if (totalPages > 1) {
      const createBtn = (label, page, disabled, current) => `<button aria-label="${label}" ${disabled||current?'disabled':''} class="${current?'current':''}" data-page="${page}">${label.replace(/Halaman /g,'')}</button>`;
      html += createBtn('Awal', 1, currentPage === 1);
      html += createBtn('‹', currentPage - 1, currentPage === 1);
      for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages, currentPage + 1); i++) html += createBtn(`${i}`, i, false, i === currentPage);
      html += createBtn('›', currentPage + 1, currentPage === totalPages);
      html += createBtn('Akhir', totalPages, currentPage === totalPages);
    }
    DOMElements.pagination.innerHTML = html;
  }
  
  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================
  function addTheme() {
    const { themeInput, categorySelect, customCategoryInput, keywordInput } = DOMElements;
    let category = categorySelect.value === 'custom' ? customCategoryInput.value.trim() : categorySelect.value;
    if (!themeInput.value.trim() || !category || !keywordInput.value.trim()) return showToast("Judul, Kategori, dan Keyword harus diisi.");
    
    themes.unshift({ id: Date.now(), theme: themeInput.value.trim(), category, keywords: parseKeywords(keywordInput.value) });
    saveThemes();
    themeInput.value = keywordInput.value = customCategoryInput.value = "";
    categorySelect.value = ""; customCategoryInput.classList.add('hidden');
    currentPage = 1; renderThemes(); updateCategoryDropdown();
    showToast("Tema baru berhasil ditambahkan!");
  }

  function addBatchThemes() {
    const { batchJsonInput } = DOMElements;
    try {
      const data = JSON.parse(batchJsonInput.value);
      if (!Array.isArray(data)) throw new Error("Input harus berupa array JSON.");
      const newItems = data.filter(i => i.theme && i.category && i.keywords).map(t => ({...t, id: Date.now() + Math.random(), keywords: parseKeywords(Array.isArray(t.keywords) ? t.keywords.join(',') : '')}));
      if(newItems.length === 0) return showToast("Tidak ada item valid dalam JSON.");
      themes.unshift(...newItems);
      saveThemes();
      batchJsonInput.value = ""; currentPage = 1; renderThemes(); updateCategoryDropdown();
      showToast(`${newItems.length} item berhasil diimpor dari JSON!`);
    } catch(e) {
      showToast(`Error: ${e.message}`);
    }
  }
  
  function resetAllData() {
    if(themes.length === 0) return showToast("Data sudah kosong.");
    if(confirm("PERINGATAN! Anda akan menghapus SEMUA data. Aksi ini tidak dapat dibatalkan. Lanjutkan?")) {
      themes = []; localStorage.removeItem(STORAGE_KEY);
      currentPage = 1; renderThemes(); updateCategoryDropdown();
      showToast('Semua data berhasil dihapus!');
    }
  }

  function importFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      DOMElements.batchJsonInput.value = e.target.result;
      addBatchThemes();
    };
    reader.readAsText(file);
    event.target.value = ""; // Reset file input
  }

  function downloadData() {
    if(themes.length === 0) return showToast("Tidak ada data untuk diunduh.");
    const blob = new Blob([JSON.stringify(themes, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `keyword_bank_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast("File JSON berhasil diunduh!");
  }

  function clearSelectionsAndFilters() {
    DOMElements.selectAllCheckbox.checked = false;
    document.querySelectorAll('.theme-checkbox:checked').forEach(cb => cb.checked = false);
    currentPage = 1;
    renderThemes();
  }

  // ==========================================================================
  // EVENT LISTENERS SETUP
  // ==========================================================================
  function setupEventListeners() {
    document.getElementById("addThemeBtn").addEventListener("click", addTheme);
    document.getElementById("addBatchBtn").addEventListener("click", addBatchThemes);
    document.getElementById("resetButton").addEventListener("click", resetAllData);
    document.getElementById("downloadBtn").addEventListener("click", downloadData);
    document.getElementById("importBtn").addEventListener("click", () => DOMElements.fileInput.click());
    document.getElementById("clearSearchBtn").addEventListener("click", () => {
      DOMElements.searchTheme.value = ""; 
      DOMElements.searchKeyword.value = "";
      DOMElements.sortSelect.value = "all"; // Reset filter kategori
      clearSelectionsAndFilters();
    });
    
    DOMElements.fileInput.addEventListener("change", importFromFile);

    DOMElements.categorySelect.addEventListener("change", () => {
      DOMElements.customCategoryInput.classList.toggle('hidden', DOMElements.categorySelect.value !== 'custom');
      if (DOMElements.categorySelect.value === 'custom') DOMElements.customCategoryInput.focus();
    });

    DOMElements.themeTableBody.addEventListener("click", handleTableClick);
    DOMElements.themeTableBody.addEventListener('change', e => e.target.classList.contains('theme-checkbox') && updateBulkActionUI());
    
    // Event listener untuk copy keyword individual
    DOMElements.themeTableBody.addEventListener('click', e => {
      if (e.target.classList.contains('keyword-chip') && e.target.dataset.keyword) {
        e.stopPropagation();
        const keyword = e.target.dataset.keyword;
        navigator.clipboard.writeText(keyword).then(() => {
          showToast(`Keyword "${keyword}" disalin!`);
        }).catch(() => {
          // Fallback untuk browser yang tidak mendukung clipboard API
          const textArea = document.createElement('textarea');
          textArea.value = keyword;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          showToast(`Keyword "${keyword}" disalin!`);
        });
      }
    });
    DOMElements.selectAllCheckbox.addEventListener('change', e => {
      document.querySelectorAll('.theme-checkbox').forEach(cb => cb.checked = e.target.checked);
      updateBulkActionUI();
    });

    DOMElements.bulkDeleteBtn.addEventListener('click', () => {
        const selectedIds = [...document.querySelectorAll('.theme-checkbox:checked')].map(cb => Number(cb.dataset.id));
        if (selectedIds.length === 0 || !confirm(`Anda yakin ingin menghapus ${selectedIds.length} tema yang dipilih?`)) return;
        themes = themes.filter(theme => !selectedIds.includes(theme.id));
        saveThemes(); renderThemes(); updateCategoryDropdown();
        showToast(`${selectedIds.length} tema berhasil dihapus.`);
    });
    
    ['input', 'change'].forEach(evt => {
      [DOMElements.searchTheme, DOMElements.searchKeyword, DOMElements.sortSelect].forEach(el => el.addEventListener(evt, clearSelectionsAndFilters));
    });
    
    DOMElements.pagination.addEventListener("click", e => {
        if(e.target.tagName === 'BUTTON' && !e.target.disabled) {
            clearSelectionsAndFilters();
            currentPage = Number(e.target.dataset.page);
            renderThemes();
        }
    });

    document.querySelector(".fab").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener('click', () => document.querySelectorAll('.dropdown-menu.active').forEach(d => d.classList.remove('active')));
  }

  function handleTableClick(e) {
    const actionTarget = e.target.closest('[data-action]');
    if (!actionTarget) return;

    const action = actionTarget.dataset.action;
    const id = Number(actionTarget.dataset.id);
    const themeIndex = themes.findIndex(t => t.id === id);

    e.stopPropagation(); // Stop propagation to prevent window click from closing menu immediately

    switch(action) {
        case "toggle-menu":
            document.querySelectorAll('.dropdown-menu.active').forEach(d => d !== actionTarget.nextElementSibling && d.classList.remove('active'));
            actionTarget.nextElementSibling.classList.toggle('active');
            break;
        case "copy-all": navigator.clipboard.writeText(themes[themeIndex].keywords.join(", ")).then(() => showToast("Semua keywords disalin!")); break;
        case "edit": editingId = id; renderThemes(); break;
        case "cancel": editingId = null; renderThemes(); break;
        case "delete":
            if (confirm(`Hapus tema "${themes[themeIndex].theme}"?`)) {
                themes.splice(themeIndex, 1);
                saveThemes(); renderThemes(); updateCategoryDropdown();
                showToast("Tema berhasil dihapus!");
            }
            break;
        case "save":
            const row = actionTarget.closest('tr');
            const newTitle = row.querySelector('.edit-theme-title').value.trim();
            const newKeywords = parseKeywords(row.querySelector('.edit-textarea').value);
            if (!newTitle || newKeywords.length === 0) return showToast("Judul dan Keyword tidak boleh kosong.");
            
            themes[themeIndex] = { ...themes[themeIndex], theme: newTitle, keywords: newKeywords };
            editingId = null; saveThemes(); renderThemes();
            showToast("Tema berhasil diperbarui!");
            break;
    }
  }
  
  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  loadThemes();
  updateCategoryDropdown();
  renderThemes();
  setupEventListeners();
})(); 
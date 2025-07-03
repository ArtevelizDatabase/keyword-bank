(() => {
  // ==========================================================================
  // STATE & ELEMENTS
  // ==========================================================================
  let themes = [];
  let editingId = null;
  let currentPage = 1;
  const ITEMS_PER_PAGE = 30;
  const STORAGE_KEY = 'keywordBankThemes';
  let searchDebounceTimer = null;
  let webWorker = null;

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

  const showSkeletonScreen = () => {
    const skeletonHTML = Array(5).fill().map((_, i) => `
      <tr class="skeleton-row">
        <td><div class="skeleton skeleton-checkbox"></div></td>
        <td><div class="skeleton skeleton-number"></div></td>
        <td><div class="skeleton skeleton-title"></div></td>
        <td><div class="skeleton skeleton-category"></div></td>
        <td><div class="skeleton skeleton-keywords"></div></td>
        <td><div class="skeleton skeleton-count"></div></td>
        <td><div class="skeleton skeleton-actions"></div></td>
      </tr>
    `).join('');
    
    DOMElements.themeTableBody.innerHTML = skeletonHTML;
  };

  const hideSkeletonScreen = () => {
    const skeletonRows = DOMElements.themeTableBody.querySelectorAll('.skeleton-row');
    skeletonRows.forEach(row => row.remove());
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

  const debouncedRenderThemes = () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      clearSelectionsAndFilters();
    }, 300);
  };

  const updateRowNumbers = () => {
    const rows = DOMElements.themeTableBody.querySelectorAll('tr:not(.editing-row):not(.skeleton-row)');
    rows.forEach((row, index) => {
      const numberCell = row.cells[1];
      if (numberCell && !numberCell.querySelector('.skeleton')) {
        numberCell.textContent = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
      }
    });
  };

  const expandKeywords = (button) => {
    const themeId = Number(button.dataset.id);
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;

    const keywordsContainer = button.parentNode;
    const { searchKeyword } = DOMElements;
    const createHighlight = (text, filter) => filter ? text.replace(new RegExp(`(${filter.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'), `<mark>$1</mark>`) : text;
    
    // Render all keywords
    const allKeywordHTML = theme.keywords.map(k => 
      `<span class="keyword-chip" data-keyword="${k}" title="Klik untuk salin">${createHighlight(k, searchKeyword.value)}</span>`
    ).join("");
    
    // Add collapse button
    const collapseHTML = `<button class="show-less-keywords" data-id="${themeId}" title="Sembunyikan keyword tambahan">
      Sembunyikan
    </button>`;
    
    keywordsContainer.innerHTML = allKeywordHTML + collapseHTML;
  };

  const collapseKeywords = (button) => {
    const themeId = Number(button.dataset.id);
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;

    const keywordsContainer = button.parentNode;
    const { searchKeyword } = DOMElements;
    const createHighlight = (text, filter) => filter ? text.replace(new RegExp(`(${filter.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'), `<mark>$1</mark>`) : text;
    
    // Lazy loading keywords - tampilkan max 10 keywords
    const KEYWORDS_LIMIT = 10;
    const visibleKeywords = theme.keywords.slice(0, KEYWORDS_LIMIT);
    const hiddenKeywords = theme.keywords.slice(KEYWORDS_LIMIT);
    
    let keywordHTML = visibleKeywords.map(k => 
      `<span class="keyword-chip" data-keyword="${k}" title="Klik untuk salin">${createHighlight(k, searchKeyword.value)}</span>`
    ).join("");
    
    if (hiddenKeywords.length > 0) {
      keywordHTML += `<button class="show-more-keywords" data-id="${themeId}" title="Tampilkan ${hiddenKeywords.length} keyword lainnya">
        +${hiddenKeywords.length} lagi
      </button>`;
    }
    
    keywordsContainer.innerHTML = keywordHTML;
  };

  const getKeywordCountClass = (count) => {
    if (count === 15) return 'optimal';
    if (count < 15) return 'low';
    return 'high';
  };
  
  // ==========================================================================
  // RENDER FUNCTIONS
  // ==========================================================================
  function renderThemes() {
    const { searchTheme, searchKeyword, sortSelect, themeTableBody, totalThemesCounter } = DOMElements;
    
    // Use Web Worker for heavy filtering if available
    if (webWorker && themes.length > 100) {
      webWorker.postMessage({
        themes: themes,
        searchTheme: searchTheme.value,
        searchKeyword: searchKeyword.value,
        sortValue: sortSelect.value
      });
      return;
    }
    
    // Fallback to synchronous processing
    renderThemesSync();
  }

  function renderThemesSync() {
    const { searchTheme, searchKeyword, sortSelect, themeTableBody, totalThemesCounter } = DOMElements;
    let filteredThemes = themes.filter(item => 
      item.theme.toLowerCase().includes(searchTheme.value.toLowerCase().trim()) &&
      (!searchKeyword.value.trim() || item.keywords.some(k => k.toLowerCase().includes(searchKeyword.value.toLowerCase().trim()))) &&
      (sortSelect.value === "all" || sortSelect.value === "latest" || item.category === sortSelect.value)
    );

    if (sortSelect.value === 'latest') filteredThemes.sort((a, b) => b.id - a.id);
    else filteredThemes.sort((a, b) => a.theme.toLowerCase().localeCompare(b.theme.toLowerCase()));

    renderFilteredThemes(filteredThemes);
  }

  function renderFilteredThemes(filteredThemes) {
    const { themeTableBody, totalThemesCounter } = DOMElements;
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

    // Lazy loading keywords - tampilkan max 10 keywords
    const KEYWORDS_LIMIT = 10;
    const visibleKeywords = item.keywords.slice(0, KEYWORDS_LIMIT);
    const hiddenKeywords = item.keywords.slice(KEYWORDS_LIMIT);
    
    let keywordHTML = visibleKeywords.map(k => 
      `<span class="keyword-chip" data-keyword="${k}" title="Klik untuk salin">${createHighlight(k, searchKeyword.value)}</span>`
    ).join("");
    
    if (hiddenKeywords.length > 0) {
      keywordHTML += `<button class="show-more-keywords" data-id="${item.id}" title="Tampilkan ${hiddenKeywords.length} keyword lainnya">
        +${hiddenKeywords.length} lagi
      </button>`;
    }
    
    // Calculate correct row number
    const rowNumber = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
    const keywordCountClass = getKeywordCountClass(item.keywords.length);
    
    return `<tr data-row-id="${item.id}">
        <td><input type="checkbox" class="theme-checkbox" data-id="${item.id}"></td>
        <td>${rowNumber}</td>
        <td class="theme-title-cell">${createHighlight(item.theme, searchTheme.value)}</td>
        <td><span class="category-badge">${item.category}</span></td>
        <td><div class="keywords" data-theme-id="${item.id}">${keywordHTML}</div></td>
        <td class="keyword-count ${keywordCountClass}" title="Jumlah keywords: ${item.keywords.length}">${item.keywords.length}</td>
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
    const uniqueCategories = [...new Set(themes.map(t => t.category))].sort();
    const categoryOptions = uniqueCategories.map(cat => 
      `<option value="${cat}" ${cat === item.category ? 'selected' : ''}>${cat}</option>`
    ).join('');
    
    const rowNumber = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
    
    return `<tr class="editing-row">
        <td></td><td>${rowNumber}</td>
        <td><input type="text" class="edit-theme-title" value="${item.theme}"></td>
        <td>
          <select class="edit-category-select">
            ${categoryOptions}
            <option value="Graphic Template" ${item.category === 'Graphic Template' ? 'selected' : ''}>Graphic Template</option>
            <option value="Presentation" ${item.category === 'Presentation' ? 'selected' : ''}>Presentation</option>
            <option value="Social Media" ${item.category === 'Social Media' ? 'selected' : ''}>Social Media</option>
            <option value="custom">-- Kategori Baru --</option>
          </select>
          <input type="text" class="edit-custom-category hidden" placeholder="Kategori baru..." value="">
        </td>
        <td colspan="2"><textarea class="edit-textarea">${item.keywords.join(", ")}</textarea></td>
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
      
      // First and Previous buttons
      html += createBtn('« Awal', 1, currentPage === 1);
      html += createBtn('‹ Prev', currentPage - 1, currentPage === 1);
      
      // Page numbers with ellipsis logic
      const startPage = Math.max(1, currentPage - 2);
      const endPage = Math.min(totalPages, currentPage + 2);
      
      if (startPage > 1) {
        html += createBtn('1', 1, false, false);
        if (startPage > 2) html += '<span class="pagination-ellipsis">...</span>';
      }
      
      for (let i = startPage; i <= endPage; i++) {
        html += createBtn(`${i}`, i, false, i === currentPage);
      }
      
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += '<span class="pagination-ellipsis">...</span>';
        html += createBtn(`${totalPages}`, totalPages, false, false);
      }
      
      // Next and Last buttons
      html += createBtn('Next ›', currentPage + 1, currentPage === totalPages);
      html += createBtn('Akhir »', totalPages, currentPage === totalPages);
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
    
    const newTheme = { 
      id: Date.now(), 
      theme: themeInput.value.trim(), 
      category, 
      keywords: parseKeywords(keywordInput.value) 
    };
    
    themes.unshift(newTheme);
    saveThemes();
    
    // Clear form
    themeInput.value = keywordInput.value = customCategoryInput.value = "";
    categorySelect.value = ""; 
    customCategoryInput.classList.add('hidden');
    
    // Optimasi: Insert langsung ke DOM jika di halaman 1 dan sorting "latest" atau "all"
    const { sortSelect } = DOMElements;
    if (currentPage === 1 && (sortSelect.value === "all" || sortSelect.value === "latest")) {
      const newRowHTML = renderRow(newTheme, 0);
      const tbody = DOMElements.themeTableBody;
      
      // Hapus "no data" row jika ada
      const noDataRow = tbody.querySelector('.no-data-cell');
      if (noDataRow) {
        noDataRow.parentNode.remove();
      }
      
      // Insert new row dengan animasi
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newRowHTML;
      const newRow = tempDiv.firstChild;
      newRow.style.opacity = '0';
      newRow.style.transform = 'translateY(-20px)';
      
      tbody.insertBefore(newRow, tbody.firstChild);
      
      // Animate in
      setTimeout(() => {
        newRow.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        newRow.style.opacity = '1';
        newRow.style.transform = 'translateY(0)';
      }, 10);
      
      // Update nomor urut untuk semua baris
      updateRowNumbers();
      
      // Update counter dan dropdown
      DOMElements.totalThemesCounter.textContent = themes.length;
      updateBulkActionUI();
    } else {
      // Fallback: full re-render jika tidak bisa optimasi
      currentPage = 1; 
      renderThemes(); 
    }
    
    updateCategoryDropdown();
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
    DOMElements.themeTableBody.addEventListener('change', e => {
      if (e.target.classList.contains('theme-checkbox')) {
        updateBulkActionUI();
      } else if (e.target.classList.contains('edit-category-select')) {
        const customInput = e.target.parentNode.querySelector('.edit-custom-category');
        customInput.classList.toggle('hidden', e.target.value !== 'custom');
        if (e.target.value === 'custom') customInput.focus();
      }
    });
    
    // Event listener untuk copy keyword individual dan show more/less
    DOMElements.themeTableBody.addEventListener('click', e => {
      if (e.target.classList.contains('keyword-chip') && e.target.dataset.keyword) {
        e.stopPropagation();
        e.preventDefault();
        const keyword = e.target.dataset.keyword;
        
        copyToClipboard(keyword, `Keyword "${keyword}" disalin!`, `Gagal menyalin keyword "${keyword}"`);
        
      } else if (e.target.classList.contains('show-more-keywords')) {
        e.stopPropagation();
        expandKeywords(e.target);
      } else if (e.target.classList.contains('show-less-keywords')) {
        e.stopPropagation();
        collapseKeywords(e.target);
      }
    });
    DOMElements.selectAllCheckbox.addEventListener('change', e => {
      document.querySelectorAll('.theme-checkbox').forEach(cb => cb.checked = e.target.checked);
      updateBulkActionUI();
    });

    DOMElements.bulkDeleteBtn.addEventListener('click', () => {
        const selectedIds = [...document.querySelectorAll('.theme-checkbox:checked')].map(cb => Number(cb.dataset.id));
        if (selectedIds.length === 0 || !confirm(`Anda yakin ingin menghapus ${selectedIds.length} tema yang dipilih?`)) return;
        
        // Optimasi: Animate out selected rows
        const selectedRows = selectedIds.map(id => document.querySelector(`tr[data-row-id="${id}"]`)).filter(Boolean);
        
        selectedRows.forEach((row, index) => {
          setTimeout(() => {
            row.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            row.style.opacity = '0';
            row.style.transform = 'translateX(-20px)';
          }, index * 50); // Stagger animation
        });
        
        setTimeout(() => {
          themes = themes.filter(theme => !selectedIds.includes(theme.id));
          saveThemes(); 
          renderThemes(); 
          updateCategoryDropdown();
          showToast(`${selectedIds.length} tema berhasil dihapus.`);
        }, selectedRows.length * 50 + 300);
    });
    
    ['input'].forEach(evt => {
      [DOMElements.searchTheme, DOMElements.searchKeyword].forEach(el => el.addEventListener(evt, debouncedRenderThemes));
    });
    
    ['change'].forEach(evt => {
      [DOMElements.sortSelect].forEach(el => el.addEventListener(evt, clearSelectionsAndFilters));
    });
    
    DOMElements.pagination.addEventListener("click", e => {
        if(e.target.tagName === 'BUTTON' && !e.target.disabled) {
            clearSelectionsAndFilters();
            currentPage = Number(e.target.dataset.page);
            renderThemes();
        }
    });

    document.querySelector(".fab").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-menu.active').forEach(d => {
            d.classList.remove('active', 'show-above');
        });
    });
  }

  function handleTableClick(e) {
    const actionTarget = e.target.closest('[data-action]');
    if (!actionTarget) return;

    const action = actionTarget.dataset.action;
    const id = Number(actionTarget.dataset.id);
    
    e.stopPropagation(); // Stop propagation to prevent window click from closing menu immediately

    // Handle cancel action first (no need to validate theme)
    if (action === "cancel") {
        editingId = null;
        const cancelRow = actionTarget.closest('tr');
        // Simply re-render the entire table to exit edit mode
        renderThemes();
        return;
    }

    // For other actions, validate theme exists
    const themeIndex = themes.findIndex(t => t.id === id);
    if (themeIndex === -1 && ['edit', 'save', 'delete'].includes(action)) {
        showToast("Data tema tidak ditemukan!");
        return;
    }

    switch(action) {
        case "toggle-menu":
            document.querySelectorAll('.dropdown-menu.active').forEach(d => d !== actionTarget.nextElementSibling && d.classList.remove('active'));
            const dropdownMenu = actionTarget.nextElementSibling;
            dropdownMenu.classList.toggle('active');
            
            // Auto-adjust dropdown position for bottom rows
            if (dropdownMenu.classList.contains('active')) {
                const rect = dropdownMenu.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const spaceBelow = viewportHeight - rect.bottom;
                
                if (spaceBelow < 120) { // If not enough space below
                    dropdownMenu.classList.add('show-above');
                } else {
                    dropdownMenu.classList.remove('show-above');
                }
            }
            break;
        case "copy-all": 
            if (themeIndex !== -1 && themes[themeIndex] && themes[themeIndex].keywords && themes[themeIndex].keywords.length > 0) {
                const keywordsText = themes[themeIndex].keywords.join(", ");
                copyToClipboard(keywordsText, "Semua keywords disalin!", "Gagal menyalin keywords!");
            } else {
                showToast("Tidak ada keywords untuk disalin!");
            }
            break;
        case "edit": 
            editingId = id; 
            // Optimasi: Re-render hanya row yang sedang diedit
            const editRow = actionTarget.closest('tr');
            if (themeIndex !== -1) {
                const editRowIndex = Array.from(editRow.parentNode.children).indexOf(editRow);
                const editRowHTML = renderEditRow(themes[themeIndex], editRowIndex);
                editRow.outerHTML = editRowHTML;
            }
            break;
        case "delete":
            if (confirm(`Hapus tema "${themes[themeIndex].theme}"?`)) {
                // Optimasi: Hapus dari DOM langsung tanpa re-render
                const row = actionTarget.closest('tr');
                row.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
                row.style.opacity = '0';
                row.style.transform = 'translateX(-20px)';
                
                setTimeout(() => {
                    themes.splice(themeIndex, 1);
                    saveThemes();
                    
                    // Update counter dan pagination tanpa full re-render
                    DOMElements.totalThemesCounter.textContent = themes.length;
                    updateCategoryDropdown();
                    
                    // Hanya re-render jika halaman current menjadi kosong
                    const remainingItems = document.querySelectorAll('#themeTableBody tr:not(.editing-row):not(.skeleton-row)').length - 1;
                    if (remainingItems === 0 && currentPage > 1) {
                        currentPage--;
                        renderThemes();
                    } else {
                        row.remove();
                        updateRowNumbers(); // Update nomor urut setelah hapus
                        updateBulkActionUI();
                    }
                }, 300);
                
                showToast("Tema berhasil dihapus!");
            }
            break;
        case "save":
            const row = actionTarget.closest('tr');
            const newTitle = row.querySelector('.edit-theme-title').value.trim();
            const newKeywords = parseKeywords(row.querySelector('.edit-textarea').value);
            const categorySelect = row.querySelector('.edit-category-select');
            const customCategoryInput = row.querySelector('.edit-custom-category');
            let newCategory = categorySelect.value === 'custom' ? customCategoryInput.value.trim() : categorySelect.value;
            
            if (!newTitle || newKeywords.length === 0 || !newCategory) {
              return showToast("Judul, Kategori, dan Keywords tidak boleh kosong.");
            }
            
            // Update data tema yang sudah ada
            const updatedTheme = { ...themes[themeIndex], theme: newTitle, category: newCategory, keywords: newKeywords };
            
            // Hapus tema dari posisi lama
            themes.splice(themeIndex, 1);
            
            // Tambahkan tema yang sudah diedit ke posisi teratas
            themes.unshift(updatedTheme);
            
            editingId = null; 
            saveThemes(); 
            updateCategoryDropdown();
            
            // Animasi: fade out row lama, kemudian re-render tabel untuk menunjukkan data terbaru di atas
            row.style.transition = 'opacity 0.2s ease-out';
            row.style.opacity = '0';
            
            setTimeout(() => {
                // Reset ke halaman pertama untuk menunjukkan data yang baru diedit
                currentPage = 1;
                renderThemes();
                showToast("Tema berhasil diperbarui dan dipindah ke atas!");
            }, 200);
            break;
    }
  }
  
  // ==========================================================================
  // HELPER FUNCTIONS
  // ==========================================================================
  
  // Fungsi helper untuk copy to clipboard dengan fallback
  const copyToClipboard = (text, successMessage, errorMessage) => {
    if (!text || text.trim() === '') {
      showToast(errorMessage || "Tidak ada teks untuk disalin!");
      return Promise.reject(new Error("Empty text"));
    }
    
    if (navigator.clipboard && window.isSecureContext) {
      // Metode modern untuk HTTPS/localhost
      return navigator.clipboard.writeText(text).then(() => {
        showToast(successMessage || "Teks berhasil disalin!");
      }).catch((err) => {
        console.error('Modern clipboard failed:', err);
        return fallbackCopyToClipboard(text, successMessage, errorMessage);
      });
    } else {
      // Fallback untuk browser lama atau non-HTTPS
      return fallbackCopyToClipboard(text, successMessage, errorMessage);
    }
  };
  
  const fallbackCopyToClipboard = (text, successMessage, errorMessage) => {
    return new Promise((resolve, reject) => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          showToast(successMessage || "Teks berhasil disalin!");
          resolve();
        } else {
          showToast(errorMessage || "Gagal menyalin teks!");
          reject(new Error('Copy command failed'));
        }
      } catch (err) {
        document.body.removeChild(textArea);
        showToast(errorMessage || "Gagal menyalin teks!");
        reject(err);
      }
    });
  };

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  // Show skeleton screen immediately
  showSkeletonScreen();
  
  // Initialize Web Worker
  try {
    webWorker = new Worker('worker.js');
    webWorker.onmessage = function(e) {
      const { success, filteredThemes, error } = e.data;
      if (success) {
        hideSkeletonScreen();
        renderFilteredThemes(filteredThemes);
      } else {
        console.error('Web Worker error:', error);
        hideSkeletonScreen();
        renderThemesSync(); // Fallback
      }
    };
  } catch (error) {
    console.warn('Web Worker not supported or failed to load:', error);
    webWorker = null;
  }

  // Load data and initialize
  setTimeout(() => {
    loadThemes();
    updateCategoryDropdown();
    
    if (themes.length > 50) {
      // Use Web Worker for large datasets
      if (webWorker) {
        webWorker.postMessage({
          themes: themes,
          searchTheme: '',
          searchKeyword: '',
          sortValue: 'all'
        });
      } else {
        hideSkeletonScreen();
        renderThemes();
      }
    } else {
      // Direct render for small datasets
      hideSkeletonScreen();
      renderThemes();
    }
    
    setupEventListeners();
  }, 100); // Small delay to show skeleton briefly
})();
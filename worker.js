// Web Worker untuk memproses data tema
self.onmessage = function(e) {
  const { themes, searchTheme, searchKeyword, sortValue } = e.data;
  
  try {
    // Filter themes
    let filteredThemes = themes.filter(item => {
      const matchesTheme = item.theme.toLowerCase().includes(searchTheme.toLowerCase().trim());
      const matchesKeyword = !searchKeyword.trim() || 
        item.keywords.some(k => k.toLowerCase().includes(searchKeyword.toLowerCase().trim()));
      const matchesCategory = sortValue === "all" || sortValue === "latest" || item.category === sortValue;
      
      return matchesTheme && matchesKeyword && matchesCategory;
    });

    // Sort themes
    if (sortValue === 'latest') {
      filteredThemes.sort((a, b) => b.id - a.id);
    } else {
      filteredThemes.sort((a, b) => a.theme.toLowerCase().localeCompare(b.theme.toLowerCase()));
    }

    // Send back results
    self.postMessage({
      success: true,
      filteredThemes: filteredThemes
    });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error.message
    });
  }
};

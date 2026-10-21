/**
 * 바른성경 통합 뷰어 (성경 · 목사님 강해 · 목사님 설교집)
 * Main Application Engine
 */

class BibleApp {
  constructor() {
    this.booksSummary = [];
    this.cachedBooks = new Map();
    this.searchIndex = null;
    this.searchIndexLoading = false;

    // State
    this.currentBookId = 1;      // Default: 1 (창세기)
    this.currentChapter = 1;     // Default: 1장
    this.selectedVerse = null;
    this.layoutMode = 'all';     // 'all' | 'bible-comm' | 'bible-sermon' | 'bible-only'
    this.mobileActiveTab = 'bible';
    this.activeTheme = 'light';
    this.activeFont = 'serif';
    this.fontSize = 18;
    this.lineHeight = 1.8;

    // DOM Elements
    this.dom = {
      // Containers
      panesContainer: document.getElementById('panes-container'),
      paneBible: document.getElementById('pane-bible'),
      paneComm: document.getElementById('pane-commentary'),
      paneSermon: document.getElementById('pane-sermon'),
      bibleContent: document.getElementById('bible-content'),
      commContent: document.getElementById('commentary-content'),
      commentaryContent: document.getElementById('commentary-content'),
      sermonContent: document.getElementById('sermon-content'),

      // Header Nav
      btnBookPicker: document.getElementById('btn-open-book-picker'),
      currentBookName: document.getElementById('current-book-name'),
      selectChapter: document.getElementById('select-chapter'),
      selectVerse: document.getElementById('select-verse'),
      btnPrevChapter: document.getElementById('btn-prev-chapter'),
      btnNextChapter: document.getElementById('btn-next-chapter'),
      bibleHeading: document.getElementById('bible-pane-heading'),
      bibleVerseCount: document.getElementById('bible-verse-count'),
      commItemCount: document.getElementById('comm-item-count'),
      sermonCountBadge: document.getElementById('sermon-count-badge'),
      selectChapterSermons: document.getElementById('select-chapter-sermons'),

      // Commentary Outline
      btnToggleOutline: document.getElementById('btn-toggle-outline'),
      chapterOutlineBanner: document.getElementById('chapter-outline-banner'),
      outlineThemeTitle: document.getElementById('outline-theme-title'),
      outlineList: document.getElementById('outline-list'),

      // Layout & Sizers
      paneLayoutControls: document.getElementById('pane-layout-controls'),
      btnFontSmaller: document.getElementById('btn-font-smaller'),
      btnFontLarger: document.getElementById('btn-font-larger'),
      btnToggleTheme: document.getElementById('btn-toggle-theme'),
      themeIcon: document.getElementById('theme-icon'),
      btnCopyChapter: document.getElementById('btn-copy-bible-chapter'),

      // Mobile
      mobileBottomBar: document.getElementById('mobile-bottom-bar'),
      mobileBadgeComm: document.getElementById('mobile-badge-comm'),
      mobileBadgeSermon: document.getElementById('mobile-badge-sermon'),

      // Modals
      modalBookPicker: document.getElementById('modal-book-picker'),
      btnCloseBookModal: document.getElementById('btn-close-book-modal'),
      inputBookFilter: document.getElementById('input-book-filter'),
      bookGrid: document.getElementById('book-grid'),
      categoryPills: document.getElementById('category-pills'),

      modalSearch: document.getElementById('modal-search'),
      btnOpenSearch: document.getElementById('btn-open-search'),
      btnCloseSearchModal: document.getElementById('btn-close-search-modal'),
      globalSearchInput: document.getElementById('global-search-input'),
      btnSearchClear: document.getElementById('btn-search-clear'),
      searchResults: document.getElementById('search-results'),
      mobileBtnSearch: document.getElementById('mobile-btn-search'),

      modalSettings: document.getElementById('modal-settings'),
      btnOpenSettings: document.getElementById('btn-open-settings'),
      btnCloseSettingsModal: document.getElementById('btn-close-settings-modal'),
      sliderFontSize: document.getElementById('slider-font-size'),
      labelFontSize: document.getElementById('label-font-size'),
      sliderLineHeight: document.getElementById('slider-line-height'),
      labelLineHeight: document.getElementById('label-line-height'),

      toastContainer: document.getElementById('toast-container')
    };

    this.init();
  }

  async init() {
    this.loadSavedPreferences();
    this.bindEvents();
    
    // Parse URL Hash (e.g. #book=40&chapter=1&verse=23)
    this.parseUrlHash();

    // Load Books Summary
    await this.loadBooksSummary();

    // Render Initial Book & Chapter
    await this.loadBook(this.currentBookId, this.currentChapter, this.selectedVerse);

    // Warm up search index in background
    setTimeout(() => this.preloadSearchIndex(), 1500);
  }

  loadSavedPreferences() {
    const savedTheme = localStorage.getItem('bible_theme') || 'light';
    this.setTheme(savedTheme);

    const savedFont = localStorage.getItem('bible_font') || 'serif';
    this.setFontFamily(savedFont);

    const savedSize = localStorage.getItem('bible_font_size');
    if (savedSize) {
      this.setFontSize(parseInt(savedSize, 10));
    }

    const savedLineHeight = localStorage.getItem('bible_line_height');
    if (savedLineHeight) {
      this.setLineHeight(parseFloat(savedLineHeight));
    }

    const savedLayout = localStorage.getItem('bible_layout') || 'all';
    this.setLayoutMode(savedLayout);
  }

  parseUrlHash() {
    if (!window.location.hash) return;
    try {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      if (params.has('book')) this.currentBookId = parseInt(params.get('book'), 10);
      if (params.has('chapter')) this.currentChapter = parseInt(params.get('chapter'), 10);
      if (params.has('verse')) this.selectedVerse = parseInt(params.get('verse'), 10);
    } catch (e) {
      console.warn('Invalid URL Hash', e);
    }
  }

  updateUrlHash() {
    const params = new URLSearchParams();
    params.set('book', this.currentBookId);
    params.set('chapter', this.currentChapter);
    if (this.selectedVerse) params.set('verse', this.selectedVerse);
    window.history.replaceState(null, '', `#${params.toString()}`);
  }

  async loadBooksSummary() {
    try {
      const res = await fetch('data/books_summary.json');
      this.booksSummary = await res.json();
      this.renderBookPickerGrid();
    } catch (e) {
      console.error('Failed to load books summary', e);
      this.showToast('도서 목록을 불러오지 못했습니다.');
    }
  }

  async loadBook(bookId, chapterNum = 1, verseNum = null) {
    this.currentBookId = bookId;
    this.currentChapter = chapterNum;
    this.selectedVerse = verseNum;

    const bookMeta = this.booksSummary.find(b => b.id === bookId);
    if (bookMeta) {
      this.dom.currentBookName.textContent = bookMeta.name;
    }

    // Check in-memory cache
    let bookData = this.cachedBooks.get(bookId);
    if (!bookData) {
      this.dom.bibleContent.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <p>${bookMeta ? bookMeta.name : '성경'} 데이터를 불러오는 중...</p>
        </div>`;

      try {
        const fileName = bookMeta ? bookMeta.file : `${String(bookId).padStart(2, '0')}.json`;
        const res = await fetch(`data/books/${fileName}`);
        bookData = await res.json();
        this.cachedBooks.set(bookId, bookData);
      } catch (e) {
        console.error('Failed to load book data', e);
        this.dom.bibleContent.innerHTML = `<div class="empty-state"><p>데이터를 불러오는 중 오류가 발생했습니다.</p></div>`;
        return;
      }
    }

    // Populate Chapter dropdown
    this.populateChapterDropdown(bookData);

    // Render Current Chapter
    this.renderChapter(bookData, this.currentChapter);

    // Update URL hash
    this.updateUrlHash();
  }

  populateChapterDropdown(bookData) {
    const chapters = Object.keys(bookData.chapters).map(Number).sort((a,b) => a - b);
    this.dom.selectChapter.innerHTML = '';
    chapters.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch;
      opt.textContent = `${ch}장`;
      if (ch === this.currentChapter) opt.selected = true;
      this.dom.selectChapter.appendChild(opt);
    });
  }

  renderChapter(bookData, chapterNum) {
    this.currentChapter = chapterNum;
    const chStr = String(chapterNum);
    const chData = bookData.chapters[chStr] || { bible: [], commentaries: [], sermons: [], title: '', outline: [] };

    // 1. Render Bible Pane
    this.renderBiblePane(bookData, chData);

    // 2. Render Commentary Pane
    this.renderCommentaryPane(bookData, chData);

    // 3. Render Sermons Pane
    this.renderSermonsPane(bookData, chData);

    // 4. Update Header Badges
    this.dom.bibleHeading.textContent = `${bookData.name} ${chapterNum}장`;
    this.dom.bibleVerseCount.textContent = `${chData.bible.length}절`;
    this.dom.commItemCount.textContent = `${chData.commentaries.length}개`;
    this.dom.sermonCountBadge.textContent = `${chData.sermons.length}편`;

    // 5. Update Mobile Badges
    this.dom.mobileBadgeComm.textContent = chData.commentaries.length;
    this.dom.mobileBadgeSermon.textContent = chData.sermons.length;

    // 6. Populate Verse Dropdown
    this.dom.selectVerse.innerHTML = '<option value="">절 이동</option>';
    chData.bible.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.verse;
      opt.textContent = `${v.verse}절`;
      if (v.verse === this.selectedVerse) opt.selected = true;
      this.dom.selectVerse.appendChild(opt);
    });

    // 7. If verse selected, scroll to it
    if (this.selectedVerse) {
      setTimeout(() => this.selectVerse(this.selectedVerse, true), 100);
    }
  }

  renderBiblePane(bookData, chData) {
    if (!chData.bible || chData.bible.length === 0) {
      this.dom.bibleContent.innerHTML = `<div class="empty-state"><p>해당 장의 성경 본문이 없습니다.</p></div>`;
      return;
    }

    let html = `<h2 class="bible-chapter-title">${bookData.name} 제 ${this.currentChapter} 장</h2>`;

    chData.bible.forEach(v => {
      // Check if commentaries or sermons cover this verse
      const hasComm = chData.commentaries.some(c => c.covered_verses && c.covered_verses.includes(v.verse));
      const hasSermon = chData.sermons.some(s => s.covered_verses && s.covered_verses.includes(v.verse));

      let indicators = '';
      if (hasComm) indicators += `<span class="indicator-pill indicator-comm" title="목사님 강해서 있음">강해서</span>`;
      if (hasSermon) indicators += `<span class="indicator-pill indicator-sermon" title="목사님 설교 있음">설교</span>`;

      const isActive = this.selectedVerse === v.verse ? ' active' : '';

      html += `
        <div class="verse-item${isActive}" id="verse-${v.verse}" data-verse="${v.verse}">
          <span class="verse-num">${v.verse}</span>
          <span class="verse-text">${this.escapeHtml(v.text)}</span>
          <div class="verse-indicators">${indicators}</div>
        </div>
      `;
    });

    this.dom.bibleContent.innerHTML = html;
  }

  renderCommentaryPane(bookData, chData) {
    // Chapter Theme Title & Outline Banner
    if (chData.title || (chData.outline && chData.outline.length > 0)) {
      this.dom.outlineThemeTitle.textContent = chData.title ? `제 ${this.currentChapter} 장 주제: ${chData.title}` : `제 ${this.currentChapter} 장 강해서`;
      this.dom.outlineList.innerHTML = (chData.outline || []).map(o => `<li class="outline-item">${this.escapeHtml(o)}</li>`).join('');
      this.dom.btnToggleOutline.style.display = 'inline-block';
    } else {
      this.dom.btnToggleOutline.style.display = 'none';
      this.dom.chapterOutlineBanner.style.display = 'none';
    }

    if (!chData.commentaries || chData.commentaries.length === 0) {
      this.dom.commContent.innerHTML = `
        <div class="empty-state">
          <p>${bookData.name} ${this.currentChapter}장의 기록된 강해서가 없습니다.</p>
        </div>`;
      return;
    }

    let html = '';
    chData.commentaries.forEach((comm, idx) => {
      const covStr = (comm.covered_verses || []).join(',');
      const isHighlighted = this.selectedVerse && comm.covered_verses && comm.covered_verses.includes(this.selectedVerse) ? ' highlighted' : '';

      html += `
        <article class="comm-card${isHighlighted}" id="comm-card-${idx}" data-covered-verses="${covStr}">
          <div class="comm-card-header">
            <span class="comm-verse-tag">📌 ${this.escapeHtml(comm.verse)}절</span>
            ${comm.heading ? `<span class="comm-outline-heading">${this.escapeHtml(comm.heading)}</span>` : ''}
          </div>
          ${comm.verse_text ? `<div class="comm-verse-scripture">${this.escapeHtml(comm.verse_text)}</div>` : ''}
          <div class="comm-body">
            ${this.formatCommentaryBody(comm.commentary)}
          </div>
        </article>
      `;
    });

    this.dom.commContent.innerHTML = html;
  }

  renderSermonsPane(bookData, chData) {
    const sermons = chData.sermons || [];

    // Populate sermon dropdown
    this.dom.selectChapterSermons.innerHTML = '<option value="">설교 선택...</option>';
    sermons.forEach((s, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `[${s.volume}권] ${s.title}`;
      this.dom.selectChapterSermons.appendChild(opt);
    });

    if (sermons.length === 0) {
      this.dom.sermonContent.innerHTML = `
        <div class="empty-state">
          <p>${bookData.name} ${this.currentChapter}장에 직접 연결된 설교가 없습니다.<br>
          <small>상단 검색창에서 관련 주제로 전체 1,778편 설교를 검색해보세요.</small></p>
        </div>`;
      return;
    }

    let html = '';
    sermons.forEach((s, idx) => {
      const covStr = (s.covered_verses || []).join(',');
      const isHighlighted = this.selectedVerse && s.covered_verses && s.covered_verses.includes(this.selectedVerse) ? ' highlighted' : '';

      html += `
        <article class="sermon-article${isHighlighted}" id="sermon-article-${idx}" data-covered-verses="${covStr}">
          <header class="sermon-article-header">
            <div class="sermon-meta-row">
              <span class="badge-vol">${s.volume}권</span>
              <span class="badge-range">${this.escapeHtml(s.range_display || '')}</span>
            </div>
            <h1 class="sermon-main-title">${this.escapeHtml(s.title)}</h1>
          </header>
          <div class="sermon-body">
            ${this.renderMarkdown(s.content)}
          </div>
        </article>
      `;
    });

    this.dom.sermonContent.innerHTML = html;
  }

  selectVerse(verseNum, scroll = true) {
    this.selectedVerse = verseNum;

    // 1. Highlight verse item in Bible Pane
    const prevActive = this.dom.bibleContent.querySelector('.verse-item.active');
    if (prevActive) prevActive.classList.remove('active');

    const verseEl = document.getElementById(`verse-${verseNum}`);
    if (verseEl) {
      verseEl.classList.add('active');
      if (scroll) {
        verseEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    // 2. Synchronize Commentary Pane
    const commCards = this.dom.commContent.querySelectorAll('.comm-card');
    let firstMatchingComm = null;
    commCards.forEach(card => {
      const covered = (card.getAttribute('data-covered-verses') || '').split(',').map(Number);
      if (covered.includes(verseNum)) {
        card.classList.add('highlighted');
        if (!firstMatchingComm) firstMatchingComm = card;
      } else {
        card.classList.remove('highlighted');
      }
    });

    if (firstMatchingComm && scroll) {
      firstMatchingComm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 3. Synchronize Sermons Pane
    const sermonCards = this.dom.sermonContent.querySelectorAll('.sermon-article');
    let firstMatchingSermon = null;
    sermonCards.forEach(card => {
      const covered = (card.getAttribute('data-covered-verses') || '').split(',').map(Number);
      if (covered.includes(verseNum)) {
        card.classList.add('highlighted');
        if (!firstMatchingSermon) firstMatchingSermon = card;
      } else {
        card.classList.remove('highlighted');
      }
    });

    if (firstMatchingSermon && scroll) {
      firstMatchingSermon.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 4. Update dropdown
    if (this.dom.selectVerse.value !== String(verseNum)) {
      this.dom.selectVerse.value = verseNum;
    }

    // 5. Update URL
    this.updateUrlHash();
  }

  prevChapter() {
    if (this.currentChapter > 1) {
      this.currentChapter--;
      this.loadBook(this.currentBookId, this.currentChapter, null);
    } else {
      // Go to previous book's last chapter
      if (this.currentBookId > 1) {
        const prevBookId = this.currentBookId - 1;
        const prevMeta = this.booksSummary.find(b => b.id === prevBookId);
        const lastCh = prevMeta ? prevMeta.total_chapters : 1;
        this.loadBook(prevBookId, lastCh, null);
      } else {
        this.showToast('성경의 첫 번째 장입니다.');
      }
    }
  }

  nextChapter() {
    const bookMeta = this.booksSummary.find(b => b.id === this.currentBookId);
    const maxCh = bookMeta ? bookMeta.total_chapters : 50;

    if (this.currentChapter < maxCh) {
      this.currentChapter++;
      this.loadBook(this.currentBookId, this.currentChapter, null);
    } else {
      // Go to next book's chapter 1
      if (this.currentBookId < 66) {
        this.loadBook(this.currentBookId + 1, 1, null);
      } else {
        this.showToast('성경의 마지막 장입니다.');
      }
    }
  }

  // ============================================================
  // MARKDOWN & TEXT FORMATTERS
  // ============================================================
  renderMarkdown(md) {
    if (!md) return '';

    // Normalize line breaks
    let text = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Headers ## and ###
    text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');

    // Blockquotes >
    text = text.replace(/^\> (.*$)/gim, '<blockquote><p>$1</p></blockquote>');

    // Bold **text**
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Paragraphs: double newline -> <p>
    const paras = text.split(/\n{2,}/);
    const rendered = paras.map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h2>') || p.startsWith('<h3>') || p.startsWith('<blockquote>')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return rendered;
  }

  formatCommentaryBody(text) {
    if (!text) return '';
    const paras = text.split(/\n{2,}|\s{4,}/);
    return paras.map(p => {
      p = p.trim();
      if (!p) return '';
      return `<p>${this.escapeHtml(p)}</p>`;
    }).join('');
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ============================================================
  // BOOK PICKER MODAL
  // ============================================================
  renderBookPickerGrid(filterTestament = 'ALL', filterCategory = 'ALL', searchTerm = '') {
    let filtered = this.booksSummary;

    if (filterTestament !== 'ALL') {
      filtered = filtered.filter(b => b.testament === filterTestament);
    }
    if (filterCategory !== 'ALL') {
      filtered = filtered.filter(b => b.category === filterCategory);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(b => 
        b.name.toLowerCase().includes(term) ||
        b.abbr.toLowerCase().includes(term)
      );
    }

    // Render Category Pills
    const categories = ['ALL', ...new Set(this.booksSummary.filter(b => filterTestament === 'ALL' || b.testament === filterTestament).map(b => b.category))];
    this.dom.categoryPills.innerHTML = categories.map(cat => `
      <button class="cat-pill${cat === filterCategory ? ' active' : ''}" data-cat="${cat}">
        ${cat === 'ALL' ? '전체 분류' : cat}
      </button>
    `).join('');

    // Render Book Chips
    if (filtered.length === 0) {
      this.dom.bookGrid.innerHTML = `<div class="empty-state"><p>일치하는 성경 책이 없습니다.</p></div>`;
      return;
    }

    this.dom.bookGrid.innerHTML = filtered.map(b => `
      <button class="book-chip${b.id === this.currentBookId ? ' active' : ''}" data-book-id="${b.id}">
        <span class="chip-name">${b.name} (${b.abbr})</span>
        <span class="chip-meta">
          <span>${b.total_chapters}장</span> · 
          <span>설교 ${b.total_sermons}</span>
        </span>
      </button>
    `).join('');
  }

  // ============================================================
  // GLOBAL SEARCH ENGINE
  // ============================================================
  async preloadSearchIndex() {
    if (this.searchIndex || this.searchIndexLoading) return;
    this.searchIndexLoading = true;
    try {
      const res = await fetch('data/search_index.json');
      this.searchIndex = await res.json();
    } catch (e) {
      console.warn('Failed to preload search index', e);
    } finally {
      this.searchIndexLoading = false;
    }
  }

  async performSearch(query, filter = 'all') {
    if (!this.searchIndex) {
      this.dom.searchResults.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>검색 인덱스를 불러오는 중...</p></div>`;
      await this.preloadSearchIndex();
    }

    if (!query || query.trim().length < 2) {
      this.dom.searchResults.innerHTML = `
        <div class="search-prompt-state">
          <p>검색어를 2글자 이상 입력하세요.<br><small>설교 1,778편, 66권 강해 대지 및 성경 구절을 즉시 검색합니다.</small></p>
        </div>`;
      this.updateSearchCounts(0, 0, 0, 0);
      return;
    }

    const q = query.trim().toLowerCase();

    // Direct Scripture coordinate matching: e.g. "마태 5" or "창 1:1"
    const coordMatch = q.match(/^([가-힣]+)\s*(\d+)(?:[:장]\s*(\d+))?/);
    let directResults = [];
    if (coordMatch) {
      const bStr = coordMatch[1];
      const chNum = parseInt(coordMatch[2], 10);
      const vNum = coordMatch[3] ? parseInt(coordMatch[3], 10) : null;
      const matchedBook = this.booksSummary.find(b => b.name.startsWith(bStr) || b.abbr === bStr);
      if (matchedBook && chNum <= matchedBook.total_chapters) {
        directResults.push({
          type: 'bible',
          book_id: matchedBook.id,
          book: matchedBook.name,
          chapter: chNum,
          verse: vNum,
          title: `👉 ${matchedBook.name} ${chNum}장${vNum ? ` ${vNum}절` : ''} 바로가기`,
          preview: `${matchedBook.name} ${chNum}장으로 즉시 이동합니다.`
        });
      }
    }

    // Filter index
    let matchedSermons = [];
    let matchedComm = [];

    for (const item of this.searchIndex) {
      const titleMatch = item.title && item.title.toLowerCase().includes(q);
      const contentMatch = (item.content || item.preview || '').toLowerCase().includes(q);

      if (titleMatch || contentMatch) {
        if (item.type === 'sermon') {
          matchedSermons.push(item);
        } else {
          matchedComm.push(item);
        }
      }
    }

    const totalCount = directResults.length + matchedSermons.length + matchedComm.length;
    this.updateSearchCounts(totalCount, matchedSermons.length, matchedComm.length, directResults.length);

    let displayResults = [];
    if (filter === 'all') {
      displayResults = [...directResults, ...matchedSermons.slice(0, 40), ...matchedComm.slice(0, 40)];
    } else if (filter === 'sermon') {
      displayResults = matchedSermons.slice(0, 60);
    } else if (filter === 'commentary') {
      displayResults = matchedComm.slice(0, 60);
    } else if (filter === 'bible') {
      displayResults = directResults;
    }

    if (displayResults.length === 0) {
      this.dom.searchResults.innerHTML = `<div class="empty-state"><p>"${this.escapeHtml(query)}"에 대한 검색 결과가 없습니다.</p></div>`;
      return;
    }

    let html = '';
    displayResults.forEach(item => {
      const isSermon = item.type === 'sermon';
      const isBible = item.type === 'bible';
      const badgeClass = isSermon ? 'result-type-sermon' : (isBible ? 'result-type-bible' : 'result-type-comm');
      const badgeLabel = isSermon ? `설교 (${item.volume}권)` : (isBible ? '성경 이동' : '강해서 대지');

      html += `
        <div class="search-result-item" 
             data-book-id="${item.book_id}" 
             data-chapter="${item.chapter}" 
             data-verse="${item.verse || ''}">
          <div class="result-header">
            <span class="result-title">${this.highlightKeyword(item.title, q)}</span>
            <span class="result-type-badge ${badgeClass}">${badgeLabel}</span>
          </div>
          <div class="result-snippet">${this.highlightKeyword(item.preview || item.content || '', q)}</div>
        </div>
      `;
    });

    this.dom.searchResults.innerHTML = html;
  }

  highlightKeyword(text, keyword) {
    if (!text) return '';
    const escaped = this.escapeHtml(text);
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }

  updateSearchCounts(all, sermon, comm, bible) {
    document.getElementById('count-all').textContent = all;
    document.getElementById('count-sermon').textContent = sermon;
    document.getElementById('count-comm').textContent = comm;
    document.getElementById('count-bible').textContent = bible;
  }

  // ============================================================
  // SETTINGS & THEMES
  // ============================================================
  setTheme(theme) {
    this.activeTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bible_theme', theme);

    if (theme === 'dark') {
      this.dom.themeIcon.textContent = '🌙';
    } else if (theme === 'sepia') {
      this.dom.themeIcon.textContent = '📜';
    } else {
      this.dom.themeIcon.textContent = '☀️';
    }

    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  toggleTheme() {
    if (this.activeTheme === 'light') {
      this.setTheme('sepia');
    } else if (this.activeTheme === 'sepia') {
      this.setTheme('dark');
    } else {
      this.setTheme('light');
    }
  }

  setFontFamily(font) {
    this.activeFont = font;
    document.body.classList.remove('font-serif', 'font-sans', 'font-system');
    document.body.classList.add(`font-${font}`);
    localStorage.setItem('bible_font', font);

    document.querySelectorAll('.font-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.font === font);
    });
  }

  setFontSize(size) {
    this.fontSize = size;
    document.documentElement.style.setProperty('--font-base-size', `${size}px`);
    this.dom.labelFontSize.textContent = `${size}px`;
    this.dom.sliderFontSize.value = size;
    localStorage.setItem('bible_font_size', size);
  }

  setLineHeight(val) {
    this.lineHeight = val;
    document.documentElement.style.setProperty('--line-height-base', val);
    this.dom.labelLineHeight.textContent = val;
    this.dom.sliderLineHeight.value = val;
    localStorage.setItem('bible_line_height', val);
  }

  setLayoutMode(layout) {
    this.layoutMode = layout;
    this.dom.panesContainer.setAttribute('data-layout', layout);
    localStorage.setItem('bible_layout', layout);

    document.querySelectorAll('.pane-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layout === layout);
    });
  }

  setMobileTab(tab) {
    this.mobileActiveTab = tab;
    this.dom.panesContainer.classList.remove('mobile-show-bible', 'mobile-show-commentary', 'mobile-show-sermon');
    this.dom.panesContainer.classList.add(`mobile-show-${tab}`);

    document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
  }

  showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    this.dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // ============================================================
  // EVENT BINDINGS
  // ============================================================
  bindEvents() {
    // 1. Navigation events
    this.dom.selectChapter.addEventListener('change', (e) => {
      this.loadBook(this.currentBookId, parseInt(e.target.value, 10), null);
    });

    this.dom.selectVerse.addEventListener('change', (e) => {
      if (e.target.value) {
        this.selectVerse(parseInt(e.target.value, 10), true);
      }
    });

    this.dom.btnPrevChapter.addEventListener('click', () => this.prevChapter());
    this.dom.btnNextChapter.addEventListener('click', () => this.nextChapter());

    // 2. Click verse in Bible Pane
    this.dom.bibleContent.addEventListener('click', (e) => {
      const verseItem = e.target.closest('.verse-item');
      if (verseItem) {
        const v = parseInt(verseItem.dataset.verse, 10);
        this.selectVerse(v, false);
      }
    });

    // 3. Select sermon dropdown in Sermon Pane
    this.dom.selectChapterSermons.addEventListener('change', (e) => {
      if (e.target.value !== '') {
        const idx = parseInt(e.target.value, 10);
        const card = document.getElementById(`sermon-article-${idx}`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          card.classList.add('highlighted');
        }
      }
    });

    // 4. Toggle Chapter Outline Banner
    this.dom.btnToggleOutline.addEventListener('click', () => {
      const isVisible = this.dom.chapterOutlineBanner.style.display !== 'none';
      this.dom.chapterOutlineBanner.style.display = isVisible ? 'none' : 'block';
      this.dom.btnToggleOutline.textContent = isVisible ? '대지 보기' : '대지 접기';
    });

    // 5. Copy Bible Chapter
    this.dom.btnCopyChapter.addEventListener('click', () => {
      const verses = Array.from(this.dom.bibleContent.querySelectorAll('.verse-item')).map(el => {
        const num = el.querySelector('.verse-num').textContent;
        const text = el.querySelector('.verse-text').textContent;
        return `${num} ${text}`;
      }).join('\n');

      const bookMeta = this.booksSummary.find(b => b.id === this.currentBookId);
      const title = `${bookMeta ? bookMeta.name : ''} ${this.currentChapter}장\n\n`;

      navigator.clipboard.writeText(title + verses).then(() => {
        this.showToast('성경 본문이 클립보드에 복사되었습니다.');
      }).catch(() => {
        this.showToast('복사에 실패했습니다.');
      });
    });

    // 6. Pane Layout Buttons
    this.dom.paneLayoutControls.addEventListener('click', (e) => {
      const btn = e.target.closest('.pane-btn');
      if (btn) this.setLayoutMode(btn.dataset.layout);
    });

    // 7. Font Sizing Buttons
    this.dom.btnFontSmaller.addEventListener('click', () => {
      if (this.fontSize > 14) this.setFontSize(this.fontSize - 1);
    });
    this.dom.btnFontLarger.addEventListener('click', () => {
      if (this.fontSize < 26) this.setFontSize(this.fontSize + 1);
    });
    this.dom.btnToggleTheme.addEventListener('click', () => this.toggleTheme());

    // 8. Mobile Bottom Bar
    this.dom.mobileBottomBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.mobile-tab-btn');
      if (!btn) return;
      if (btn.dataset.tab) {
        this.setMobileTab(btn.dataset.tab);
      }
    });
    this.dom.mobileBtnSearch.addEventListener('click', () => this.openSearchModal());

    // 9. Book Picker Modal Events
    this.dom.btnBookPicker.addEventListener('click', () => this.openBookPicker());
    this.dom.btnCloseBookModal.addEventListener('click', () => this.closeBookPicker());
    this.dom.modalBookPicker.addEventListener('click', (e) => {
      if (e.target === this.dom.modalBookPicker) this.closeBookPicker();
    });

    // Book Filter Input
    this.dom.inputBookFilter.addEventListener('input', (e) => {
      const activeTest = document.querySelector('.testament-tab.active').dataset.testament;
      const activeCatEl = document.querySelector('.cat-pill.active');
      const activeCat = activeCatEl ? activeCatEl.dataset.cat : 'ALL';
      this.renderBookPickerGrid(activeTest, activeCat, e.target.value);
    });

    // Testament Tabs
    document.querySelectorAll('.testament-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.testament-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.renderBookPickerGrid(tab.dataset.testament, 'ALL', this.dom.inputBookFilter.value);
      });
    });

    // Category Pills
    this.dom.categoryPills.addEventListener('click', (e) => {
      const pill = e.target.closest('.cat-pill');
      if (pill) {
        document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const activeTest = document.querySelector('.testament-tab.active').dataset.testament;
        this.renderBookPickerGrid(activeTest, pill.dataset.cat, this.dom.inputBookFilter.value);
      }
    });

    // Book Chip Click
    this.dom.bookGrid.addEventListener('click', (e) => {
      const chip = e.target.closest('.book-chip');
      if (chip) {
        const bId = parseInt(chip.dataset.bookId, 10);
        this.closeBookPicker();
        this.loadBook(bId, 1, null);
      }
    });

    // 10. Search Modal Events
    this.dom.btnOpenSearch.addEventListener('click', () => this.openSearchModal());
    this.dom.btnCloseSearchModal.addEventListener('click', () => this.closeSearchModal());
    this.dom.modalSearch.addEventListener('click', (e) => {
      if (e.target === this.dom.modalSearch) this.closeSearchModal();
    });

    let searchDebounce = null;
    this.dom.globalSearchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      this.dom.btnSearchClear.style.display = val ? 'block' : 'none';
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        const activeFilter = document.querySelector('.search-tab.active').dataset.searchFilter;
        this.performSearch(val, activeFilter);
      }, 250);
    });

    this.dom.btnSearchClear.addEventListener('click', () => {
      this.dom.globalSearchInput.value = '';
      this.dom.btnSearchClear.style.display = 'none';
      this.performSearch('', 'all');
      this.dom.globalSearchInput.focus();
    });

    // Search Category Tabs
    document.querySelectorAll('.search-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.performSearch(this.dom.globalSearchInput.value, tab.dataset.searchFilter);
      });
    });

    // Search Result Click
    this.dom.searchResults.addEventListener('click', (e) => {
      const item = e.target.closest('.search-result-item');
      if (item) {
        const bId = parseInt(item.dataset.bookId, 10);
        const ch = parseInt(item.dataset.chapter, 10);
        const v = item.dataset.verse ? parseInt(item.dataset.verse, 10) : null;
        this.closeSearchModal();
        this.loadBook(bId, ch, v);
      }
    });

    // 11. Settings Modal Events
    this.dom.btnOpenSettings.addEventListener('click', () => this.openSettingsModal());
    this.dom.btnCloseSettingsModal.addEventListener('click', () => this.closeSettingsModal());
    this.dom.modalSettings.addEventListener('click', (e) => {
      if (e.target === this.dom.modalSettings) this.closeSettingsModal();
    });

    document.querySelectorAll('.font-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setFontFamily(btn.dataset.font));
    });

    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setTheme(btn.dataset.theme));
    });

    this.dom.sliderFontSize.addEventListener('input', (e) => {
      this.setFontSize(parseInt(e.target.value, 10));
    });

    this.dom.sliderLineHeight.addEventListener('input', (e) => {
      this.setLineHeight(parseFloat(e.target.value));
    });

    // 12. Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Ignore if typing in input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        if (e.key === 'Escape') {
          this.closeAllModals();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        this.openSearchModal();
      } else if (e.key === '/' && !e.ctrlKey) {
        e.preventDefault();
        this.openSearchModal();
      } else if (e.key === 'ArrowLeft' || e.key === '[') {
        this.prevChapter();
      } else if (e.key === 'ArrowRight' || e.key === ']') {
        this.nextChapter();
      } else if (e.key === '1') {
        this.setLayoutMode('all');
      } else if (e.key === '2') {
        this.setLayoutMode('bible-comm');
      } else if (e.key === '3') {
        this.setLayoutMode('bible-sermon');
      } else if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });
  }

  openBookPicker() {
    this.dom.modalBookPicker.classList.add('open');
    this.dom.inputBookFilter.focus();
  }
  closeBookPicker() {
    this.dom.modalBookPicker.classList.remove('open');
  }

  openSearchModal() {
    this.dom.modalSearch.classList.add('open');
    this.dom.globalSearchInput.focus();
    this.preloadSearchIndex();
  }
  closeSearchModal() {
    this.dom.modalSearch.classList.remove('open');
  }

  openSettingsModal() {
    this.dom.modalSettings.classList.add('open');
  }
  closeSettingsModal() {
    this.dom.modalSettings.classList.remove('open');
  }

  closeAllModals() {
    this.closeBookPicker();
    this.closeSearchModal();
    this.closeSettingsModal();
  }
}

// Instantiate application on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new BibleApp();
});

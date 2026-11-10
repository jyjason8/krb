/**
 * 바른성경 통합 뷰어 (성경 · 목사님 강해 · 목사님 설교집)
 * Main Application Engine
 */

class BibleApp {
  constructor() {
    this.booksSummary = [];
    this.cachedBooks = new Map();
    this.searchBible = null;
    this.searchComm = null;
    this.searchSermons = null;
    this.searchLoading = { bible: false, comm: false, sermon: false };

    // State
    this.currentBookId = 1;      // Default: 1 (창세기)
    this.currentChapter = 1;     // Default: 1장
    this.selectedVerse = null;
    this.activePanes = new Set(['bible']); // 'bible' | 'commentary' | 'sermon'
    this.mobileActiveTab = 'bible';
    this.activeTheme = 'light';
    this.activeFont = 'serif';
    this.fontSize = 18;
    this.lineHeight = 1.8;

    // TTS (Text-to-Speech) State
    this.ttsRates = [1.0, 1.2, 1.5, 0.8];
    this.ttsRate = 1.0;
    this.ttsPane = null;          // 'bible' | 'commentary' | 'sermon' | null
    this.ttsState = 'idle';       // 'idle' | 'playing' | 'paused'
    this.ttsUnits = [];           // Array of { el: HTMLElement, chunks: string[], verseNum?: number }
    this.ttsUnitIndex = 0;
    this.ttsChunkIndex = 0;
    this.ttsSessionId = 0;
    this.ttsVoice = null;
    this.selectedTtsUnitEl = { commentary: null, sermon: null };

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

      // 3-Pill Pane Selector & Sizers
      paneToggleGroup: document.getElementById('pane-toggle-group'),
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
    this.initTtsEngine();
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

    const savedTtsRate = localStorage.getItem('bible_tts_rate');
    if (savedTtsRate && !isNaN(parseFloat(savedTtsRate))) {
      this.ttsRate = parseFloat(savedTtsRate);
      this.updateTtsControlUI();
    }

    // Active Panes (Default for first-time visitors: only 'bible')
    const savedPanes = localStorage.getItem('bible_active_panes');
    if (savedPanes) {
      try {
        const parsed = JSON.parse(savedPanes);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.activePanes = new Set(parsed);
        }
      } catch (e) {
        console.warn('Error reading saved panes', e);
      }
    }
    if (!this.activePanes || this.activePanes.size === 0) {
      this.activePanes = new Set(['bible']);
    }
    this.applyActivePanes();
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
    this.stopTts();
    this.selectedTtsUnitEl = { commentary: null, sermon: null };
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
          <div class="verse-indicators">
            ${indicators}
            <button class="tts-inline-btn" data-tts-verse="${v.verse}" title="${v.verse}절부터 음성으로 듣기">🔊</button>
          </div>
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
      const headerSpoken = `${comm.verse}절 강해. ${comm.heading || ''}`.trim();

      html += `
        <article class="comm-card${isHighlighted}" id="comm-card-${idx}" data-covered-verses="${covStr}">
          <div class="comm-card-header tts-unit" data-tts-text="${this.escapeHtml(headerSpoken)}">
            <span class="comm-verse-tag">📌 ${this.escapeHtml(comm.verse)}절</span>
            <div class="comm-header-right">
              ${comm.heading ? `<span class="comm-outline-heading">${this.escapeHtml(comm.heading)}</span>` : ''}
              <button class="tts-inline-btn" data-tts-start-card="comm-card-${idx}" title="이 강해서부터 듣기">🔊</button>
            </div>
          </div>
          ${comm.verse_text ? `<div class="comm-verse-scripture tts-unit">${this.escapeHtml(comm.verse_text)}<button class="tts-para-btn" title="이 구절부터 듣기">🔊 여기서부터</button></div>` : ''}
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
              <button class="tts-inline-btn" data-tts-start-card="sermon-article-${idx}" title="이 설교 처음부터 듣기" style="margin-left:auto;">🔊 설교 듣기</button>
            </div>
            <h1 class="sermon-main-title tts-unit">${this.escapeHtml(s.title)}<button class="tts-para-btn" title="이 설교 제목부터 듣기">🔊 여기서부터</button></h1>
          </header>
          <div class="sermon-body">
            ${this.renderMarkdown(s.content)}
          </div>
        </article>
      `;
    });

    this.dom.sermonContent.innerHTML = html;
  }

  selectVerse(verseNum, scroll = true, scrollSource = null) {
    this.selectedVerse = verseNum;

    // 1. Highlight verse item in Bible Pane
    const prevActive = this.dom.bibleContent.querySelector('.verse-item.active');
    if (prevActive) prevActive.classList.remove('active');

    const verseEl = document.getElementById(`verse-${verseNum}`);
    if (verseEl) {
      verseEl.classList.add('active');
      if (scroll && scrollSource !== 'bible' && this.activePanes.has('bible')) {
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

    if (firstMatchingComm && scroll && scrollSource !== 'commentary' && this.activePanes.has('commentary')) {
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

    if (firstMatchingSermon && scroll && scrollSource !== 'sermon' && this.activePanes.has('sermon')) {
      firstMatchingSermon.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 4. Update dropdown
    if (this.dom.selectVerse && this.dom.selectVerse.value !== String(verseNum)) {
      this.dom.selectVerse.value = verseNum;
    }

    // 5. Update URL
    this.updateUrlHash();
  }

  clearVerseSelection() {
    this.selectedVerse = null;
    const prevActive = this.dom.bibleContent.querySelector('.verse-item.active');
    if (prevActive) prevActive.classList.remove('active');

    this.dom.commContent.querySelectorAll('.comm-card.highlighted').forEach(c => c.classList.remove('highlighted'));
    this.dom.sermonContent.querySelectorAll('.sermon-article.highlighted').forEach(c => c.classList.remove('highlighted'));

    if (this.dom.selectVerse) {
      this.dom.selectVerse.value = '';
    }
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
    text = text.replace(/^### (.*$)/gim, '<h3 class="tts-unit">$1<button class="tts-para-btn" title="이 소제목부터 듣기">🔊 여기서부터</button></h3>');
    text = text.replace(/^## (.*$)/gim, '<h2 class="tts-unit">$1<button class="tts-para-btn" title="이 대지부터 듣기">🔊 여기서부터</button></h2>');

    // Blockquotes >
    text = text.replace(/^\> (.*$)/gim, '<blockquote class="tts-unit"><p>$1</p><button class="tts-para-btn" title="이 인용문부터 듣기">🔊 여기서부터</button></blockquote>');

    // Bold **text**
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Paragraphs: double newline -> <p>
    const paras = text.split(/\n{2,}/);
    const rendered = paras.map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h2') || p.startsWith('<h3') || p.startsWith('<blockquote')) {
        return p;
      }
      return `<p class="tts-unit">${p.replace(/\n/g, '<br>')}<button class="tts-para-btn" title="이 문단부터 듣기">🔊 여기서부터</button></p>`;
    }).join('\n');

    return rendered;
  }

  formatCommentaryBody(text) {
    if (!text) return '';
    const paras = text.split(/\n{2,}|\s{4,}/);
    return paras.map(p => {
      p = p.trim();
      if (!p) return '';
      return `<p class="tts-unit">${this.escapeHtml(p)}<button class="tts-para-btn" title="이 문단부터 듣기">🔊 여기서부터</button></p>`;
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
  // GLOBAL SEARCH ENGINE (FULL-TEXT BIBLE, COMMENTARY & SERMONS)
  // ============================================================
  async loadSearchBible() {
    if (this.searchBible || this.searchLoading.bible) return this.searchBible;
    this.searchLoading.bible = true;
    try {
      const res = await fetch('data/search_bible.json');
      this.searchBible = await res.json();
    } catch (e) {
      console.warn('Failed to load search_bible.json', e);
    } finally {
      this.searchLoading.bible = false;
    }
    return this.searchBible;
  }

  async loadSearchComm() {
    if (this.searchComm || this.searchLoading.comm) return this.searchComm;
    this.searchLoading.comm = true;
    try {
      const res = await fetch('data/search_commentary.json');
      this.searchComm = await res.json();
    } catch (e) {
      console.warn('Failed to load search_commentary.json', e);
    } finally {
      this.searchLoading.comm = false;
    }
    return this.searchComm;
  }

  async loadSearchSermons() {
    if (this.searchSermons || this.searchLoading.sermon) return this.searchSermons;
    this.searchLoading.sermon = true;
    try {
      const res = await fetch('data/search_sermons.json');
      this.searchSermons = await res.json();
    } catch (e) {
      console.warn('Failed to load search_sermons.json', e);
    } finally {
      this.searchLoading.sermon = false;
    }
    return this.searchSermons;
  }

  async preloadSearchIndex() {
    // Progressively warm up search datasets
    this.loadSearchBible().then(() => {
      this.loadSearchComm().then(() => {
        this.loadSearchSermons();
      });
    });
  }

  async performSearch(query, filter = 'all') {
    if (!query || query.trim().length < 2) {
      this.dom.searchResults.innerHTML = `
        <div class="search-prompt-state">
          <p>검색어를 2글자 이상 입력하세요.<br><small>성경 66권, 강해서 해설 전권, 설교 1,778편 전체 본문을 검색합니다.</small></p>
        </div>`;
      this.updateSearchCounts(0, 0, 0, 0);
      return;
    }

    const q = query.trim().toLowerCase();

    // 1. Direct Scripture coordinate matching: e.g. "마태 5" or "창 1:1"
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

    // Check loading state and trigger fetches
    if (!this.searchBible && !this.searchLoading.bible) this.loadSearchBible();
    if (!this.searchComm && !this.searchLoading.comm) this.loadSearchComm();
    if (!this.searchSermons && !this.searchLoading.sermon) this.loadSearchSermons();

    // Wait for the requested dataset
    if (filter === 'bible' && !this.searchBible) {
      this.dom.searchResults.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>성경 본문 검색 데이터를 불러오는 중...</p></div>`;
      await this.loadSearchBible();
    } else if (filter === 'commentary' && !this.searchComm) {
      this.dom.searchResults.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>강해서 전체 본문 검색 데이터를 불러오는 중...</p></div>`;
      await this.loadSearchComm();
    } else if (filter === 'sermon' && !this.searchSermons) {
      this.dom.searchResults.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>설교집 전체 본문 검색 데이터를 불러오는 중...</p></div>`;
      await this.loadSearchSermons();
    } else if (filter === 'all' && !this.searchBible && !this.searchComm && !this.searchSermons) {
      this.dom.searchResults.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>전체 검색 데이터를 불러오는 중...</p></div>`;
      await Promise.all([this.loadSearchBible(), this.loadSearchComm(), this.loadSearchSermons()]);
    }

    // 2. Search Bible (searchBible: [b_id, b_name, ch, v, text])
    let matchedBible = [...directResults];
    if (this.searchBible) {
      for (const item of this.searchBible) {
        if (item[4].toLowerCase().includes(q)) {
          matchedBible.push({
            type: 'bible',
            book_id: item[0],
            book: item[1],
            chapter: item[2],
            verse: item[3],
            title: `${item[1]} ${item[2]}:${item[3]}`,
            preview: this.getSnippet(item[4], q)
          });
          if (matchedBible.length >= 100) break;
        }
      }
    }

    // 3. Search Commentary (searchComm: [b_id, b_name, ch, v_str, heading, text])
    let matchedComm = [];
    if (this.searchComm) {
      for (const item of this.searchComm) {
        const headingMatch = item[4] && item[4].toLowerCase().includes(q);
        const textMatch = item[5] && item[5].toLowerCase().includes(q);
        if (headingMatch || textMatch) {
          const vDisplay = item[3] ? `${item[3]}절` : '';
          const title = `${item[1]} ${item[2]}장 ${vDisplay} ${item[4] ? `(${item[4]})` : ''}`.trim();
          matchedComm.push({
            type: 'commentary',
            book_id: item[0],
            book: item[1],
            chapter: item[2],
            verse: item[3] && !isNaN(parseInt(item[3], 10)) ? parseInt(item[3], 10) : null,
            title: title,
            preview: this.getSnippet(item[5], q)
          });
          if (matchedComm.length >= 100) break;
        }
      }
    }

    // 4. Search Sermons (searchSermons: [b_id, b_name, ch, vol, s_id, title, range_disp, text])
    let matchedSermons = [];
    if (this.searchSermons) {
      for (const item of this.searchSermons) {
        const titleMatch = item[5] && item[5].toLowerCase().includes(q);
        const rangeMatch = item[6] && item[6].toLowerCase().includes(q);
        const textMatch = item[7] && item[7].toLowerCase().includes(q);
        if (titleMatch || rangeMatch || textMatch) {
          matchedSermons.push({
            type: 'sermon',
            book_id: item[0],
            book: item[1],
            chapter: item[2],
            volume: item[3],
            sermon_id: item[4],
            title: `[${item[3]}권] ${item[5]} (${item[6]})`,
            preview: this.getSnippet(item[7], q)
          });
          if (matchedSermons.length >= 100) break;
        }
      }
    }

    const totalCount = matchedBible.length + matchedComm.length + matchedSermons.length;
    this.updateSearchCounts(totalCount, matchedBible.length, matchedComm.length, matchedSermons.length);

    let displayResults = [];
    if (filter === 'all') {
      displayResults = [...matchedBible.slice(0, 30), ...matchedComm.slice(0, 30), ...matchedSermons.slice(0, 30)];
    } else if (filter === 'bible') {
      displayResults = matchedBible;
    } else if (filter === 'commentary') {
      displayResults = matchedComm;
    } else if (filter === 'sermon') {
      displayResults = matchedSermons;
    }

    if (displayResults.length === 0) {
      this.dom.searchResults.innerHTML = `<div class="empty-state"><p>"${this.escapeHtml(query)}"에 대한 검색 결과가 없습니다.</p></div>`;
      return;
    }

    let html = '';
    displayResults.forEach(item => {
      const isBible = item.type === 'bible';
      const isComm = item.type === 'commentary';

      const badgeClass = isBible ? 'result-type-bible' : (isComm ? 'result-type-comm' : 'result-type-sermon');
      const badgeLabel = isBible ? '성경' : (isComm ? '강해서' : '설교집');

      html += `
        <div class="search-result-item" 
             data-book-id="${item.book_id}" 
             data-chapter="${item.chapter}" 
             data-verse="${item.verse || ''}">
          <div class="result-header">
            <span class="result-title">${this.highlightKeyword(item.title, q)}</span>
            <span class="result-type-badge ${badgeClass}">${badgeLabel}</span>
          </div>
          <div class="result-snippet">${this.highlightKeyword(item.preview, q)}</div>
        </div>
      `;
    });

    this.dom.searchResults.innerHTML = html;
  }

  getSnippet(text, keyword, maxLen = 160) {
    if (!text) return '';
    const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (idx === -1) return text.substring(0, maxLen);
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + keyword.length + 100);
    let snippet = text.substring(start, end).trim();
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    return snippet;
  }

  highlightKeyword(text, keyword) {
    if (!text) return '';
    const escaped = this.escapeHtml(text);
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }

  updateSearchCounts(all, bible, comm, sermon) {
    const elAll = document.getElementById('count-all');
    const elBible = document.getElementById('count-bible');
    const elComm = document.getElementById('count-comm');
    const elSermon = document.getElementById('count-sermon');
    if (elAll) elAll.textContent = all;
    if (elBible) elBible.textContent = bible;
    if (elComm) elComm.textContent = comm;
    if (elSermon) elSermon.textContent = sermon;
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

  togglePane(paneName) {
    if (this.activePanes.has(paneName)) {
      if (this.activePanes.size <= 1) {
        this.showToast('최소 한 개의 화면은 선택되어 있어야 합니다.');
        return;
      }
      if (this.ttsPane === paneName) {
        this.stopTts();
      }
      this.activePanes.delete(paneName);
    } else {
      this.activePanes.add(paneName);
    }
    this.applyActivePanes();
    localStorage.setItem('bible_active_panes', JSON.stringify([...this.activePanes]));
  }

  applyActivePanes() {
    // 1. Update header toggle pills
    const pills = document.querySelectorAll('.pane-toggle-pill');
    pills.forEach(pill => {
      const pane = pill.dataset.pane;
      pill.classList.toggle('active', this.activePanes.has(pane));
    });

    // 2. Update pane visibility
    const isBible = this.activePanes.has('bible');
    const isComm = this.activePanes.has('commentary');
    const isSermon = this.activePanes.has('sermon');

    if (this.dom.paneBible) this.dom.paneBible.style.display = isBible ? 'flex' : 'none';
    if (this.dom.paneComm) this.dom.paneComm.style.display = isComm ? 'flex' : 'none';
    if (this.dom.paneSermon) this.dom.paneSermon.style.display = isSermon ? 'flex' : 'none';

    // 3. Synchronize mobile bottom tabs
    if (this.dom.mobileBottomBar) {
      this.dom.mobileBottomBar.querySelectorAll('.mobile-tab-btn[data-tab]').forEach(btn => {
        const tab = btn.dataset.tab;
        btn.classList.toggle('active', this.activePanes.has(tab));
      });
    }
  }

  setLayoutMode(layout) {
    // Backward compatibility mapping
    if (layout === 'all') {
      this.activePanes = new Set(['bible', 'commentary', 'sermon']);
    } else if (layout === 'bible-comm') {
      this.activePanes = new Set(['bible', 'commentary']);
    } else if (layout === 'bible-sermon') {
      this.activePanes = new Set(['bible', 'sermon']);
    } else if (layout === 'bible-only') {
      this.activePanes = new Set(['bible']);
    }
    this.applyActivePanes();
    localStorage.setItem('bible_active_panes', JSON.stringify([...this.activePanes]));
  }

  setMobileTab(tab) {
    this.togglePane(tab);
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
  // TTS (TEXT-TO-SPEECH) ENGINE — CLOUD MP3 + BACKGROUND PLAYBACK
  // ============================================================
  initTtsEngine() {
    // 1. Create background keep-alive silent WAV & Dual Audio Decks for gapless background MP3 streaming
    this.silentWavUrl = this.createSilentWavBlobUrl();
    this.ttsKeeperAudio = this.createTtsAudioElement();
    this.ttsKeeperAudio.src = this.silentWavUrl;
    this.ttsKeeperAudio.loop = true;
    this.ttsKeeperAudio.volume = 0.01;

    this.ttsDecks = [this.createTtsAudioElement(), this.createTtsAudioElement()];
    this.activeDeckIdx = 0;
    this.ttsDecksUnlocked = false;
    this.ttsUsingLocalFallback = false;

    // 2. Setup Lock-Screen / Bluetooth MediaSession controls
    this.setupMediaSession();

    // 3. Re-sync scroll position when returning from background / screen-off
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ttsState === 'playing' && this.ttsUnits[this.ttsUnitIndex]) {
        const el = this.ttsUnits[this.ttsUnitIndex].el;
        if (el && document.body.contains(el)) {
          this.scrollTtsUnitIntoView(el);
        }
      }
    });

    // 4. Local Web Speech API fallback voice init
    if ('speechSynthesis' in window) {
      this.selectBestKoreanVoice();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.selectBestKoreanVoice();
      }
    }

    window.addEventListener('beforeunload', () => {
      this.stopTts();
    });
  }

  createTtsAudioElement() {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.playsInline = true;
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    audio.referrerPolicy = 'no-referrer';
    return audio;
  }

  /**
   * Generates a 2-second 8kHz 16-bit mono PCM WAV with 1-LSB signal
   * so mobile OSes (Android/iOS) keep the background audio session alive
   * during millisecond transitions between sentence MP3 decks.
   */
  createSilentWavBlobUrl() {
    const sampleRate = 8000;
    const numSamples = sampleRate * 2;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    for (let i = 0; i < numSamples; i++) {
      view.setInt16(44 + i * 2, (i % 2 === 0) ? 1 : -1, true);
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => this.resumeTts());
      navigator.mediaSession.setActionHandler('pause', () => this.pauseTts());
      navigator.mediaSession.setActionHandler('stop', () => this.stopTts());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.skipTtsUnit(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => this.skipTtsUnit(1));
      navigator.mediaSession.setActionHandler('seekbackward', () => this.skipTtsUnit(-1));
      navigator.mediaSession.setActionHandler('seekforward', () => this.skipTtsUnit(1));
    } catch (e) {}
  }

  updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || !this.ttsPane) return;
    try {
      const bookMeta = this.booksSummary.find(b => b.id === this.currentBookId);
      const bookName = bookMeta ? bookMeta.name : '바른성경';
      const paneLabel = this.ttsPane === 'bible' ? '성경 본문' : (this.ttsPane === 'commentary' ? '강해서' : '설교집');
      const unit = this.ttsUnits[this.ttsUnitIndex];
      const subTitle = (this.ttsPane === 'bible' && unit && unit.verseNum)
        ? `${bookName} ${this.currentChapter}장 ${unit.verseNum}절`
        : `${bookName} ${this.currentChapter}장 (${paneLabel})`;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: subTitle,
        artist: `바른성경 통합 뷰어 · ${paneLabel}`,
        album: `${bookName} ${this.currentChapter}장`
      });
      navigator.mediaSession.playbackState = this.ttsState === 'playing' ? 'playing' : 'paused';
    } catch (e) {}
  }

  getCloudTtsUrl(text, lang = 'ko') {
    return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
  }

  getNextTtsPosition(uIdx, cIdx) {
    if (!this.ttsUnits || uIdx >= this.ttsUnits.length) return null;
    const unit = this.ttsUnits[uIdx];
    if (unit && cIdx + 1 < unit.chunks.length) {
      return { unitIndex: uIdx, chunkIndex: cIdx + 1 };
    }
    if (uIdx + 1 < this.ttsUnits.length) {
      return { unitIndex: uIdx + 1, chunkIndex: 0 };
    }
    return null;
  }

  selectBestKoreanVoice() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices() || [];
    const koVoices = voices.filter(v => {
      const lang = (v.lang || '').toLowerCase();
      return lang.startsWith('ko') || lang.includes('kr');
    });
    if (koVoices.length === 0) return;

    const scoreVoice = (v) => {
      const name = (v.name || '').toLowerCase();
      let score = 0;
      if (name.includes('natural') || name.includes('online')) score += 100;
      if (name.includes('sunhi') || name.includes('injoon') || name.includes('hyunsu')) score += 50;
      if (name.includes('google')) score += 60;
      if (name.includes('yuna') || name.includes('sora') || name.includes('samsung')) score += 40;
      if (v.default) score += 20;
      if (v.localService) score += 10;
      return score;
    };

    koVoices.sort((a, b) => scoreVoice(b) - scoreVoice(a));
    this.ttsVoice = koVoices[0];
  }

  cleanTextForTts(raw) {
    if (!raw) return '';
    return raw
      .replace(/[📌🔊📋👉☀️📜🌙⚙️🔍📖📑]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  splitIntoSentenceChunks(text, maxLen = 165) {
    const cleaned = this.cleanTextForTts(text);
    if (!cleaned) return [];
    if (cleaned.length <= maxLen) return [cleaned];

    const parts = cleaned.split(/(?<=[.?!。]|다\.|요\.|죠\.|음\.|함\.)\s+/);
    const chunks = [];
    let current = '';

    for (const part of parts) {
      const s = part ? part.trim() : '';
      if (!s) continue;
      if ((current ? current.length + 1 + s.length : s.length) <= maxLen) {
        current = current ? `${current} ${s}` : s;
      } else {
        if (current) {
          chunks.push(current);
          current = '';
        }
        if (s.length <= maxLen) {
          current = s;
        } else {
          const words = s.split(/\s+/);
          let temp = '';
          for (const word of words) {
            if ((temp ? temp.length + 1 + word.length : word.length) <= maxLen) {
              temp = temp ? `${temp} ${word}` : word;
            } else {
              if (temp) chunks.push(temp);
              if (word.length > maxLen) {
                for (let pos = 0; pos < word.length; pos += maxLen) {
                  chunks.push(word.substring(pos, pos + maxLen));
                }
                temp = '';
              } else {
                temp = word;
              }
            }
          }
          if (temp) current = temp;
        }
      }
    }
    if (current) chunks.push(current);
    return chunks.length > 0 ? chunks : [cleaned];
  }

  buildTtsQueue(paneName) {
    const units = [];
    if (paneName === 'bible') {
      const items = this.dom.bibleContent.querySelectorAll('.verse-item');
      items.forEach(item => {
        const textEl = item.querySelector('.verse-text');
        const raw = textEl ? textEl.textContent : '';
        const chunks = this.splitIntoSentenceChunks(raw);
        if (chunks.length > 0) {
          units.push({
            el: item,
            chunks,
            verseNum: parseInt(item.dataset.verse, 10)
          });
        }
      });
    } else {
      const container = paneName === 'commentary' ? this.dom.commContent : this.dom.sermonContent;
      const els = container.querySelectorAll('.tts-unit');
      els.forEach(el => {
        let raw = '';
        if (el.dataset.ttsText) {
          raw = el.dataset.ttsText;
        } else {
          const clone = el.cloneNode(true);
          clone.querySelectorAll('.tts-para-btn, .tts-inline-btn').forEach(b => b.remove());
          raw = clone.textContent || '';
        }
        const chunks = this.splitIntoSentenceChunks(raw);
        if (chunks.length > 0) {
          units.push({ el, chunks });
        }
      });
    }
    return units;
  }

  startTts(paneName, startEl = null) {
    this.stopTts();

    const units = this.buildTtsQueue(paneName);
    if (units.length === 0) {
      this.showToast('읽을 수 있는 본문이 없습니다.');
      return;
    }

    let startIndex = 0;
    if (startEl) {
      const foundIdx = units.findIndex(u => u.el === startEl || startEl.contains(u.el) || u.el.contains(startEl));
      if (foundIdx !== -1) startIndex = foundIdx;
    } else if (paneName === 'bible' && this.selectedVerse) {
      const foundIdx = units.findIndex(u => u.verseNum === this.selectedVerse);
      if (foundIdx !== -1) startIndex = foundIdx;
    } else if (paneName === 'commentary' || paneName === 'sermon') {
      const selEl = this.selectedTtsUnitEl[paneName];
      if (selEl && document.body.contains(selEl)) {
        const foundIdx = units.findIndex(u => u.el === selEl);
        if (foundIdx !== -1) startIndex = foundIdx;
      } else {
        const container = paneName === 'commentary' ? this.dom.commContent : this.dom.sermonContent;
        const highlightedCard = container.querySelector('.comm-card.highlighted, .sermon-article.highlighted');
        if (highlightedCard) {
          const foundIdx = units.findIndex(u => highlightedCard.contains(u.el));
          if (foundIdx !== -1) startIndex = foundIdx;
        }
      }
    }

    this.ttsPane = paneName;
    this.ttsUnits = units;
    this.ttsUnitIndex = startIndex;
    this.ttsChunkIndex = 0;
    this.ttsState = 'playing';
    this.ttsUsingLocalFallback = false;

    // Start background keep-alive audio loop inside user gesture
    if (this.ttsKeeperAudio) {
      this.ttsKeeperAudio.play().catch(() => {});
    }

    // Unlock secondary deck inside user gesture on first run so mobile OS allows background deck swaps
    if (!this.ttsDecksUnlocked && this.ttsDecks && this.ttsDecks[1]) {
      this.ttsDecksUnlocked = true;
      const deckB = this.ttsDecks[1 - this.activeDeckIdx];
      deckB.src = this.silentWavUrl;
      deckB.dataset.loadedUrl = '';
      deckB.volume = 0.01;
      const p = deckB.play();
      if (p && p.then) {
        p.then(() => {
          deckB.pause();
          deckB.volume = 1.0;
          this.preloadNextChunk();
        }).catch(() => {
          deckB.volume = 1.0;
          this.preloadNextChunk();
        });
      }
    }

    this.updateTtsControlUI();
    this.speakCurrentChunk();
  }

  preloadNextChunk() {
    if (this.ttsState !== 'playing' || !this.ttsDecks) return;
    const nextPos = this.getNextTtsPosition(this.ttsUnitIndex, this.ttsChunkIndex);
    if (!nextPos) return;

    const nextUnit = this.ttsUnits[nextPos.unitIndex];
    if (!nextUnit) return;
    const nextText = nextUnit.chunks[nextPos.chunkIndex];
    if (!nextText) return;

    const nextUrl = this.getCloudTtsUrl(nextText, 'ko');
    const nextDeck = this.ttsDecks[1 - this.activeDeckIdx];
    if (nextDeck && nextDeck.dataset.loadedUrl !== nextUrl) {
      nextDeck.src = nextUrl;
      nextDeck.dataset.loadedUrl = nextUrl;
      nextDeck.playbackRate = this.ttsRate;
      nextDeck.defaultPlaybackRate = this.ttsRate;
      nextDeck.load();
    }
  }

  speakCurrentChunk() {
    if (this.ttsState !== 'playing' || !this.ttsPane) return;

    if (this.ttsUnitIndex >= this.ttsUnits.length) {
      this.stopTts();
      this.showToast('음성 읽기가 완료되었습니다.');
      return;
    }

    const unit = this.ttsUnits[this.ttsUnitIndex];
    if (!unit || !unit.el || !document.body.contains(unit.el)) {
      this.stopTts();
      return;
    }

    // Highlight current DOM unit & scroll smoothly if visible
    document.querySelectorAll('.tts-reading').forEach(el => {
      if (el !== unit.el) el.classList.remove('tts-reading');
    });
    unit.el.classList.add('tts-reading');

    if (this.ttsChunkIndex === 0) {
      if (!document.hidden) {
        this.scrollTtsUnitIntoView(unit.el);
      }
      if (this.ttsPane === 'bible' && unit.verseNum) {
        this.selectVerse(unit.verseNum, !document.hidden, 'bible');
      }
      this.updateMediaSessionMetadata();
    }

    const chunkText = unit.chunks[this.ttsChunkIndex];
    if (!chunkText) {
      const nextPos = this.getNextTtsPosition(this.ttsUnitIndex, this.ttsChunkIndex);
      if (!nextPos) {
        this.stopTts();
        this.showToast('음성 읽기가 완료되었습니다.');
        return;
      }
      this.ttsUnitIndex = nextPos.unitIndex;
      this.ttsChunkIndex = nextPos.chunkIndex;
      this.speakCurrentChunk();
      return;
    }

    this.ttsSessionId++;
    const sessionId = this.ttsSessionId;

    // Play via Google Cloud TTS MP3 Dual-Deck Engine
    const targetUrl = this.getCloudTtsUrl(chunkText, 'ko');
    const deck = this.ttsDecks[this.activeDeckIdx];
    const otherDeck = this.ttsDecks[1 - this.activeDeckIdx];
    if (otherDeck) {
      otherDeck.onended = null;
      otherDeck.onerror = null;
      try { otherDeck.pause(); } catch (e) {}
    }

    if (deck.dataset.loadedUrl !== targetUrl) {
      deck.src = targetUrl;
      deck.dataset.loadedUrl = targetUrl;
    }
    deck.volume = 1.0;
    deck.playbackRate = this.ttsRate;
    deck.defaultPlaybackRate = this.ttsRate;

    const advanceToNextChunk = () => {
      if (sessionId !== this.ttsSessionId || this.ttsState !== 'playing') return;
      const nextPos = this.getNextTtsPosition(this.ttsUnitIndex, this.ttsChunkIndex);
      if (!nextPos) {
        this.stopTts();
        this.showToast('음성 읽기가 완료되었습니다.');
        return;
      }
      this.ttsUnitIndex = nextPos.unitIndex;
      this.ttsChunkIndex = nextPos.chunkIndex;
      this.activeDeckIdx = 1 - this.activeDeckIdx;
      this.speakCurrentChunk();
    };

    deck.onended = advanceToNextChunk;
    deck.onerror = () => {
      if (sessionId !== this.ttsSessionId || this.ttsState !== 'playing') return;
      // Offline fallback to local Web Speech API
      this.speakCurrentChunkLocalFallback(sessionId, chunkText, advanceToNextChunk);
    };

    const playPromise = deck.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => {
        if (sessionId !== this.ttsSessionId || this.ttsState !== 'playing') return;
        this.speakCurrentChunkLocalFallback(sessionId, chunkText, advanceToNextChunk);
      });
    }

    // Pre-buffer the next sentence chunk into the inactive deck immediately
    if (this.ttsDecksUnlocked) {
      this.preloadNextChunk();
    }
  }

  speakCurrentChunkLocalFallback(sessionId, chunkText, advanceCallback) {
    if (!('speechSynthesis' in window)) {
      if (advanceCallback) advanceCallback();
      return;
    }
    this.ttsUsingLocalFallback = true;
    const unit = this.ttsUnits[this.ttsUnitIndex];
    const text = chunkText || (unit && unit.chunks[this.ttsChunkIndex]) || '';
    if (!text) {
      if (advanceCallback) advanceCallback();
      return;
    }

    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = Math.min(2.0, Math.max(0.5, this.ttsRate));
    utter.pitch = 1.0;
    if (!this.ttsVoice) this.selectBestKoreanVoice();
    if (this.ttsVoice) utter.voice = this.ttsVoice;

    const nextFn = advanceCallback || (() => {
      if (sessionId !== this.ttsSessionId || this.ttsState !== 'playing') return;
      const nextPos = this.getNextTtsPosition(this.ttsUnitIndex, this.ttsChunkIndex);
      if (!nextPos) {
        this.stopTts();
        this.showToast('음성 읽기가 완료되었습니다.');
        return;
      }
      this.ttsUnitIndex = nextPos.unitIndex;
      this.ttsChunkIndex = nextPos.chunkIndex;
      this.speakCurrentChunk();
    });

    utter.onend = nextFn;
    utter.onerror = (e) => {
      if (sessionId !== this.ttsSessionId || this.ttsState !== 'playing') return;
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      nextFn();
    };
    window.speechSynthesis.speak(utter);
  }

  skipTtsUnit(delta) {
    if (!this.ttsPane || !this.ttsUnits.length) return;
    const targetIdx = Math.max(0, Math.min(this.ttsUnits.length - 1, this.ttsUnitIndex + delta));
    this.ttsUnitIndex = targetIdx;
    this.ttsChunkIndex = 0;
    this.ttsState = 'playing';
    this.updateTtsControlUI();
    this.speakCurrentChunk();
  }

  scrollTtsUnitIntoView(el) {
    const paneContent = el.closest('.pane-content');
    if (!paneContent) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const paneRect = paneContent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const topMargin = 40;
    const bottomMargin = 90;

    if (elRect.top < paneRect.top + topMargin || elRect.bottom > paneRect.bottom - bottomMargin) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  pauseTts() {
    if (this.ttsState !== 'playing') return;
    this.ttsSessionId++;
    if (this.ttsDecks) {
      this.ttsDecks.forEach(d => {
        try { d.pause(); } catch (e) {}
      });
    }
    if (this.ttsKeeperAudio) {
      try { this.ttsKeeperAudio.pause(); } catch (e) {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.ttsState = 'paused';
    this.updateMediaSessionMetadata();
    this.updateTtsControlUI();
  }

  resumeTts() {
    if (this.ttsState !== 'paused' || !this.ttsPane) return;
    this.ttsState = 'playing';
    if (this.ttsKeeperAudio) {
      this.ttsKeeperAudio.play().catch(() => {});
    }
    this.updateMediaSessionMetadata();
    this.updateTtsControlUI();

    const activeDeck = this.ttsDecks && this.ttsDecks[this.activeDeckIdx];
    if (!this.ttsUsingLocalFallback && activeDeck && activeDeck.src && activeDeck.currentTime > 0 && !activeDeck.ended) {
      activeDeck.playbackRate = this.ttsRate;
      activeDeck.play().catch(() => this.speakCurrentChunk());
    } else {
      this.speakCurrentChunk();
    }
  }

  stopTts() {
    this.ttsSessionId++;
    if (this.ttsDecks) {
      this.ttsDecks.forEach(d => {
        d.onended = null;
        d.onerror = null;
        try { d.pause(); } catch (e) {}
      });
    }
    if (this.ttsKeeperAudio) {
      try { this.ttsKeeperAudio.pause(); } catch (e) {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
    }
    this.ttsState = 'idle';
    this.ttsPane = null;
    this.ttsUnits = [];
    this.ttsUnitIndex = 0;
    this.ttsChunkIndex = 0;
    this.ttsUsingLocalFallback = false;

    document.querySelectorAll('.tts-reading').forEach(el => el.classList.remove('tts-reading'));
    this.updateTtsControlUI();
  }

  setTtsRate(val) {
    let num = Math.round(parseFloat(val) * 10) / 10;
    if (isNaN(num)) num = 1.0;
    num = Math.max(0.5, Math.min(3.0, num));
    this.ttsRate = num;
    localStorage.setItem('bible_tts_rate', String(num));

    if (this.ttsDecks) {
      this.ttsDecks.forEach(d => {
        d.playbackRate = num;
        d.defaultPlaybackRate = num;
      });
    }

    this.updateTtsControlUI();

    if (this.ttsState === 'playing' && this.ttsUsingLocalFallback) {
      this.speakCurrentChunkLocalFallback(this.ttsSessionId);
    }
  }

  adjustTtsRate(delta) {
    this.setTtsRate(this.ttsRate + delta);
  }

  cycleTtsRate() {
    const presets = [1.0, 1.2, 1.5, 2.0];
    const next = presets.find(p => p > this.ttsRate + 0.01) || presets[0];
    this.setTtsRate(next);
  }

  updateTtsControlUI() {
    const groups = document.querySelectorAll('.tts-control-group');
    const rateLabel = `${this.ttsRate.toFixed(1)}x`;

    groups.forEach(group => {
      const pane = group.dataset.ttsPane;
      const btnPlay = group.querySelector('.tts-btn-play');
      const btnStop = group.querySelector('.tts-btn-stop');
      const btnRate = group.querySelector('.tts-btn-rate');
      const stepBtns = group.querySelectorAll('.tts-btn-rate-step');

      if (btnRate) btnRate.textContent = rateLabel;

      const isActivePane = (this.ttsState !== 'idle') && (this.ttsPane === pane || pane === 'top');
      group.classList.toggle('active', isActivePane);

      if (isActivePane) {
        if (this.ttsState === 'playing') {
          btnPlay.textContent = '⏸';
          btnPlay.title = '일시정지';
        } else {
          btnPlay.textContent = '▶';
          btnPlay.title = '이어서 듣기';
        }
        if (btnStop) btnStop.style.display = 'inline-flex';
        if (btnRate) btnRate.style.display = 'inline-flex';
        stepBtns.forEach(b => { b.style.display = 'inline-flex'; });
      } else {
        btnPlay.textContent = '🔊';
        btnPlay.title = '음성으로 듣기 (선택한 위치 또는 처음부터)';
        if (btnStop) btnStop.style.display = 'none';
        if (btnRate) btnRate.style.display = 'none';
        stepBtns.forEach(b => { b.style.display = 'none'; });
      }
    });
  }

  getDefaultTtsPane() {
    if (this.activePanes.has('bible')) return 'bible';
    if (this.activePanes.has('commentary')) return 'commentary';
    if (this.activePanes.has('sermon')) return 'sermon';
    return 'bible';
  }

  selectTtsUnitInPane(paneName, unitEl) {
    const container = paneName === 'commentary' ? this.dom.commContent : this.dom.sermonContent;
    const prev = this.selectedTtsUnitEl[paneName];
    if (prev && prev === unitEl) {
      prev.classList.remove('tts-selected-unit');
      this.selectedTtsUnitEl[paneName] = null;
      return;
    }
    container.querySelectorAll('.tts-selected-unit').forEach(el => el.classList.remove('tts-selected-unit'));
    unitEl.classList.add('tts-selected-unit');
    this.selectedTtsUnitEl[paneName] = unitEl;
  }

  // ============================================================
  // EVENT BINDINGS
  // ============================================================
  bindEvents() {
    // 0. Pane Header TTS Control Group clicks
    document.querySelectorAll('.tts-control-group').forEach(group => {
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('.tts-btn');
        if (!btn) return;
        const rawPane = group.dataset.ttsPane;
        const pane = rawPane === 'top' ? (this.ttsPane || this.getDefaultTtsPane()) : rawPane;
        const action = btn.dataset.action;

        if (action === 'toggle') {
          if (this.ttsPane === pane && this.ttsState === 'playing') {
            this.pauseTts();
          } else if (this.ttsPane === pane && this.ttsState === 'paused') {
            this.resumeTts();
          } else {
            this.startTts(pane);
          }
        } else if (action === 'stop') {
          this.stopTts();
        } else if (action === 'rate-down') {
          this.adjustTtsRate(-0.1);
        } else if (action === 'rate-up') {
          this.adjustTtsRate(0.1);
        } else if (action === 'rate') {
          this.cycleTtsRate();
        }
      });
    });

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

    // 2. Click verse or inline TTS button in Bible Pane
    this.dom.bibleContent.addEventListener('click', (e) => {
      const ttsBtn = e.target.closest('.tts-inline-btn[data-tts-verse]');
      if (ttsBtn) {
        e.stopPropagation();
        const v = parseInt(ttsBtn.dataset.ttsVerse, 10);
        const verseItem = document.getElementById(`verse-${v}`);
        this.selectVerse(v, true, 'bible');
        this.startTts('bible', verseItem);
        return;
      }

      const verseItem = e.target.closest('.verse-item');
      if (verseItem) {
        const v = parseInt(verseItem.dataset.verse, 10);
        // If TTS is currently active in Bible pane, clicking any verse jumps playback there
        if (this.ttsPane === 'bible' && this.ttsState !== 'idle') {
          this.selectVerse(v, true, 'bible');
          this.startTts('bible', verseItem);
          return;
        }

        if (this.selectedVerse === v) {
          this.clearVerseSelection();
        } else {
          this.selectVerse(v, true, 'bible');
        }
      }
    });

    // Click commentary card / paragraph / inline TTS button
    this.dom.commContent.addEventListener('click', (e) => {
      const cardStartBtn = e.target.closest('.tts-inline-btn[data-tts-start-card]');
      if (cardStartBtn) {
        e.stopPropagation();
        const cardEl = document.getElementById(cardStartBtn.dataset.ttsStartCard);
        if (cardEl) this.startTts('commentary', cardEl);
        return;
      }

      const paraBtn = e.target.closest('.tts-para-btn');
      if (paraBtn) {
        e.stopPropagation();
        const unitEl = paraBtn.closest('.tts-unit');
        if (unitEl) {
          this.selectTtsUnitInPane('commentary', unitEl);
          this.startTts('commentary', unitEl);
        }
        return;
      }

      const unitEl = e.target.closest('.tts-unit');
      if (unitEl) {
        if (this.ttsPane === 'commentary' && this.ttsState !== 'idle') {
          this.startTts('commentary', unitEl);
          return;
        }
        this.selectTtsUnitInPane('commentary', unitEl);
      }

      const card = e.target.closest('.comm-card');
      if (card) {
        const covered = (card.getAttribute('data-covered-verses') || '').split(',').map(Number).filter(Boolean);
        if (covered.length > 0) {
          const firstV = covered[0];
          if (this.selectedVerse === firstV && !unitEl) {
            this.clearVerseSelection();
          } else if (this.selectedVerse !== firstV) {
            this.selectVerse(firstV, true, 'commentary');
          }
        }
      }
    });

    // Click sermon article / paragraph / inline TTS button
    this.dom.sermonContent.addEventListener('click', (e) => {
      const cardStartBtn = e.target.closest('.tts-inline-btn[data-tts-start-card]');
      if (cardStartBtn) {
        e.stopPropagation();
        const cardEl = document.getElementById(cardStartBtn.dataset.ttsStartCard);
        if (cardEl) this.startTts('sermon', cardEl);
        return;
      }

      const paraBtn = e.target.closest('.tts-para-btn');
      if (paraBtn) {
        e.stopPropagation();
        const unitEl = paraBtn.closest('.tts-unit');
        if (unitEl) {
          this.selectTtsUnitInPane('sermon', unitEl);
          this.startTts('sermon', unitEl);
        }
        return;
      }

      const unitEl = e.target.closest('.tts-unit');
      if (unitEl) {
        if (this.ttsPane === 'sermon' && this.ttsState !== 'idle') {
          this.startTts('sermon', unitEl);
          return;
        }
        this.selectTtsUnitInPane('sermon', unitEl);
      }

      const card = e.target.closest('.sermon-article');
      if (card) {
        const covered = (card.getAttribute('data-covered-verses') || '').split(',').map(Number).filter(Boolean);
        if (covered.length > 0) {
          const firstV = covered[0];
          if (this.selectedVerse === firstV && !unitEl) {
            this.clearVerseSelection();
          } else if (this.selectedVerse !== firstV) {
            this.selectVerse(firstV, true, 'sermon');
          }
        }
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

    // 6. 3-Pill Pane Selector Group
    if (this.dom.paneToggleGroup) {
      this.dom.paneToggleGroup.addEventListener('click', (e) => {
        const pill = e.target.closest('.pane-toggle-pill');
        if (pill && pill.dataset.pane) {
          this.togglePane(pill.dataset.pane);
        }
      });
    }

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
        this.togglePane('bible');
      } else if (e.key === '2') {
        this.togglePane('commentary');
      } else if (e.key === '3') {
        this.togglePane('sermon');
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

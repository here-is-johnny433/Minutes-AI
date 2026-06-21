/* ==========================================================================
   MINUTES.AI - PREMIUM ARCHITECTURE LOGIC
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  
  // ==========================================
  // 1. APPLICATION STATE
  // ==========================================
  const state = {
    apiKey: localStorage.getItem('minutae_api_key') || '',
    activeEngine: localStorage.getItem('minutae_active_engine') || 'cloud-gemini',
    dictationLang: localStorage.getItem('minutae_dictation_lang') || 'en-US',
    currentUser: null,
    meetings: [],
    inputMethod: 'microphone', // 'text' | 'microphone' | 'audio-file' | 'text-file'
    audioFile: { name: '', size: '', mimeType: '', file: null },
    textFile: { name: '', size: '' },
    audioLang: localStorage.getItem('minutae_audio_lang') || 'en-US',
    
    // Voice dictation / recording states
    isRecording: false,
    recordingStartTime: 0,
    recordingTimerInterval: null,
    // Audio capture (MediaRecorder) → transcribed by Gemini on stop.
    captureSource: localStorage.getItem('minutae_capture_source') || 'mic', // 'mic' | 'tab'
    mediaRecorder: null,
    micStream: null,
    audioChunks: [],
    audioChunksMime: '',
    recordedText: '',
    
    // AI session properties
    localAISession: null,
    localModelAvailability: 'checking', // 'available' | 'downloadable' | 'downloading' | 'unsupported'
    
    // Synthesize templates (initialized with defaults or customized overrides)
    templates: (() => {
      const defaults = {
        standard: {
          name: "Standard Chronological Minutes",
          prompt: `Create comprehensive, professional meeting minutes divided into the following sections:
1. **Meeting Details**: Title, Date (from context), Attendees (deduct from conversation), Facilitator (deduct).
2. **Executive Overview**: A robust paragraph summarizing the overall purpose and outcome of the meeting.
3. **Chronological Discussion Summary**: Detailed bullet points summarizing what was discussed, who made what points, and arguments raised.
4. **Decisions Made**: A clear, numbered list of all finalized decisions.
5. **Next Steps / Action Items**: Bullet points listing clear tasks, who is responsible, and deadlines.`
        },
        action: {
          name: "Action Items & Tasks Table",
          prompt: `Synthesize the transcript and notes into a highly task-oriented summary. The focus must be 100% on execution.
Generate a structured Markdown table summarizing the Action Items. The table must have exactly these columns:
| Task / Deliverable | Owner | Deadline | Priority (High/Medium/Low) | Status/Description |

Below the table, provide:
1. **Critical Path Items**: A bulleted section describing the 3 most urgent roadblocks or tasks.
2. **Dependencies & Risks**: Any items that depend on other tasks or have potential risks associated with them.`
        },
        executive: {
          name: "Executive Brief (TL;DR)",
          prompt: `Provide a high-level, ultra-polished Executive Brief designed for C-level leadership who did not attend the meeting.
Structure it with:
1. **TL;DR Highlights**: 3-4 bullet points outlining the highest-impact results.
2. **Strategic Decisions**: Strategic choices made, and their business implications.
3. **Key Progress / Status Updates**: Brief summary of project updates discussed.
4. **Critical Asks / Needs**: Immediate needs or blockers that require leadership attention.
Keep paragraphs brief, dense, and punchy.`
        },
        technical: {
          name: "Engineering & Tech Spec Summary",
          prompt: `Synthesize this into a technical spec summary. Focus on engineering architecture, designs, and systems discussed.
Structure it with:
1. **Architecture & Technical Decisions**: System diagrams discussed, database schema modifications, or APIs changes.
2. **Code & Implementation Notes**: Specific files, libraries, or technologies discussed.
3. **Bug Reports & Issues Addressed**: Technical problems identified and resolutions agreed upon.
4. **Testing & QA Actions**: Automated testing plans, manual QA scopes, and deployment steps.`
        },
        creative: {
          name: "Creative Concept Map",
          prompt: `Synthesize this meeting into a conceptual outline showing the relationship of ideas and lateral brainstorming.
Structure it with:
1. **Core Theme / Anchor Idea**: The single central concept of the meeting.
2. **Primary Conceptual Branches**: The major ideas explored, with hierarchical sub-bullets for supporting suggestions.
3. **Tangential Explorations**: Ideas that were briefly touched upon but rejected or deferred (wildcard suggestions).
4. **Inspirational Takeaways**: Creative summaries, analogies, or vision statements created during the meeting.`
        }
      };
      
      try {
        const custom = JSON.parse(localStorage.getItem('minutae_custom_templates') || '{}');
        const merged = { ...defaults };
        for (const key in defaults) {
          if (custom[key]) {
            merged[key] = { ...defaults[key], ...custom[key] };
          }
        }
        return merged;
      } catch (e) {
        console.error("Failed to parse custom templates", e);
        return defaults;
      }
    })()
  };

  // ==========================================
  // 2. DOM ELEMENT QUERIES
  // ==========================================
  const elements = {
    // Navigation
    navButtons: document.querySelectorAll('.nav-btn'),
    views: document.querySelectorAll('.content-view'),
    apiStatusBadge: document.getElementById('api-status-badge'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    sidebarOverlay: document.getElementById('sidebar-overlay'),
    sidebar: document.querySelector('.sidebar'),
    
    // Dashboard Workspace
    meetingTitle: document.getElementById('meeting-title'),
    transcriptInput: document.getElementById('transcript-input'),
    notesInput: document.getElementById('notes-input'),
    micToggleBtn: document.getElementById('mic-toggle-btn'),
    recordingStatus: document.getElementById('recording-status'),
    recordingTime: document.getElementById('recording-time'),
    dictationBar: document.querySelector('.dictation-bar'),
    templateSelect: document.getElementById('template-select'),
    btnGenerate: document.getElementById('btn-generate'),
    dictationLangSelect: document.getElementById('dictation-lang-select'),
    captureSourceSelect: document.getElementById('capture-source-select'),
    
    // New Audio Upload & Input Selector elements
    inputMethodSelect: document.getElementById('input-method-select'),
    textInputContainer: document.getElementById('text-input-container'),
    audioFileContainer: document.getElementById('audio-file-container'),
    audioDropzone: document.getElementById('audio-dropzone'),
    audioFileUpload: document.getElementById('audio-file-upload'),
    audioFileDetails: document.getElementById('audio-file-details'),
    audioFilename: document.getElementById('audio-filename'),
    audioFilesize: document.getElementById('audio-filesize'),
    btnRemoveAudio: document.getElementById('btn-remove-audio'),
    audioPlayer: document.getElementById('audio-player'),
    audioLangSelect: document.getElementById('audio-lang-select'),
    
    // New Text Upload selectors
    textFileContainer: document.getElementById('text-file-container'),
    textDropzone: document.getElementById('text-dropzone'),
    textFileUpload: document.getElementById('text-file-upload'),
    textFileDetails: document.getElementById('text-file-details'),
    textFilename: document.getElementById('text-filename'),
    textFilesize: document.getElementById('text-filesize'),
    btnRemoveText: document.getElementById('btn-remove-text'),
    
    // Archive View
    archiveGrid: document.getElementById('archive-grid'),
    archiveEmptyState: document.getElementById('archive-empty-state'),
    archiveSearch: document.getElementById('archive-search'),
    archiveFilterTemplate: document.getElementById('archive-filter-template'),
    
    // Settings View
    aiEngineSelect: document.getElementById('ai-engine-select'),
    cloudApiConfig: document.getElementById('cloud-api-config'),
    apiKeyInput: document.getElementById('api-key-input'),
    apiKeyToggleBtn: document.getElementById('api-key-toggle-btn'),
    localAiConfig: document.getElementById('local-ai-config'),
    localStatusBadge: document.getElementById('local-status-badge'),
    localStatusDesc: document.getElementById('local-status-desc'),
    btnTriggerModelDownload: document.getElementById('btn-trigger-model-download'),
    localDownloadProgressContainer: document.getElementById('local-download-progress-container'),
    localDownloadProgressFill: document.getElementById('local-download-progress-fill'),
    localDownloadPct: document.getElementById('local-download-pct'),
    btnClearArchive: document.getElementById('btn-clear-archive'),
    optionLocalAi: document.getElementById('option-local-ai'),
    templateEditSelect: document.getElementById('template-edit-select'),
    templateEditName: document.getElementById('template-edit-name'),
    templateEditPrompt: document.getElementById('template-edit-prompt'),
    btnSaveTemplate: document.getElementById('btn-save-template'),
    btnResetTemplates: document.getElementById('btn-reset-templates'),
    
    // Dialog Overlays
    generatingDialog: document.getElementById('generating-dialog'),
    btnCancelGeneration: document.getElementById('btn-cancel-generation'),
    resultsDialog: document.getElementById('results-dialog'),
    resultsMeta: document.getElementById('results-meta'),
    resultsTitle: document.getElementById('results-title'),
    resultsMarkdown: document.getElementById('results-markdown-rendered'),
    resultSavedTime: document.getElementById('result-saved-time'),
    btnSaveClose: document.getElementById('btn-save-close'),
    btnDownloadMd: document.getElementById('btn-download-md'),
    dialogCloseBtn: document.querySelector('.dialog-close-btn'),
    
    // Log items in Generating dialog
    logSteps: [
      document.getElementById('log-step-1'),
      document.getElementById('log-step-2'),
      document.getElementById('log-step-3'),
      document.getElementById('log-step-4')
    ],
    
    // Multiuser Auth elements
    authOverlay: document.getElementById('auth-overlay'),
    authForm: document.getElementById('auth-form'),
    authUsername: document.getElementById('auth-username'),
    authPassword: document.getElementById('auth-password'),
    btnLogout: document.getElementById('btn-logout'),
    
    // User management elements
    createUserDialog: document.getElementById('create-user-dialog'),
    createUserForm: document.getElementById('create-user-form'),
    createUsername: document.getElementById('create-username'),
    createPassword: document.getElementById('create-password'),
    createRole: document.getElementById('create-role'),
    createLanguage: document.getElementById('create-language'),
    userLanguageSelect: document.getElementById('user-language-select'),
    btnCreateUserModal: document.getElementById('btn-create-user-modal'),
    btnCloseCreateUser: document.getElementById('btn-close-create-user'),
    btnCancelCreateUser: document.getElementById('btn-cancel-create-user'),
    usersTableBody: document.getElementById('users-table-body'),
    
    // General
    toastContainer: document.getElementById('toast-container')
  };

  // ==========================================
  // 2.5. INPUT SOURCE SELECTOR & AUDIO UPLOADER CONTROLLER
  // ==========================================
  
  function initInputMethodControllers() {
    // Set initial audio language and change listener
    if (elements.audioLangSelect) {
      elements.audioLangSelect.value = state.audioLang;
      elements.audioLangSelect.addEventListener('change', (e) => {
        const selectedLang = e.target.value;
        state.audioLang = selectedLang;
        localStorage.setItem('minutae_audio_lang', selectedLang);
        const langName = elements.audioLangSelect.options[elements.audioLangSelect.selectedIndex].text;
        showToast(`Audio analysis language set to: ${langName}`, "info");
      });
    }

    // 1. Dropdown switcher
    elements.inputMethodSelect.addEventListener('change', (e) => {
      switchInputMethod(e.target.value);
    });

    function switchInputMethod(method) {
      state.inputMethod = method;

      // Capture-source + language selectors are only relevant for live recording
      const micControls = document.getElementById('mic-inline-controls');
      if (micControls) micControls.style.display = method === 'microphone' ? 'flex' : 'none';

      if (method === 'text') {
        elements.textInputContainer.style.display = 'flex';
        elements.dictationBar.style.display = 'none';
        elements.audioFileContainer.style.display = 'none';
        elements.textFileContainer.style.display = 'none';
      } else if (method === 'microphone') {
        elements.textInputContainer.style.display = 'flex';
        elements.dictationBar.style.display = 'flex';
        elements.audioFileContainer.style.display = 'none';
        elements.textFileContainer.style.display = 'none';
      } else if (method === 'audio-file') {
        elements.textInputContainer.style.display = 'none';
        elements.dictationBar.style.display = 'none';
        elements.audioFileContainer.style.display = 'block';
        elements.textFileContainer.style.display = 'none';
        
        // Stop active recording session if running
        if (state.isRecording) {
          state.isRecording = false;
          abortMicCapture();
          stopRecording();
        }
      } else if (method === 'text-file') {
        elements.dictationBar.style.display = 'none';
        elements.audioFileContainer.style.display = 'none';
        elements.textFileContainer.style.display = 'block';
        
        // If file is loaded, show text input container for editing
        if (state.textFile && state.textFile.name) {
          elements.textInputContainer.style.display = 'flex';
        } else {
          elements.textInputContainer.style.display = 'none';
        }
        
        // Stop active recording session if running
        if (state.isRecording) {
          state.isRecording = false;
          abortMicCapture();
          stopRecording();
        }
      }
    }

    // Initialize with default state
    switchInputMethod(state.inputMethod);

    // 2. Drag & Drop Handlers for Audio Upload
    const dropzone = elements.audioDropzone;
    
    // Prevent browser defaults
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Visual indicators on dragover
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => {
        dropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => {
        dropzone.classList.remove('dragover');
      }, false);
    });

    // Handle Drop file
    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        handleAudioFileSelect(files[0]);
      }
    });

    // Click to browse file
    dropzone.addEventListener('click', () => {
      elements.audioFileUpload.click();
    });

    // File Browse Change listener
    elements.audioFileUpload.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files.length > 0) {
        handleAudioFileSelect(files[0]);
      }
    });

    // Audio file analyzer and state processor.
    // We keep the raw File object and defer any reading/compression until
    // synthesis time — large files (100MB+) are compressed on the server and
    // uploaded to Gemini via the Files API rather than base64-inlined.
    function handleAudioFileSelect(file) {
      if (!file.type.startsWith('audio/')) {
        showToast("Invalid file type. Please upload an audio file.", "error");
        return;
      }

      // Generous cap — server-side compression + Gemini Files API handle big files
      const maxSizeBytes = 2 * 1024 * 1024 * 1024; // 2 GB
      if (file.size > maxSizeBytes) {
        showToast("Audio file exceeds the 2GB maximum.", "error");
        return;
      }

      elements.audioFilename.textContent = file.name;
      elements.audioFilesize.textContent = (file.size / (1024 * 1024)).toFixed(2) + " MB";

      state.audioFile = {
        name: file.name,
        size: file.size,
        mimeType: file.type || 'audio/mpeg',
        file: file
      };

      elements.audioPlayer.src = URL.createObjectURL(file);
      dropzone.style.display = 'none';
      elements.audioFileDetails.style.display = 'block';
      dropzone.style.opacity = '1';
      const bigNote = file.size > 15 * 1024 * 1024 ? " (will be compressed on synthesis)" : "";
      showToast("Audio file ready" + bigNote + ".", "success");
    }

    // Wipe audio upload state
    elements.btnRemoveAudio.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Wipe state
      state.audioFile = { name: '', size: '', mimeType: '', file: null };
      
      // Reset HTML controls
      elements.audioPlayer.src = '';
      elements.audioFileUpload.value = '';
      
      // Revert interfaces
      elements.audioFileDetails.style.display = 'none';
      dropzone.style.display = 'flex';
      
      showToast("Audio file removed", "info");
    });

    // 2.5. Drag & Drop Handlers for Text Upload
    const textDropzone = elements.textDropzone;
    
    // Prevent browser defaults
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      textDropzone.addEventListener(eventName, preventDefaults, false);
    });

    // Visual indicators on dragover
    ['dragenter', 'dragover'].forEach(eventName => {
      textDropzone.addEventListener(eventName, () => {
        textDropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      textDropzone.addEventListener(eventName, () => {
        textDropzone.classList.remove('dragover');
      }, false);
    });

    // Handle Drop file
    textDropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        handleTextFileSelect(files[0]);
      }
    });

    // Click to browse file
    textDropzone.addEventListener('click', () => {
      elements.textFileUpload.click();
    });

    // File Browse Change listener
    elements.textFileUpload.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files.length > 0) {
        handleTextFileSelect(files[0]);
      }
    });

    // Text file analyzer and state processor
    function handleTextFileSelect(file) {
      const isText = file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md');
      if (!isText) {
        showToast("Invalid file type. Please upload a .txt or .md text file.", "error");
        return;
      }

      // Max file size: 5MB
      const maxSizeBytes = 5 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        showToast("Text file exceeds maximum size of 5MB.", "error");
        return;
      }

      // Initialize loader UI
      elements.textFilename.textContent = file.name;
      elements.textFilesize.textContent = (file.size / 1024).toFixed(2) + " KB";

      const reader = new FileReader();
      
      reader.onloadstart = () => {
        textDropzone.style.opacity = '0.5';
        showToast("Processing text file...", "info");
      };

      reader.onload = (event) => {
        const textContent = event.target.result;
        
        state.textFile = {
          name: file.name,
          size: file.size
        };

        // Populate transcript editor
        elements.transcriptInput.value = textContent;
        
        // Toggle view from dropzone to active text details
        textDropzone.style.display = 'none';
        elements.textFileDetails.style.display = 'block';
        textDropzone.style.opacity = '1';
        
        // Show text input container for editing
        elements.textInputContainer.style.display = 'flex';
        
        showToast("Text file imported successfully!", "success");
      };

      reader.onerror = (err) => {
        console.error("FileReader text error", err);
        textDropzone.style.opacity = '1';
        showToast("Failed to read text file.", "error");
      };

      reader.readAsText(file);
    }

    // Wipe text upload state
    elements.btnRemoveText.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Wipe state
      state.textFile = { name: '', size: '' };
      
      // Reset HTML controls
      elements.transcriptInput.value = '';
      elements.textFileUpload.value = '';
      
      // Revert interfaces
      elements.textFileDetails.style.display = 'none';
      textDropzone.style.display = 'flex';
      
      // Hide input container
      elements.textInputContainer.style.display = 'none';
      
      showToast("Text file removed", "info");
    });
  }

  // ==========================================
  // 3. ROUTING & VIEWS INITIALIZATION
  // ==========================================
  
  function initRouting() {
    elements.navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-target');
        if (!targetView) return;
        
        switchView(targetView);
      });
    });
  }

  function switchView(viewId) {
    // If not logged in, force auth view and show login card
    if (!state.currentUser) {
      if (elements.authOverlay) {
        elements.authOverlay.style.display = 'flex';
      }
      return;
    }

    // Role-based route guard
    if ((viewId === 'users' || viewId === 'settings') && state.currentUser.role !== 'admin') {
      showToast("Access Denied: Administrative privileges required.", "error");
      switchView('dashboard');
      return;
    }

    // Update active nav button
    elements.navButtons.forEach(btn => {
      if (btn.getAttribute('data-target') === viewId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update visible view
    elements.views.forEach(view => {
      if (view.id === `view-${viewId}`) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    // Custom view trigger initializations
    if (viewId === 'archive') {
      renderArchiveGrid();
    } else if (viewId === 'users') {
      renderUsersTable();
    }
  }

  // ==========================================
  // 4. API BADGE & SETTINGS SYNCHRONIZATION
  // ==========================================
  
  function updateSystemBadges() {
    if (state.activeEngine === 'cloud-gemini') {
      if (state.apiKey) {
        elements.apiStatusBadge.className = "api-status connected";
        elements.apiStatusBadge.querySelector('.status-text').textContent = "Cloud API Key Configured";
      } else {
        elements.apiStatusBadge.className = "api-status disconnected";
        elements.apiStatusBadge.querySelector('.status-text').textContent = "No API Key Configured";
      }
    } else {
      // Local AI engine
      if (state.localModelAvailability === 'available') {
        elements.apiStatusBadge.className = "api-status local";
        elements.apiStatusBadge.querySelector('.status-text').textContent = "Local Gemini Nano Active";
      } else {
        elements.apiStatusBadge.className = "api-status disconnected";
        elements.apiStatusBadge.querySelector('.status-text').textContent = "Local AI Unavailable";
      }
    }
  }

  function refreshTemplateSelectors() {
    // Preserve selected values to avoid losing user selection
    const prevTemplateSelect = elements.templateSelect.value;
    const prevTemplateEditSelect = elements.templateEditSelect.value;
    const prevArchiveFilterTemplate = elements.archiveFilterTemplate.value;

    // 1. Refresh elements.templateSelect
    elements.templateSelect.innerHTML = '';
    for (const key in state.templates) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = state.templates[key].name;
      elements.templateSelect.appendChild(opt);
    }
    if (state.templates[prevTemplateSelect]) {
      elements.templateSelect.value = prevTemplateSelect;
    } else {
      elements.templateSelect.value = 'standard';
    }

    // 2. Refresh elements.templateEditSelect
    elements.templateEditSelect.innerHTML = '';
    for (const key in state.templates) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = state.templates[key].name;
      elements.templateEditSelect.appendChild(opt);
    }
    if (state.templates[prevTemplateEditSelect]) {
      elements.templateEditSelect.value = prevTemplateEditSelect;
    } else {
      elements.templateEditSelect.value = 'standard';
    }

    // 3. Refresh elements.archiveFilterTemplate
    elements.archiveFilterTemplate.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'All Templates';
    elements.archiveFilterTemplate.appendChild(allOpt);
    
    for (const key in state.templates) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = state.templates[key].name;
      elements.archiveFilterTemplate.appendChild(opt);
    }
    if (prevArchiveFilterTemplate === 'all' || state.templates[prevArchiveFilterTemplate]) {
      elements.archiveFilterTemplate.value = prevArchiveFilterTemplate;
    } else {
      elements.archiveFilterTemplate.value = 'all';
    }
  }

  function loadTemplateToEditor(templateKey) {
    const template = state.templates[templateKey];
    if (template) {
      elements.templateEditName.value = template.name;
      elements.templateEditPrompt.value = template.prompt;
    }
  }

  function initSettingsPanel() {
    // Fill values
    elements.apiKeyInput.value = state.apiKey;
    elements.aiEngineSelect.value = state.activeEngine;

    // User language preference (self-service)
    if (elements.userLanguageSelect) {
      elements.userLanguageSelect.addEventListener('change', async (e) => {
        const lang = e.target.value;
        if (!state.currentUser) return;
        try {
          const r = await fetch('/api/users/' + encodeURIComponent(state.currentUser.username) + '/language', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang })
          });
          if (!r.ok) { const er = await r.json().catch(() => ({})); throw new Error(er.error || r.status); }
          state.currentUser.language = lang;
          applyUserLanguageDefaults(lang);
          const label = { en: 'English', es: 'Spanish', de: 'German' }[lang] || lang;
          showToast(`Language set to ${label}. New meetings will use it.`, "success");
        } catch (err) {
          showToast("Could not save language: " + err.message, "error");
        }
      });
    }

    // Toggle view components depending on engine
    toggleEngineConfigVisibility(state.activeEngine);
    
    // Engine select listener
    elements.aiEngineSelect.addEventListener('change', (e) => {
      state.activeEngine = e.target.value;
      localStorage.setItem('minutae_active_engine', state.activeEngine);
      toggleEngineConfigVisibility(state.activeEngine);
      updateSystemBadges();
      showToast("Engine changed successfully", "info");
    });

    // API Key input change listener
    elements.apiKeyInput.addEventListener('input', (e) => {
      state.apiKey = e.target.value.trim();
      localStorage.setItem('minutae_api_key', state.apiKey);
      updateSystemBadges();
    });

    // Toggle API Key view visibility
    elements.apiKeyToggleBtn.addEventListener('click', () => {
      const type = elements.apiKeyInput.type === 'password' ? 'text' : 'password';
      elements.apiKeyInput.type = type;
      const isVisible = type === 'text';
      elements.apiKeyToggleBtn.innerHTML = isVisible 
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mini-icon" style="color: var(--accent-cyan);">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mini-icon" style="color: var(--text-muted);">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>`;
    });

    // Clear archive
    elements.btnClearArchive.addEventListener('click', async () => {
      if (confirm("Are you absolutely sure you want to permanently delete all archived meeting minutes? This operation is irreversible.")) {
        try { await apiClearAllMeetings(); }
        catch (err) {
          console.warn("Failed to clear meetings on server", err);
          showToast("Local archive cleared, but server delete failed: " + (err.message || err.name), "warning");
        }
        state.meetings = [];
        localStorage.setItem('minutae_meetings_' + state.currentUser.username, '[]');
        renderArchiveGrid();
        showToast("Local archive deleted successfully", "success");
      }
    });

    // Template Selector change listener
    elements.templateEditSelect.addEventListener('change', (e) => {
      loadTemplateToEditor(e.target.value);
    });

    // Save Template override
    elements.btnSaveTemplate.addEventListener('click', () => {
      const key = elements.templateEditSelect.value;
      const newName = elements.templateEditName.value.trim();
      const newPrompt = elements.templateEditPrompt.value.trim();

      if (!newName) {
        showToast("Template Name cannot be empty.", "error");
        return;
      }
      if (!newPrompt) {
        showToast("Template Instructions cannot be empty.", "error");
        return;
      }

      // Update state
      state.templates[key] = {
        name: newName,
        prompt: newPrompt
      };

      // Save custom overrides to localStorage
      try {
        const custom = JSON.parse(localStorage.getItem('minutae_custom_templates') || '{}');
        custom[key] = {
          name: newName,
          prompt: newPrompt
        };
        localStorage.setItem('minutae_custom_templates', JSON.stringify(custom));
        
        // Dynamic refresh across selectors
        refreshTemplateSelectors();
        showToast(`Template "${newName}" saved!`, "success");
      } catch (err) {
        console.error("Failed to save template override", err);
        showToast("Failed to persist custom templates.", "error");
      }
    });

    // Reset Templates to Factory Defaults
    elements.btnResetTemplates.addEventListener('click', () => {
      if (confirm("Are you absolutely sure you want to restore all templates to factory defaults? Your custom changes will be permanently discarded.")) {
        localStorage.removeItem('minutae_custom_templates');
        
        const defaults = {
          standard: {
            name: "Standard Chronological Minutes",
            prompt: `Create comprehensive, professional meeting minutes divided into the following sections:
1. **Meeting Details**: Title, Date (from context), Attendees (deduct from conversation), Facilitator (deduct).
2. **Executive Overview**: A robust paragraph summarizing the overall purpose and outcome of the meeting.
3. **Chronological Discussion Summary**: Detailed bullet points summarizing what was discussed, who made what points, and arguments raised.
4. **Decisions Made**: A clear, numbered list of all finalized decisions.
5. **Next Steps / Action Items**: Bullet points listing clear tasks, who is responsible, and deadlines.`
          },
          action: {
            name: "Action Items & Tasks Table",
            prompt: `Synthesize the transcript and notes into a highly task-oriented summary. The focus must be 100% on execution.
Generate a structured Markdown table summarizing the Action Items. The table must have exactly these columns:
| Task / Deliverable | Owner | Deadline | Priority (High/Medium/Low) | Status/Description |

Below the table, provide:
1. **Critical Path Items**: A bulleted section describing the 3 most urgent roadblocks or tasks.
2. **Dependencies & Risks**: Any items that depend on other tasks or have potential risks associated with them.`
          },
          executive: {
            name: "Executive Brief (TL;DR)",
            prompt: `Provide a high-level, ultra-polished Executive Brief designed for C-level leadership who did not attend the meeting.
Structure it with:
1. **TL;DR Highlights**: 3-4 bullet points outlining the highest-impact results.
2. **Strategic Decisions**: Strategic choices made, and their business implications.
3. **Key Progress / Status Updates**: Brief summary of project updates discussed.
4. **Critical Asks / Needs**: Immediate needs or blockers that require leadership attention.
Keep paragraphs brief, dense, and punchy.`
          },
          technical: {
            name: "Engineering & Tech Spec Summary",
            prompt: `Synthesize this into a technical spec summary. Focus on engineering architecture, designs, and systems discussed.
Structure it with:
1. **Architecture & Technical Decisions**: System diagrams discussed, database schema modifications, or APIs changes.
2. **Code & Implementation Notes**: Specific files, libraries, or technologies discussed.
3. **Bug Reports & Issues Addressed**: Technical problems identified and resolutions agreed upon.
4. **Testing & QA Actions**: Automated testing plans, manual QA scopes, and deployment steps.`
          },
          creative: {
            name: "Creative Concept Map",
            prompt: `Synthesize this meeting into a conceptual outline showing the relationship of ideas and lateral brainstorming.
Structure it with:
1. **Core Theme / Anchor Idea**: The single central concept of the meeting.
2. **Primary Conceptual Branches**: The major ideas explored, with hierarchical sub-bullets for supporting suggestions.
3. **Tangential Explorations**: Ideas that were briefly touched upon but rejected or deferred (wildcard suggestions).
4. **Inspirational Takeaways**: Creative summaries, analogies, or vision statements created during the meeting.`
          }
        };

        state.templates = defaults;
        
        // Dynamic selector sync
        refreshTemplateSelectors();
        loadTemplateToEditor(elements.templateEditSelect.value || 'standard');
        
        showToast("Templates restored to factory defaults", "success");
      }
    });

    // Initial input load inside templates editor panel
    loadTemplateToEditor(elements.templateEditSelect.value || 'standard');

    // Check Local Gemini Nano Status
    checkLocalGeminiNanoAvailability();
  }

  function toggleEngineConfigVisibility(engine) {
    if (engine === 'cloud-gemini') {
      elements.cloudApiConfig.style.display = 'flex';
      elements.localAiConfig.style.display = 'none';
    } else {
      elements.cloudApiConfig.style.display = 'none';
      elements.localAiConfig.style.display = 'block';
    }
  }

  // ==========================================
  // 5. LOCAL ON-DEVICE AI INTERFACES
  // ==========================================
  
  async function checkLocalGeminiNanoAvailability() {
    const isLanguageModelSupported = ('LanguageModel' in self);
    const isSummarizerSupported = ('Summarizer' in self);
    
    if (!isLanguageModelSupported && !isSummarizerSupported) {
      setLocalStatus('unsupported', "Chrome Native AI APIs are unsupported in this browser environment. Please ensure you are running Chrome 148+ with optimization guide flags enabled, or use the Cloud Gemini Engine.");
      elements.optionLocalAi.disabled = true;
      return;
    }

    try {
      setLocalStatus('checking', "Querying browser for Gemini Nano model availability...");
      
      const availability = await LanguageModel.availability();
      
      if (availability === 'available') {
        setLocalStatus('available', "Gemini Nano model is fully loaded on your device. Zero server calls, total privacy.");
      } else if (availability === 'downloadable') {
        setLocalStatus('downloadable', "Gemini Nano model is supported but not yet loaded on this device (~2GB download required).");
      } else {
        setLocalStatus('unsupported', "Gemini Nano is unsupported on this hardware or profile. Ensure you have 16GB+ RAM and Chrome AI flags enabled.");
        elements.optionLocalAi.disabled = true;
      }
    } catch (err) {
      console.error("Local availability check failed", err);
      setLocalStatus('unsupported', "Failed to initialize native AI check: " + err.message);
      elements.optionLocalAi.disabled = true;
    }
  }

  function setLocalStatus(status, text) {
    state.localModelAvailability = status;
    elements.localStatusDesc.textContent = text;
    
    // Status Badge classes
    elements.localStatusBadge.className = 'badge';
    elements.btnTriggerModelDownload.style.display = 'none';
    elements.localDownloadProgressContainer.style.display = 'none';
    
    if (status === 'available') {
      elements.localStatusBadge.classList.add('badge-cyan');
      elements.localStatusBadge.textContent = 'Ready';
      elements.optionLocalAi.disabled = false;
    } else if (status === 'checking') {
      elements.localStatusBadge.classList.add('badge-purple');
      elements.localStatusBadge.textContent = 'Checking';
    } else if (status === 'downloadable') {
      elements.localStatusBadge.classList.add('badge-purple');
      elements.localStatusBadge.textContent = 'Needs Setup';
      elements.btnTriggerModelDownload.style.display = 'block';
    } else if (status === 'downloading') {
      elements.localStatusBadge.classList.add('badge-purple');
      elements.localStatusBadge.textContent = 'Downloading';
      elements.localDownloadProgressContainer.style.display = 'block';
    } else {
      elements.localStatusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
      elements.localStatusBadge.style.color = '#ef4444';
      elements.localStatusBadge.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      elements.localStatusBadge.textContent = 'Unsupported';
    }
    
    updateSystemBadges();
  }

  // Setup local model download listener (user gesture required)
  elements.btnTriggerModelDownload.addEventListener('click', async () => {
    try {
      setLocalStatus('downloading', "Contacting browser framework to download model assets. Please do not close this window...");
      
      const session = await LanguageModel.create({
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            const pct = Math.round((e.loaded / e.total) * 100);
            elements.localDownloadProgressFill.style.width = `${pct}%`;
            elements.localDownloadPct.textContent = `${pct}%`;
          });
        }
      });
      
      // Successfully loaded!
      session.destroy(); // Destroy immediately to free up device memory
      setLocalStatus('available', "Gemini Nano model download complete! Offline summarization is active.");
      showToast("Local Gemini Nano ready!", "success");
    } catch (err) {
      console.error("Local download failed", err);
      setLocalStatus('downloadable', "Model download failed: " + err.message + ". Try again in a minute.");
      showToast("Model setup failed", "error");
    }
  });


  // ==========================================
  // MICROPHONE CAPTURE → GEMINI TRANSCRIPTION
  // ==========================================
  // Mic mode records audio with MediaRecorder (single mic consumer, no
  // Web Speech contention) and, on stop, sends the full recording to
  // Gemini 2.5 Flash multimodal for a high-quality transcript. There is
  // no lossy live preview — the transcript appears once, after stop.

  function pickAudioMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';
    // Prefer formats Gemini supports natively. Chrome typically lands on
    // audio/webm;codecs=opus, which Gemini accepts.
    const candidates = [
      'audio/ogg;codecs=opus',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/webm;codecs=opus',
      'audio/webm'
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return '';
  }

  // Starts audio capture from the selected source (mic or tab/system audio).
  // THROWS with a human-readable message on failure so the caller can surface
  // exactly why (no silent fallbacks).
  async function startMicCapture() {
    if (!window.isSecureContext) {
      throw new Error("Audio capture needs HTTPS (or localhost). This page isn't a secure context.");
    }
    if (typeof MediaRecorder === 'undefined') {
      throw new Error("This browser doesn't support MediaRecorder.");
    }

    const source = state.captureSource === 'tab' ? 'tab' : 'mic';

    if (source === 'tab') {
      // Capture clean digital audio from a tab/window/screen the user picks.
      // Far better than recording speakers through the mic for online
      // meetings (Zoom/Meet/Teams in a browser) and videos.
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error("This browser can't capture tab/system audio (no getDisplayMedia).");
      }
      let display;
      try {
        display = await navigator.mediaDevices.getDisplayMedia({
          video: true, // required by the API; we discard the video track
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
      } catch (e) {
        const name = e && e.name;
        if (name === 'NotAllowedError') {
          throw new Error("Screen-share cancelled or denied. Pick a tab and tick 'Share tab audio'.");
        }
        throw new Error("Could not capture tab audio: " + (e && e.message ? e.message : name));
      }
      const audioTracks = display.getAudioTracks();
      if (audioTracks.length === 0) {
        display.getTracks().forEach((t) => t.stop());
        throw new Error("No audio in that share. Re-share and enable 'Share tab audio' (Chrome: the checkbox at bottom-left).");
      }
      // Drop the video track — we only want audio — and keep an audio-only stream
      display.getVideoTracks().forEach((t) => { t.stop(); display.removeTrack(t); });
      state.micStream = display;
      // If the user clicks the browser's native "Stop sharing", end cleanly
      audioTracks[0].addEventListener('ended', () => {
        if (state.isRecording) elements.micToggleBtn.click();
      });
    } else {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("This browser doesn't expose microphone access (navigator.mediaDevices).");
      }
      try {
        state.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1
          }
        });
      } catch (e) {
        const name = e && e.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          throw new Error("Microphone permission denied. Allow it via the address-bar icon, then retry.");
        }
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          throw new Error("No microphone found. Check your input device.");
        }
        if (name === 'NotReadableError') {
          throw new Error("Microphone is in use by another app. Close it and retry.");
        }
        throw new Error("Could not access microphone: " + (e && e.message ? e.message : name));
      }
    }

    state.audioChunks = [];
    state.audioChunksMime = pickAudioMimeType();
    const opts = state.audioChunksMime ? { mimeType: state.audioChunksMime } : {};
    try {
      state.mediaRecorder = new MediaRecorder(state.micStream, opts);
    } catch (e) {
      try {
        state.mediaRecorder = new MediaRecorder(state.micStream);
      } catch (e2) {
        state.micStream.getTracks().forEach((t) => t.stop());
        state.micStream = null;
        throw new Error("MediaRecorder could not start: " + (e2 && e2.message ? e2.message : e2));
      }
    }
    state.audioChunksMime = state.audioChunksMime || state.mediaRecorder.mimeType || 'audio/webm';
    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) state.audioChunks.push(e.data);
    };
    state.mediaRecorder.start(2000); // flush a chunk every 2s (crash resilience)
  }

  // Hard teardown — abandon any in-flight recording without transcribing.
  // Used when switching input methods or resetting the workspace.
  function abortMicCapture() {
    if (state.mediaRecorder) {
      try { state.mediaRecorder.onstop = null; state.mediaRecorder.stop(); } catch {}
      state.mediaRecorder = null;
    }
    if (state.micStream) {
      state.micStream.getTracks().forEach((t) => t.stop());
      state.micStream = null;
    }
    state.audioChunks = [];
    state.audioChunksMime = '';
  }

  async function stopMicCapture() {
    if (!state.mediaRecorder) {
      if (state.micStream) {
        state.micStream.getTracks().forEach((t) => t.stop());
        state.micStream = null;
      }
      return null;
    }
    return new Promise((resolve) => {
      state.mediaRecorder.onstop = () => {
        const mime = (state.audioChunksMime || 'audio/webm').split(';')[0];
        const blob = new Blob(state.audioChunks, { type: mime });
        state.audioChunks = [];
        state.mediaRecorder = null;
        if (state.micStream) {
          state.micStream.getTracks().forEach((t) => t.stop());
          state.micStream = null;
        }
        resolve({ blob, mime });
      };
      try { state.mediaRecorder.stop(); }
      catch (e) {
        console.warn('[AudioCapture] stop failed', e);
        resolve(null);
      }
    });
  }

  // ==========================================
  // GEMINI AUDIO MEDIA PREP (inline ↔ compress + Files API)
  // ==========================================
  // Files inlined as base64 must keep the whole request under ~20MB. Past
  // that we compress on the server and upload via the Gemini Files API
  // (resumable, up to 2GB). The API key never leaves the browser.
  const GEMINI_INLINE_LIMIT = 15 * 1024 * 1024; // ~15MB raw → safe under the 20MB inline cap

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsDataURL(blob);
    });
  }

  // Stream a big file to our server's ffmpeg endpoint; returns a small Opus blob.
  function compressAudioOnServer(fileOrBlob, mime, signal, setStatus) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/compress');
      xhr.responseType = 'blob';
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && setStatus) setStatus(`Uploading audio to server… ${Math.round((e.loaded / e.total) * 100)}%`);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ blob: xhr.response, mime: xhr.getResponseHeader('Content-Type') || 'audio/ogg' });
        } else {
          reject(new Error('Server compression failed (HTTP ' + xhr.status + ')'));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during compression'));
      if (signal) signal.addEventListener('abort', () => xhr.abort());
      xhr.send(fileOrBlob);
    });
  }

  // Resumable upload to the Gemini Files API; returns a fileData part.
  async function uploadGeminiFile(blob, mime, displayName, signal, setStatus) {
    if (!state.apiKey) throw new Error("No Gemini API key configured in Settings");
    const key = state.apiKey;
    setStatus && setStatus('Starting upload to Gemini…');
    const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(blob.size),
        'X-Goog-Upload-Header-Content-Type': mime,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file: { display_name: displayName || 'meeting-audio' } }),
      signal
    });
    if (!startRes.ok) throw new Error('Gemini Files API start failed (HTTP ' + startRes.status + ')');
    const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) throw new Error('Gemini did not return an upload URL');

    setStatus && setStatus('Uploading to Gemini…');
    const upRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
      body: blob,
      signal
    });
    if (!upRes.ok) throw new Error('Gemini Files API upload failed (HTTP ' + upRes.status + ')');
    let file = (await upRes.json()).file;

    // Poll until the file finishes processing
    setStatus && setStatus('Gemini is processing the audio…');
    let tries = 0;
    while (file && file.state === 'PROCESSING' && tries < 150) {
      await waitMs(2000);
      tries++;
      const pr = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${key}`, { signal });
      if (!pr.ok) throw new Error('Gemini file status check failed (HTTP ' + pr.status + ')');
      file = await pr.json();
    }
    if (!file || file.state !== 'ACTIVE') throw new Error('Gemini file did not become ready (state: ' + (file && file.state) + ')');
    return { fileData: { mimeType: file.mimeType || mime, fileUri: file.uri } };
  }

  // Returns a Gemini "part" for the audio — inline for small, Files API for big.
  async function prepareGeminiAudio(fileOrBlob, mime, signal, setStatus) {
    if (fileOrBlob.size <= GEMINI_INLINE_LIMIT) {
      const base64 = await blobToBase64(fileOrBlob);
      return { inlineData: { mimeType: mime, data: base64 } };
    }
    setStatus && setStatus('Compressing audio on the server…');
    const compressed = await compressAudioOnServer(fileOrBlob, mime, signal, setStatus);
    return await uploadGeminiFile(compressed.blob, compressed.mime, 'meeting-audio', signal, setStatus);
  }

  async function transcribeAudioWithGemini(blob, mime, langName, context) {
    if (!state.apiKey) throw new Error("No Gemini API key configured in Settings");
    const setStatus = (s) => { if (elements.recordingStatus) elements.recordingStatus.textContent = s; };
    const media = await prepareGeminiAudio(blob, mime, null, setStatus);

    // Context biasing: feeding the meeting title + notes helps Gemini get
    // proper nouns, names, and domain terms right (a standard ASR technique).
    const contextBlock = context && context.trim()
      ? `\n\nContext to help with proper nouns, names, companies, and jargon (these terms may appear in the audio — spell them correctly when you hear them, but do NOT inject them if they aren't actually spoken):\n"""${context.trim().slice(0, 2000)}"""`
      : '';
    const prompt = `Transcribe this audio recording verbatim${langName ? ' (spoken language: ' + langName + ')' : ''}. Output only the raw transcript text, no commentary, no timestamps, no speaker labels unless they are obvious from explicit name introductions. Preserve proper nouns, brand names, and technical terms accurately. Do not summarize, do not paraphrase, do not skip filler words if they carry meaning.${contextBlock}`;

    return await runCloudGeminiGeneration(prompt, null, media);
  }

  async function transcribeAndApplyCapturedAudio(captured) {
    if (!captured || !captured.blob) {
      elements.recordingStatus.textContent = "Microphone Idle";
      showToast("No audio was captured. Nothing to transcribe.", "error");
      return;
    }
    if (captured.blob.size < 1000) {
      elements.recordingStatus.textContent = "Microphone Idle";
      showToast("Recording too short to transcribe. Try again and speak for a few seconds.", "warning");
      return;
    }
    if (!state.apiKey) {
      elements.recordingStatus.textContent = "Microphone Idle";
      showToast("No Gemini API key set. Add one in Settings to transcribe recordings.", "error");
      return;
    }
    const sizeMB = (captured.blob.size / 1024 / 1024).toFixed(1);
    elements.recordingStatus.textContent = `Transcribing with Gemini… (${sizeMB} MB)`;
    showToast(`Audio captured (${sizeMB} MB). Generating transcript with Gemini…`, "info");
    elements.micToggleBtn.disabled = true;
    try {
      const langName = elements.dictationLangSelect && elements.dictationLangSelect.options[elements.dictationLangSelect.selectedIndex] && elements.dictationLangSelect.options[elements.dictationLangSelect.selectedIndex].text;
      // Bias transcription with the meeting title + any notes the user typed,
      // so proper nouns and domain terms come out correct.
      const titleCtx = (elements.meetingTitle && elements.meetingTitle.value || '').trim();
      const notesCtx = (elements.notesInput && elements.notesInput.value || '').trim();
      const context = [titleCtx, notesCtx].filter(Boolean).join('\n');
      const transcript = await transcribeAudioWithGemini(captured.blob, captured.mime, langName, context);
      // Append to any text already in the box rather than clobbering it
      const existing = elements.transcriptInput.value.trim();
      elements.transcriptInput.value = existing ? (existing + '\n\n' + transcript) : transcript;
      state.recordedText = elements.transcriptInput.value;
      elements.transcriptInput.scrollTop = elements.transcriptInput.scrollHeight;
      elements.recordingStatus.textContent = "Microphone Idle";
      showToast("Transcript ready ✓", "success");
    } catch (e) {
      console.error("Gemini transcription failed", e);
      elements.recordingStatus.textContent = "Microphone Idle";
      showToast(`Transcription failed: ${e.message}`, "error");
    } finally {
      elements.micToggleBtn.disabled = false;
    }
  }

  function initVoiceDictation() {
    const micSupported = typeof MediaRecorder !== 'undefined' &&
      navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

    if (!micSupported) {
      elements.recordingStatus.textContent = "Recording Unsupported";
      elements.micToggleBtn.disabled = true;
      elements.micToggleBtn.style.cursor = 'not-allowed';
      elements.micToggleBtn.title = "This browser can't record audio (no MediaRecorder/getUserMedia).";
      return;
    }

    // Set initial dropdown values
    elements.dictationLangSelect.value = state.dictationLang;
    if (elements.captureSourceSelect) {
      elements.captureSourceSelect.value = state.captureSource;
      elements.captureSourceSelect.addEventListener('change', (e) => {
        state.captureSource = e.target.value === 'tab' ? 'tab' : 'mic';
        localStorage.setItem('minutae_capture_source', state.captureSource);
        showToast(
          state.captureSource === 'tab'
            ? "Source: Tab / System Audio — best for online meetings & videos. You'll pick what to share."
            : "Source: Microphone — best for in-person meetings.",
          "info"
        );
      });
    }

    // Language is only a hint passed to Gemini at transcription time; changing
    // it mid-recording is harmless and needs no restart.
    elements.dictationLangSelect.addEventListener('change', (e) => {
      state.dictationLang = e.target.value;
      localStorage.setItem('minutae_dictation_lang', state.dictationLang);
      const langName = elements.dictationLangSelect.options[elements.dictationLangSelect.selectedIndex].text;
      showToast(`Transcription language: ${langName}`, "info");
    });

    elements.micToggleBtn.addEventListener('click', async () => {
      if (state.isRecording) {
        // STOP → transcribe
        state.isRecording = false;
        stopRecording();
        const captured = await stopMicCapture();
        await transcribeAndApplyCapturedAudio(captured);
      } else {
        // START
        try {
          await startMicCapture();
        } catch (e) {
          console.error("Audio capture failed to start", e);
          showToast(e.message || "Could not start recording.", "error");
          return;
        }
        state.isRecording = true;
        elements.dictationBar.classList.add('active');
        elements.micToggleBtn.classList.add('active');
        elements.recordingStatus.textContent = state.captureSource === 'tab' ? "Recording tab audio…" : "Recording…";
        state.recordingStartTime = Date.now();
        elements.recordingTime.textContent = "00:00";
        if (state.recordingTimerInterval) clearInterval(state.recordingTimerInterval);
        state.recordingTimerInterval = setInterval(updateRecordingClock, 1000);
        showToast("Recording started — transcript appears when you stop.", "info");
      }
    });
  }

  function resetWorkspaceForNextMeeting() {
    if (state.isRecording) {
      state.isRecording = false;
      stopRecording();
    }
    // Drop any captured audio so we don't transcribe a stale recording
    abortMicCapture();
    state.recordedText = '';
    elements.meetingTitle.value = '';
    elements.transcriptInput.value = '';
    elements.notesInput.value = '';
    if (state.audioFile && state.audioFile.file && elements.btnRemoveAudio) elements.btnRemoveAudio.click();
    if (state.textFile && state.textFile.name && elements.btnRemoveText) elements.btnRemoveText.click();
  }

  function stopRecording() {
    state.isRecording = false;
    elements.dictationBar.classList.remove('active');
    elements.micToggleBtn.classList.remove('active');
    elements.recordingStatus.textContent = "Microphone Idle";

    if (state.recordingTimerInterval) {
      clearInterval(state.recordingTimerInterval);
      state.recordingTimerInterval = null;
    }
  }

  function updateRecordingClock() {
    const totalSecs = Math.floor((Date.now() - state.recordingStartTime) / 1000);
    const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    elements.recordingTime.textContent = `${mins}:${secs}`;
  }



  // ==========================================
  // 7. AI MEETING MINUTES SYNTHESIZER
  // ==========================================
  
  // Custom Regex Client-Side Markdown Parser for results overlay!
  // HTML-escape any string before injecting into innerHTML. Covers both
  // text content and quoted attribute values. Use everywhere a string from
  // localStorage, user input, or AI output is interpolated into HTML.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseMarkdown(mdText) {
    if (!mdText) return '';
    
    let html = mdText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headings
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#### (.*?)$/gm, '<h4>$1</h4>');

    // Bold & Italics
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Blockquotes
    html = html.replace(/^&gt; (.*?)$/gm, '<blockquote>$1</blockquote>');

    // Code blocks
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Tables parsing (rough client-side regex converter)
    const lines = html.split('\n');
    let inTable = false;
    let tableHtml = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('|') && line.endsWith('|')) {
        // Skip separator line |---|
        if (line.includes('---')) continue;
        
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        
        if (!inTable) {
          inTable = true;
          tableHtml += '<table><thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
        } else {
          tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
        }
        lines[i] = ''; // clear line
      } else {
        if (inTable) {
          inTable = false;
          tableHtml += '</tbody></table>';
          lines[i] = tableHtml + '\n' + lines[i];
          tableHtml = '';
        }
      }
    }
    
    html = lines.join('\n');

    // Bullet lists
    html = html.replace(/^\s*-\s+(.*?)$/gm, '<li>$1</li>');
    html = html.replace(/^\s*\*\s+(.*?)$/gm, '<li>$1</li>');
    
    // Group adjacent <li> elements under a single <ul>
    html = html.replace(/(<li>.*?<\/li>)+/gs, (match) => `<ul>${match}</ul>`);

    // Clean up empty lines
    html = html.replace(/\n\n/g, '<p></p>');
    
    return html;
  }

  // Trigger Synthesizer
  elements.btnGenerate.addEventListener('click', async () => {
    const title = elements.meetingTitle.value.trim() || 'Weekly Meeting';
    const transcript = elements.transcriptInput.value.trim();
    const notes = elements.notesInput.value.trim();
    const templateKey = elements.templateSelect.value;
    
    // Validation based on input method
    if (state.inputMethod === 'audio-file') {
      if (!state.audioFile.file) {
        showToast("Please upload an audio file first.", "error");
        return;
      }
      if (state.activeEngine === 'local-gemini') {
        showToast("On-device Gemini Nano does not support direct audio analysis. Please use the Cloud Gemini engine.", "error");
        return;
      }
    } else if (state.inputMethod === 'text-file') {
      if (!state.textFile.name || !transcript) {
        showToast("Please upload a text file first.", "error");
        return;
      }
    } else {
      if (!transcript) {
        showToast("Please enter or record a meeting transcript first.", "error");
        return;
      }
    }

    if (state.activeEngine === 'cloud-gemini' && !state.apiKey) {
      showToast("Google Gemini API Key is missing. Please add one in settings.", "error");
      switchView('settings');
      return;
    }

    if (state.activeEngine === 'local-gemini' && state.localModelAvailability !== 'available') {
      showToast("Local Gemini Nano model is not ready. Please download it in settings or select Cloud Engine.", "error");
      switchView('settings');
      return;
    }

    // Initialize Loading overlay
    elements.generatingDialog.showModal();
    updateProgressDialogState(0);
    
    let isCancelled = false;
    
    const cancelController = new AbortController();
    elements.btnCancelGeneration.onclick = () => {
      isCancelled = true;
      cancelController.abort();
      elements.generatingDialog.close();
      showToast("Generation cancelled by user", "info");
    };

    try {
      // Step 1 log: Format transcripts
      await waitMs(700);
      if (isCancelled) return;
      updateProgressDialogState(1);

      // Step 2 log: Merge handwritten notes
      await waitMs(900);
      if (isCancelled) return;
      updateProgressDialogState(2);

      const template = state.templates[templateKey];
      let fullPrompt = "";
      
      if (state.inputMethod === 'audio-file') {
        const audioLangName = elements.audioLangSelect.options[elements.audioLangSelect.selectedIndex].text;
        fullPrompt = `You are a world-class AI executive assistant. Your task is to write detailed meeting minutes based on the provided meeting audio file and optional hand-written personal notes.
        
        IMPORTANT: The meeting audio is spoken in ${audioLangName}. You MUST synthesize and write the final meeting minutes in ${audioLangName}. Do NOT translate the content to English or any other language.
        
        MEETING TITLE: ${title}
        
        ${notes ? `PERSONAL HANDWRITTEN NOTES (Correct name spellings, dates, or specific details from here):
        ${notes}` : ''}
        
        TEMPLATE SPECIFIC FORMAT RULES:
        ${template.prompt}
        
        Generate a premium, clean Markdown document summarizing this meeting based strictly on the rules above. Do not include any meta-commentary, introductory text, or trailing developer notes. Start directly with the Markdown layout.`;
      } else {
        const dictationLangName = elements.dictationLangSelect.options[elements.dictationLangSelect.selectedIndex].text;
        const langInstruction = state.inputMethod === 'microphone'
          ? `\n        IMPORTANT: The meeting transcript is spoken in ${dictationLangName}. You MUST synthesize and write the final meeting minutes in ${dictationLangName}. Do NOT translate the content to English or any other language.\n`
          : '';

        fullPrompt = `You are a world-class AI executive assistant. Your task is to write detailed meeting minutes based on a raw transcript and optional hand-written personal notes.
        ${langInstruction}
        MEETING TITLE: ${title}
        
        RAW TRANSCRIPT:
        ${transcript}
        
        ${notes ? `PERSONAL HANDWRITTEN NOTES (Correct name spellings, dates, or specific details from here):
        ${notes}` : ''}
        
        TEMPLATE SPECIFIC FORMAT RULES:
        ${template.prompt}
        
        Generate a premium, clean Markdown document summarizing this meeting based strictly on the rules above. Do not include any meta-commentary, introductory text (like "Here is your summary"), or trailing developer notes. Start directly with the Markdown layout.`;
      }

      let summaryResult = '';
      
      // Step 3 log: Summarizing with AI
      updateProgressDialogState(3);

      if (state.activeEngine === 'cloud-gemini') {
        let mediaPart = null;
        if (state.inputMethod === 'audio-file') {
          // Inline small files; compress + Files-API for large ones
          mediaPart = await prepareGeminiAudio(
            state.audioFile.file,
            state.audioFile.mimeType,
            cancelController.signal,
            setGenStatus
          );
          if (isCancelled) return;
          setGenStatus('Synthesizing with selected template…');
        }
        summaryResult = await runCloudGeminiGeneration(fullPrompt, cancelController.signal, mediaPart);
      } else {
        summaryResult = await runLocalGeminiNanoGeneration(fullPrompt, cancelController.signal);
      }

      if (isCancelled) return;
      updateProgressDialogState(4);
      await waitMs(400);

      // Save to cache archive
      const newMeeting = {
        id: 'meet_' + Date.now(),
        title: title,
        date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        rawDate: Date.now(),
        transcript: state.inputMethod === 'audio-file' ? `[Synthesized from uploaded audio file: ${state.audioFile.name}]` : transcript,
        notes: notes,
        template: templateKey,
        summary: summaryResult
      };

      state.meetings.unshift(newMeeting);
      localStorage.setItem('minutae_meetings_' + state.currentUser.username, JSON.stringify(state.meetings));
      try { await apiWriteMeeting(newMeeting); }
      catch (err) {
        console.error("Failed to push meeting to server", err);
        showToast("Saved to cache, but could not sync to server: " + (err.message || err.name), "warning");
      }

      elements.generatingDialog.close();

      // Wipe workspace so the user can start a new meeting cleanly
      resetWorkspaceForNextMeeting();

      // Present in Results dialog
      showResultsDialog(newMeeting);
      showToast("Minutes synthesized successfully!", "success");

    } catch (err) {
      console.error(err);
      if (!isCancelled) {
        elements.generatingDialog.close();
        showToast("Generation failed: " + err.message, "error");
      }
    }
  });

  // Cloud Gemini REST Client
  // `media` is a prebuilt Gemini part: { inlineData: {...} } or { fileData: {...} },
  // produced by prepareGeminiAudio(). Null for text-only generations.
  async function runCloudGeminiGeneration(prompt, signal, media = null) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`;

    const parts = [];
    if (media) parts.push(media);
    parts.push({ text: prompt });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: parts
        }]
      }),
      signal: signal
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Google API Error: ${errMsg}`);
    }

    const data = await response.json();
    const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!generatedText) {
      throw new Error("Empty response candidate returned from Gemini Cloud.");
    }

    return generatedText;
  }

  // On-Device Local Prompt Generation
  async function runLocalGeminiNanoGeneration(prompt, signal) {
    if (!('LanguageModel' in self)) {
      throw new Error("LanguageModel interface is not supported on this browser.");
    }

    const session = await LanguageModel.create();
    
    try {
      // Batch prompt API call
      const result = await session.prompt(prompt, { signal: signal });
      session.destroy(); // Always cleanup memory!
      return result;
    } catch (err) {
      session.destroy();
      throw err;
    }
  }

  function updateProgressDialogState(stepIndex) {
    elements.logSteps.forEach((step, idx) => {
      step.className = 'log-item';
      if (idx < stepIndex) {
        step.classList.add('completed');
      } else if (idx === stepIndex) {
        step.classList.add('active');
      }
    });
  }

  function waitMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Update the generating dialog's sub-status line (compression/upload progress)
  function setGenStatus(text) {
    const el = document.getElementById('gen-substatus');
    if (el) el.textContent = text;
  }

  // ==========================================
  // 8. RESULTS OVERLAY & EXPORTS
  // ==========================================
  let activeMeetingDetails = null;

  function showResultsDialog(meeting) {
    activeMeetingDetails = meeting;
    
    elements.resultsMeta.textContent = state.templates[meeting.template] ? state.templates[meeting.template].name : 'Custom Template';
    elements.resultsTitle.textContent = meeting.title;
    elements.resultSavedTime.textContent = `Generated on ${meeting.date}`;
    
    // Parse Markdown to HTML
    elements.resultsMarkdown.innerHTML = parseMarkdown(meeting.summary);
    
    elements.resultsDialog.showModal();
  }

  // Dialog Close controls
  elements.btnSaveClose.addEventListener('click', () => {
    elements.resultsDialog.close();
    switchView('archive');
  });

  // Download the current meeting's minutes as a .md file
  elements.btnDownloadMd.addEventListener('click', () => {
    if (!activeMeetingDetails) return;
    const m = activeMeetingDetails;
    const md = `# ${m.title}\n\n_${m.date}_\n\n${m.summary || ''}\n`;
    const slug = (m.title || 'meeting').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'meeting';
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Downloaded .md", "success");
  });

  elements.dialogCloseBtn.addEventListener('click', () => {
    elements.resultsDialog.close();
  });

  // Safe light-dismiss backdrop click fallback for browsers lacking closedBy support (like Safari)
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    elements.resultsDialog.addEventListener('click', (event) => {
      if (event.target !== elements.resultsDialog) return;
      const rect = elements.resultsDialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (!isDialogContent) {
        elements.resultsDialog.close();
      }
    });
  }

  // ==========================================
  // 9. ARCHIVE BROWSER (CRUD)
  // ==========================================
  
  function renderArchiveGrid() {
    const searchQuery = elements.archiveSearch.value.toLowerCase().trim();
    const templateFilter = elements.archiveFilterTemplate.value;
    
    // Clear grid
    elements.archiveGrid.innerHTML = '';
    
    const filteredMeetings = state.meetings.filter(m => {
      const matchesSearch = m.title.toLowerCase().includes(searchQuery) || 
                            m.summary.toLowerCase().includes(searchQuery) ||
                            m.notes.toLowerCase().includes(searchQuery);
      
      const matchesFilter = templateFilter === 'all' || m.template === templateFilter;
      
      return matchesSearch && matchesFilter;
    });

    if (filteredMeetings.length === 0) {
      elements.archiveGrid.style.display = 'none';
      elements.archiveEmptyState.style.display = 'flex';
      return;
    }

    elements.archiveGrid.style.display = 'grid';
    elements.archiveEmptyState.style.display = 'none';

    filteredMeetings.forEach(m => {
      const card = document.createElement('article');
      card.className = 'arch-card';

      // Plain-text teaser from the summary
      const teaserText = m.summary
        .replace(/[#*`\-|[\]()]/g, '')
        .replace(/\n+/g, ' ')
        .trim()
        .substring(0, 160) + '…';

      const tmplName = (state.templates[m.template] ? state.templates[m.template].name : 'Custom').split(' ')[0];
      const wordCount = (m.summary.trim().match(/\S+/g) || []).length;

      // Owner shown in the footer when admin views someone else's meeting
      const viewerIsAdmin = state.currentUser && state.currentUser.role === 'admin';
      const showOwner = viewerIsAdmin && m._owner && m._owner !== state.currentUser.username;
      const ownerTag = showOwner ? `<span class="arch-owner">by ${esc(m._owner)}</span>` : '';

      card.innerHTML = `
        <div class="arch-top">
          <span class="arch-tag">${esc(tmplName)}</span>
          <span class="arch-date mono">${esc(m.date)}</span>
        </div>
        <h3>${esc(m.title)}</h3>
        <p>${esc(teaserText)}</p>
        <div class="arch-foot">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>
          <span>${wordCount.toLocaleString()} words</span>
          ${ownerTag}
        </div>
        <button class="delete-meet-btn" data-id="${esc(m.id)}" aria-label="Delete meeting">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      `;

      // Open details dialog
      card.addEventListener('click', (e) => {
        // Prevent trigger when clicking delete button
        if (e.target.closest('.delete-meet-btn')) return;
        showResultsDialog(m);
      });

      // Delete listener
      card.querySelector('.delete-meet-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const idToDelete = e.target.closest('.delete-meet-btn').getAttribute('data-id');

        if (confirm("Are you sure you want to delete this meeting summary from your local archive?")) {
          const target = state.meetings.find(meet => meet.id === idToDelete);
          state.meetings = state.meetings.filter(meet => meet.id !== idToDelete);
          localStorage.setItem('minutae_meetings_' + state.currentUser.username, JSON.stringify(state.meetings));
          if (target) {
            try { await apiDeleteMeeting(target); }
            catch (err) {
              console.warn("Failed to delete meeting on server", err);
              showToast("Removed locally, but server delete failed: " + (err.message || err.name), "warning");
            }
          }
          renderArchiveGrid();
          showToast("Meeting deleted", "info");
        }
      });

      elements.archiveGrid.appendChild(card);
    });
  }

  // Bind archive filters
  elements.archiveSearch.addEventListener('input', renderArchiveGrid);
  elements.archiveFilterTemplate.addEventListener('change', renderArchiveGrid);

  // ==========================================
  // 10. SYSTEM UTILITIES (TOASTS)
  // ==========================================
  
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Choose icon
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else {
      // Info / speech
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span>${esc(message)}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    // Remove toast with slide out after 3.5s
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('transitionend', () => {
        toast.remove();
      });
    }, 3500);
  }

  // ==========================================
  // 10.4. SERVER-SIDE MEETING STORAGE (per-user, cookie-authenticated)
  // ==========================================
  // Meetings live as .md files in the api container's docker volume, scoped
  // per user. The browser authenticates via an HttpOnly session cookie set
  // at login, so every /api request is identified server-side — no headers
  // to spoof. localStorage is only a fast-boot cache for instant paint.

  async function apiReadAllMeetings() {
    const r = await fetch('/api/meetings', { cache: 'no-store' });
    if (!r.ok) throw new Error('GET /api/meetings → ' + r.status);
    return r.json();
  }

  async function apiWriteMeeting(meeting) {
    const r = await fetch('/api/meetings/' + encodeURIComponent(meeting.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meeting)
    });
    if (!r.ok) throw new Error('PUT /api/meetings → ' + r.status);
    return r.json();
  }

  async function apiDeleteMeeting(meetingOrId) {
    const id = typeof meetingOrId === 'string' ? meetingOrId : meetingOrId.id;
    const r = await fetch('/api/meetings/' + encodeURIComponent(id), { method: 'DELETE' });
    if (!r.ok) throw new Error('DELETE /api/meetings/:id → ' + r.status);
  }

  async function apiClearAllMeetings() {
    const r = await fetch('/api/meetings', { method: 'DELETE' });
    if (!r.ok) throw new Error('DELETE /api/meetings → ' + r.status);
  }

  // Pull the authoritative list from the server. If the server is empty
  // but localStorage has cached meetings (e.g., migrating from the old
  // File System Access API flow), push them up before returning.
  async function syncMeetingsFromServer() {
    try {
      const remote = await apiReadAllMeetings();
      const local = Array.isArray(state.meetings) ? state.meetings : [];
      if (remote.length === 0 && local.length > 0) {
        for (const m of local) {
          try { await apiWriteMeeting(m); }
          catch (e) { console.warn('migrate failed for', m && m.id, e); }
        }
        showToast(`Migrated ${local.length} cached meeting(s) to server storage.`, "success");
        return await apiReadAllMeetings();
      }
      return remote;
    } catch (e) {
      console.warn('Server storage unreachable; using localStorage cache.', e);
      return null;
    }
  }

  // ==========================================
  // 10.5. AUTHENTICATION & USER MANAGEMENT (server-enforced)
  // ==========================================
  // Login posts to the API, which sets an HttpOnly session cookie. All
  // identity/role decisions happen server-side; the client just reflects
  // what /api/auth/me reports. No passwords or user records live in the
  // browser anymore.

  function initUserAuth() {
    // Login form → POST /api/auth/login
    elements.authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = elements.authUsername.value.trim().toLowerCase();
      const password = elements.authPassword.value;
      if (!username || !password) {
        showToast("Please fill in all authentication fields.", "error");
        return;
      }
      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          showToast(err.error || "Invalid username or password.", "error");
          return;
        }
        const me = await r.json();
        elements.authPassword.value = '';
        elements.authUsername.value = '';
        await enterApp(me);
        showToast(`Welcome back, ${me.username}!`, "success");
      } catch (err) {
        console.error("Login request failed", err);
        showToast("Could not reach the server. Try again.", "error");
      }
    });

    // Sign out → POST /api/auth/logout
    elements.btnLogout.addEventListener('click', async () => {
      if (!confirm("Are you sure you want to sign out?")) return;
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
      state.currentUser = null;
      state.meetings = [];
      toggleAdminUIElements('operator');
      elements.meetingTitle.value = '';
      elements.transcriptInput.value = '';
      elements.notesInput.value = '';
      if (elements.btnRemoveAudio) { try { elements.btnRemoveAudio.click(); } catch {} }
      if (elements.btnRemoveText) { try { elements.btnRemoveText.click(); } catch {} }
      renderArchiveGrid();
      elements.authOverlay.style.display = 'flex';
      showToast("Signed out.", "info");
    });

    // Create-user modal (admin)
    elements.btnCreateUserModal.addEventListener('click', () => {
      elements.createUsername.value = '';
      elements.createPassword.value = '';
      elements.createRole.value = 'user';
      elements.createUserDialog.showModal();
    });
    const closeCreateUserDialog = () => elements.createUserDialog.close();
    elements.btnCloseCreateUser.addEventListener('click', closeCreateUserDialog);
    elements.btnCancelCreateUser.addEventListener('click', closeCreateUserDialog);

    elements.createUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = elements.createUsername.value.trim().toLowerCase();
      const password = elements.createPassword.value;
      // map the form's 'user' option to the server's 'operator' role
      const role = elements.createRole.value === 'admin' ? 'admin' : 'operator';
      const language = elements.createLanguage ? elements.createLanguage.value : 'en';
      if (username.length < 3 || !/^[a-z0-9_-]+$/.test(username)) {
        showToast("Username: 3+ chars, letters/numbers/_/- only.", "error");
        return;
      }
      if (password.length < 4) {
        showToast("Password must be at least 4 characters.", "error");
        return;
      }
      try {
        const r = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, role, language })
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          showToast(err.error || "Could not create user.", "error");
          return;
        }
        showToast(`Created account: ${username}`, "success");
        closeCreateUserDialog();
        renderUsersTable();
      } catch (err) {
        console.error("Create user failed", err);
        showToast("Could not reach the server.", "error");
      }
    });

    // Boot: ask the server if we already have a valid session
    bootSession();
  }

  // Map the user's language preference to a transcription/output locale
  const LANG_TO_LOCALE = { en: 'en-US', es: 'es-MX', de: 'de-DE' };

  // Apply the user's language as the default for new meetings: preselect the
  // dictation + audio language pickers (which drive the AI output language).
  function applyUserLanguageDefaults(lang) {
    const locale = LANG_TO_LOCALE[lang] || 'en-US';
    state.dictationLang = locale;
    localStorage.setItem('minutae_dictation_lang', locale);
    if (elements.dictationLangSelect) elements.dictationLangSelect.value = locale;
    if (elements.audioLangSelect) elements.audioLangSelect.value = locale;
    if (elements.userLanguageSelect) elements.userLanguageSelect.value = lang;
  }

  // Bring the app into the logged-in state for the given identity.
  async function enterApp(me) {
    state.currentUser = { username: me.username, role: me.role, language: me.language || 'en' };
    toggleAdminUIElements(state.currentUser.role);
    applyUserLanguageDefaults(state.currentUser.language);
    elements.authOverlay.style.display = 'none';

    // Fast paint from cache, then authoritative server list
    state.meetings = JSON.parse(localStorage.getItem('minutae_meetings_' + state.currentUser.username) || '[]');
    const fromServer = await syncMeetingsFromServer();
    if (fromServer) {
      state.meetings = fromServer;
      localStorage.setItem('minutae_meetings_' + state.currentUser.username, JSON.stringify(state.meetings));
    }
    refreshTemplateSelectors();
    renderArchiveGrid();
    switchView('dashboard');
  }

  async function bootSession() {
    try {
      const r = await fetch('/api/auth/me', { cache: 'no-store' });
      if (r.ok) {
        const me = await r.json();
        await enterApp(me);
        return;
      }
    } catch (e) {
      console.warn('Session check failed', e);
    }
    // Not authenticated → show the login overlay
    state.currentUser = null;
    elements.authOverlay.style.display = 'flex';
  }

  // Toggle admin-only element blocks (e.g. User Management sidebar button)
  function toggleAdminUIElements(role) {
    document.querySelectorAll('.admin-only').forEach((btn) => {
      btn.style.display = role === 'admin' ? 'flex' : 'none';
    });
  }

  // ---- User management (admin), backed by the API ----
  async function renderUsersTable() {
    let users = [];
    try {
      const r = await fetch('/api/users', { cache: 'no-store' });
      if (!r.ok) throw new Error('GET /api/users → ' + r.status);
      users = await r.json();
    } catch (e) {
      console.error("Failed to load users", e);
      showToast("Could not load users.", "error");
      return;
    }

    elements.usersTableBody.innerHTML = '';
    users.forEach((user) => {
      const row = document.createElement('tr');
      const isSelf = state.currentUser && user.username === state.currentUser.username;
      const roleClass = user.role === 'admin' ? 'role admin' : 'role';
      const roleLabel = user.role === 'admin' ? 'Administrator' : 'Standard user';
      const safeUsername = esc(user.username);
      const initials = esc(user.username.slice(0, 2));
      row.innerHTML = `
        <td>
          <div class="u-cell">
            <div class="u-avatar">${initials}</div>
            <span class="u-name">${safeUsername}${isSelf ? ' <span style="color:var(--ink-3);font-weight:400">(you)</span>' : ''}</span>
          </div>
        </td>
        <td><span class="${roleClass}">${roleLabel}</span></td>
        <td>
          <select class="select user-lang-select" data-username="${safeUsername}" aria-label="User language" style="padding:5px 26px 5px 10px;font-size:12px">
            <option value="en"${(user.language || 'en') === 'en' ? ' selected' : ''}>English</option>
            <option value="es"${user.language === 'es' ? ' selected' : ''}>Spanish</option>
            <option value="de"${user.language === 'de' ? ' selected' : ''}>German</option>
          </select>
        </td>
        <td class="mono" style="color:var(--ink-3)">${esc(user.createdAt || 'N/A')}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn btn-reset-password" data-username="${safeUsername}" title="Reset password">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.5 12.5L20 3l1 3-2 2 1 3"/></svg>
            </button>
            ${!isSelf ? `
              <button class="icon-btn btn-toggle-role" data-username="${safeUsername}" title="Toggle role">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M21 3l-7 7"/><path d="M8 21H3v-5"/><path d="M3 21l7-7"/></svg>
              </button>
              <button class="icon-btn danger btn-delete-user" data-username="${safeUsername}" title="Remove user">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            ` : ''}
          </div>
        </td>
      `;
      row.querySelector('.btn-reset-password').addEventListener('click', () => resetOperatorPassword(user.username));
      row.querySelector('.user-lang-select').addEventListener('change', (e) => setUserLanguage(user.username, e.target.value));
      if (!isSelf) {
        row.querySelector('.btn-toggle-role').addEventListener('click', () => toggleOperatorRole(user.username, user.role));
        row.querySelector('.btn-delete-user').addEventListener('click', () => deleteOperatorAccount(user.username));
      }
      elements.usersTableBody.appendChild(row);
    });
  }

  async function setUserLanguage(username, lang) {
    try {
      const r = await fetch('/api/users/' + encodeURIComponent(username) + '/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang })
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.status); }
      const label = { en: 'English', es: 'Spanish', de: 'German' }[lang] || lang;
      showToast(`${username}'s language set to ${label}.`, "success");
      // If admin changed their own language here, reflect it immediately
      if (state.currentUser && username === state.currentUser.username) {
        state.currentUser.language = lang;
        applyUserLanguageDefaults(lang);
      }
    } catch (e) {
      showToast("Could not set language: " + e.message, "error");
    }
  }

  async function resetOperatorPassword(username) {
    const newPassword = prompt(`Enter new password for ${username} (min 4 characters):`);
    if (newPassword === null) return;
    if (newPassword.length < 4) {
      showToast("Password must be at least 4 characters long.", "error");
      return;
    }
    try {
      const r = await fetch('/api/users/' + encodeURIComponent(username) + '/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.status); }
      showToast(`Password for ${username} updated.`, "success");
    } catch (e) {
      showToast("Reset failed: " + e.message, "error");
    }
  }

  async function toggleOperatorRole(username, currentRole) {
    const newRole = currentRole === 'admin' ? 'operator' : 'admin';
    try {
      const r = await fetch('/api/users/' + encodeURIComponent(username) + '/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.status); }
      showToast(`${username} is now ${newRole === 'admin' ? 'Admin' : 'Operator'}.`, "success");
      renderUsersTable();
    } catch (e) {
      showToast("Role change failed: " + e.message, "error");
    }
  }

  async function deleteOperatorAccount(username) {
    if (!confirm(`Permanently delete the account for ${username}? Their meetings remain on the server.`)) return;
    try {
      const r = await fetch('/api/users/' + encodeURIComponent(username), { method: 'DELETE' });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.status); }
      showToast(`Deleted account: ${username}`, "info");
      renderUsersTable();
    } catch (e) {
      showToast("Delete failed: " + e.message, "error");
    }
  }

  function initMobileNavigation() {
    if (!elements.mobileMenuBtn || !elements.sidebarOverlay || !elements.sidebar) return;

    elements.mobileMenuBtn.addEventListener('click', () => {
      elements.sidebar.classList.add('open');
      elements.sidebarOverlay.classList.add('active');
    });

    const closeMobileSidebar = () => {
      elements.sidebar.classList.remove('open');
      elements.sidebarOverlay.classList.remove('active');
    };

    elements.sidebarOverlay.addEventListener('click', closeMobileSidebar);

    // Also close the sidebar when clicking navigation buttons on mobile
    elements.navButtons.forEach(btn => {
      btn.addEventListener('click', closeMobileSidebar);
    });
  }

  // ==========================================
  // 11. STARTUP INITIALIZATION
  // ==========================================
  
  function init() {
    initRouting();
    initInputMethodControllers();
    updateSystemBadges();
    refreshTemplateSelectors();
    initSettingsPanel();
    initVoiceDictation();
    initUserAuth();
    initMobileNavigation();
  }

  init();
});

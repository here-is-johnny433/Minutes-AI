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
    audioFile: { name: '', size: '', mimeType: '', base64: '' },
    textFile: { name: '', size: '' },
    audioLang: localStorage.getItem('minutae_audio_lang') || 'en-US',
    
    // Voice dictation states
    isRecording: false,
    recognition: null,
    recordingStartTime: 0,
    recordingTimerInterval: null,
    recordedText: '',
    networkRetryCount: 0,
    lastErrorType: null,
    
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
          if (state.recognition) state.recognition.stop();
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
          if (state.recognition) state.recognition.stop();
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

    // Audio file analyzer and state processor
    function handleAudioFileSelect(file) {
      if (!file.type.startsWith('audio/')) {
        showToast("Invalid file type. Please upload an audio file.", "error");
        return;
      }

      // Max file size: 25MB
      const maxSizeBytes = 25 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        showToast("Audio file exceeds maximum size of 25MB.", "error");
        return;
      }

      // Initialize loader UI
      elements.audioFilename.textContent = file.name;
      elements.audioFilesize.textContent = (file.size / (1024 * 1024)).toFixed(2) + " MB";

      const reader = new FileReader();
      
      reader.onloadstart = () => {
        dropzone.style.opacity = '0.5';
        showToast("Processing audio file...", "info");
      };

      reader.onload = (event) => {
        const dataUrl = event.target.result;
        const base64Data = dataUrl.split(',')[1];
        
        state.audioFile = {
          name: file.name,
          size: file.size,
          mimeType: file.type,
          base64: base64Data
        };

        // Bind to player
        elements.audioPlayer.src = URL.createObjectURL(file);
        
        // Toggle view from dropzone to active audio details
        dropzone.style.display = 'none';
        elements.audioFileDetails.style.display = 'block';
        dropzone.style.opacity = '1';
        showToast("Audio file processed successfully!", "success");
      };

      reader.onerror = (err) => {
        console.error("FileReader error", err);
        dropzone.style.opacity = '1';
        showToast("Failed to read audio file.", "error");
      };

      reader.readAsDataURL(file);
    }

    // Wipe audio upload state
    elements.btnRemoveAudio.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Wipe state
      state.audioFile = { name: '', size: '', mimeType: '', base64: '' };
      
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
      elements.apiKeyToggleBtn.querySelector('svg').style.color = type === 'text' ? 'var(--accent-cyan)' : 'var(--text-muted)';
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
  // 6. LIVE VOICE TRANSCRIPTION (WEB SPEECH)
  // ==========================================
  
  function startSpeechRecognition() {
    // Gracefully clean up any existing instance to avoid duplicate listeners or events
    if (state.recognition) {
      try {
        state.recognition.onstart = null;
        state.recognition.onerror = null;
        state.recognition.onend = null;
        state.recognition.onresult = null;
        state.recognition.stop();
      } catch (err) {
        console.warn("Cleanup of existing speech recognition instance failed:", err);
      }
      state.recognition = null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Speech recognition is not supported in this browser", "error");
      return;
    }

    // Always create a fresh instance to satisfy Chrome's single-use constraint
    state.recognition = new SpeechRecognition();
    state.recognition.continuous = true;
    state.recognition.interimResults = true;
    state.recognition.lang = state.dictationLang;

    state.recognition.onstart = () => {
      state.isRecording = true;
      elements.dictationBar.classList.add('active');
      elements.micToggleBtn.classList.add('active');
      elements.recordingStatus.textContent = "Listening...";
      
      // Load current value and cleanly strip any lingering interim tags
      state.recordedText = elements.transcriptInput.value.replace(/\s\.\.\.\[.*\]$/, '');
      
      // Reset network retry logic upon successful connection/start
      state.networkRetryCount = 0;
      state.lastErrorType = null;
      
      // Start clock if not already running
      if (!state.recordingTimerInterval) {
        state.recordingStartTime = Date.now();
        elements.recordingTime.textContent = "00:00";
        state.recordingTimerInterval = setInterval(updateRecordingClock, 1000);
        showToast("Voice recording started", "info");
      } else {
        showToast("Microphone reconnected successfully", "success");
      }
    };

    state.recognition.onerror = (e) => {
      console.error("[SpeechRecognition] error:", e.error, e);
      state.lastErrorType = e.error;

      if (e.error === 'network') {
        state.networkRetryCount++;
        if (state.networkRetryCount <= 5) {
          showToast(`Network disruption detected. Reconnecting microphone (Attempt ${state.networkRetryCount}/5)...`, "warning");
          elements.recordingStatus.textContent = "Reconnecting...";
        } else {
          showToast("Speech recognition needs internet access to Google's servers. Connection failed.", "error");
          stopRecording();
        }
      } else if (e.error === 'aborted') {
        console.warn("Speech Recognition aborted internally. Attempting auto-restart...");
      } else if (e.error === 'no-speech') {
        // Surface silently-swallowed silence so the user understands why nothing appears
        elements.recordingStatus.textContent = "Listening… (no audio detected)";
      } else if (e.error === 'audio-capture') {
        showToast("No microphone available — check your input device and OS permissions.", "error");
        stopRecording();
      } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        showToast("Microphone permission blocked for this site. Allow it in the browser address bar.", "error");
        stopRecording();
      } else {
        showToast("Microphone error: " + e.error, "error");
        stopRecording();
      }
    };

    state.recognition.onend = () => {
      // Auto restart if the state is still recording (SpeechRecognition cuts off on long pauses or network disruptions)
      if (state.isRecording) {
        if (state.lastErrorType === 'network') {
          // Add a 2-second delay to avoid rapid failing reconnect loop
          elements.recordingStatus.textContent = "Reconnecting in 2s...";
          setTimeout(() => {
            if (state.isRecording) {
              startSpeechRecognition();
            }
          }, 2000);
        } else {
          // Standard immediate restart with a micro-delay to prevent InvalidStateError
          elements.recordingStatus.textContent = "Reconnecting...";
          setTimeout(() => {
            if (state.isRecording) {
              startSpeechRecognition();
            }
          }, 50);
        }
      } else {
        stopRecording();
      }
    };

    state.recognition.onresult = (e) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript;
        } else {
          interimTranscript += e.results[i][0].transcript;
        }
      }

      console.log("[SpeechRecognition] result — final:", JSON.stringify(finalTranscript), "interim:", JSON.stringify(interimTranscript));

      if (finalTranscript) {
        state.recordedText += (state.recordedText ? ' ' : '') + finalTranscript;
      }

      // Restore "Listening…" if a previous no-speech event downgraded the status
      if (elements.recordingStatus.textContent !== "Listening...") {
        elements.recordingStatus.textContent = "Listening...";
      }

      // Stream directly to UI text-area
      elements.transcriptInput.value = state.recordedText + (interimTranscript ? ' ...[' + interimTranscript + ']' : '');
      elements.transcriptInput.scrollTop = elements.transcriptInput.scrollHeight;
    };

    try {
      state.recognition.start();
    } catch (err) {
      console.error("Speech start error", err);
      showToast("Failed to access microphone", "error");
      stopRecording();
    }
  }

  function initVoiceDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      elements.recordingStatus.textContent = "Voice Dictation Unsupported";
      elements.micToggleBtn.disabled = true;
      elements.micToggleBtn.style.cursor = 'not-allowed';
      elements.micToggleBtn.title = "Your browser does not support the Web Speech API.";
      return;
    }

    // Set initial dropdown value
    elements.dictationLangSelect.value = state.dictationLang;

    // Listen for language dropdown changes
    elements.dictationLangSelect.addEventListener('change', (e) => {
      const selectedLang = e.target.value;
      state.dictationLang = selectedLang;
      localStorage.setItem('minutae_dictation_lang', selectedLang);
      
      const langName = elements.dictationLangSelect.options[elements.dictationLangSelect.selectedIndex].text;
      showToast(`Language set to: ${langName}`, "info");

      // If actively recording, restart it to apply the new language immediately!
      if (state.isRecording) {
        showToast("Restarting microphone to apply new language...", "info");
        if (state.recognition) {
          state.recognition.stop();
        }
      }
    });

    elements.micToggleBtn.addEventListener('click', () => {
      if (state.isRecording) {
        state.isRecording = false; // Flag to prevent auto-restart
        if (state.recognition) {
          state.recognition.stop();
        }
        stopRecording();
      } else {
        startSpeechRecognition();
      }
    });
  }

  function resetWorkspaceForNextMeeting() {
    if (state.isRecording) {
      state.isRecording = false;
      if (state.recognition) { try { state.recognition.stop(); } catch {} }
      stopRecording();
    }
    state.recordedText = '';
    elements.meetingTitle.value = '';
    elements.transcriptInput.value = '';
    elements.notesInput.value = '';
    if (state.audioFile && state.audioFile.base64 && elements.btnRemoveAudio) elements.btnRemoveAudio.click();
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
    
    // Strip interim tags if any left
    elements.transcriptInput.value = elements.transcriptInput.value.replace(/\s\.\.\.\[.*\]$/, '');
    
    // Reset network retry count & last error
    state.networkRetryCount = 0;
    state.lastErrorType = null;
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
      if (!state.audioFile.base64) {
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
        summaryResult = await runCloudGeminiGeneration(
          fullPrompt, 
          cancelController.signal, 
          state.inputMethod === 'audio-file' ? state.audioFile : null
        );
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
  async function runCloudGeminiGeneration(prompt, signal, audioFile = null) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`;
    
    const parts = [];
    if (audioFile && audioFile.base64) {
      parts.push({
        inlineData: {
          mimeType: audioFile.mimeType,
          data: audioFile.base64
        }
      });
    }
    parts.push({
      text: prompt
    });

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

  elements.dialogCloseBtn.addEventListener('click', () => {
    elements.resultsDialog.close();
  });

  // Close when clicking backdrop (light dismiss hack for large-dialog)
  elements.resultsDialog.addEventListener('click', (e) => {
    const dialogDimensions = elements.resultsDialog.getBoundingClientRect();
    if (
      e.clientX < dialogDimensions.left ||
      e.clientX > dialogDimensions.right ||
      e.clientY < dialogDimensions.top ||
      e.clientY > dialogDimensions.bottom
    ) {
      elements.resultsDialog.close();
    }
  });

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
      const card = document.createElement('div');
      card.className = 'archive-card glass-panel';
      
      // Calculate a short plain text snippet of summary for teaser
      const teaserText = m.summary
        .replace(/[#*`\-|[\]()]/g, '') // remove markdown symbols
        .replace(/\n+/g, ' ')
        .substring(0, 140) + '...';

      const tmplName = (state.templates[m.template] ? state.templates[m.template].name : 'Custom').split(' ')[0];
      card.innerHTML = `
        <div class="card-top">
          <h3>${esc(m.title)}</h3>
          <span class="badge ${m.template === 'action' ? 'badge-cyan' : 'badge-purple'}">${esc(tmplName)}</span>
        </div>
        <div class="card-date">${esc(m.date)}</div>
        <div class="card-teaser">${esc(teaserText)}</div>
        <div class="card-footer">
          <span class="accent-link">Open Highlights →</span>
          <button class="icon-btn-text delete-meet-btn" data-id="${esc(m.id)}" aria-label="Delete meeting">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" class="mini-icon">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
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
  // 10.3. PASSWORD HASHING (SHA-256 + per-user random salt)
  // ==========================================
  // Stored format: "sha256$<saltHex>$<hashHex>"
  // Legacy plaintext entries (no `sha256$` prefix) are accepted on login
  // for backward compatibility, then transparently upgraded to a hash.

  function pwBytesToHex(bytes) {
    return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function pwGenerateSalt() {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    return pwBytesToHex(buf);
  }

  async function pwComputeHash(password, saltHex) {
    const data = new TextEncoder().encode(saltHex + ':' + password);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return pwBytesToHex(digest);
  }

  async function pwHash(password) {
    const salt = pwGenerateSalt();
    const hash = await pwComputeHash(password, salt);
    return `sha256$${salt}$${hash}`;
  }

  async function pwVerify(password, stored) {
    if (typeof stored !== 'string') return { ok: false, legacy: false };
    if (stored.startsWith('sha256$')) {
      const [, salt, expected] = stored.split('$');
      if (!salt || !expected) return { ok: false, legacy: false };
      const actual = await pwComputeHash(password, salt);
      return { ok: actual === expected, legacy: false };
    }
    // Legacy: stored value is the plaintext password
    return { ok: stored === password, legacy: true };
  }

  // ==========================================
  // 10.4. SERVER-SIDE MEETING STORAGE (shared pool via /api)
  // ==========================================
  // Meetings live as .md files in the api container's docker volume. All
  // in-app users share the same pool — the access boundary is Caddy's
  // basic_auth at the edge. localStorage acts as a fast-boot cache and
  // offline fallback so the UI is never blank during a server hiccup.

  // Every /api request carries the in-app username so the backend can scope
  // files to <DATA_DIR>/<username>/. This is best-effort organization, not
  // real auth — see api/server.js for the trust model.
  function apiUserHeader() {
    const u = state.currentUser && state.currentUser.username;
    return u ? { 'X-Minutes-User': u } : {};
  }

  async function apiReadAllMeetings() {
    const r = await fetch('/api/meetings', {
      cache: 'no-store',
      headers: apiUserHeader()
    });
    if (!r.ok) throw new Error('GET /api/meetings → ' + r.status);
    return r.json();
  }

  async function apiWriteMeeting(meeting) {
    const r = await fetch('/api/meetings/' + encodeURIComponent(meeting.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...apiUserHeader() },
      body: JSON.stringify(meeting)
    });
    if (!r.ok) throw new Error('PUT /api/meetings → ' + r.status);
    return r.json();
  }

  async function apiDeleteMeeting(meetingOrId) {
    const id = typeof meetingOrId === 'string' ? meetingOrId : meetingOrId.id;
    const r = await fetch('/api/meetings/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: apiUserHeader()
    });
    if (!r.ok) throw new Error('DELETE /api/meetings/:id → ' + r.status);
  }

  async function apiClearAllMeetings() {
    const r = await fetch('/api/meetings', {
      method: 'DELETE',
      headers: apiUserHeader()
    });
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
  // 10.5. MULTI-USER AUTHENTICATION & OPERATOR CRUD ENGINE
  // ==========================================

  function initUserAuth() {
    // 1. Seed default Admin account if first boot (fire-and-forget; the
    // login form won't be submitted before this resolves under any plausible
    // human timing, and a failure is logged via the awaited promise)
    seedDefaultAdmin().catch((e) => console.error("seedDefaultAdmin failed", e));

    // 2. Event Listener: Login Submission
    elements.authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = elements.authUsername.value.trim().toLowerCase();
      const password = elements.authPassword.value;

      if (!username || !password) {
        showToast("Please fill in all authentication fields.", "error");
        return;
      }

      let users = [];
      try {
        users = JSON.parse(localStorage.getItem('minutae_users') || '[]');
      } catch (err) {
        console.error("Failed to load users for authentication check", err);
      }

      let match = null;
      let matchedLegacy = false;
      for (const u of users) {
        if (u.username !== username) continue;
        const result = await pwVerify(password, u.passwordHash);
        if (result.ok) {
          match = u;
          matchedLegacy = result.legacy;
        }
        break;
      }

      // Auto-upgrade legacy plaintext entries to a salted hash on successful login
      if (match && matchedLegacy) {
        try {
          match.passwordHash = await pwHash(password);
          localStorage.setItem('minutae_users', JSON.stringify(users));
        } catch (e) {
          console.warn("Failed to upgrade legacy password hash", e);
        }
      }

      if (match) {
        // Session creation
        state.currentUser = {
          username: match.username,
          role: match.role,
          createdAt: match.createdAt
        };
        sessionStorage.setItem('minutae_current_user', JSON.stringify(state.currentUser));

        // Load meetings: localStorage cache for instant render, then sync from server
        state.meetings = JSON.parse(localStorage.getItem('minutae_meetings_' + state.currentUser.username) || '[]');
        const fromServer = await syncMeetingsFromServer();
        if (fromServer) {
          state.meetings = fromServer;
          localStorage.setItem('minutae_meetings_' + state.currentUser.username, JSON.stringify(state.meetings));
        }

        // Trigger dynamic migration for legacy meetings if logging in as Admin
        if (state.currentUser.username === 'admin') {
          migrateLegacyMeetings();
        }

        // Toggle admin elements in UI
        toggleAdminUIElements(state.currentUser.role);

        // Hide overlay and load dashboard workspace
        elements.authOverlay.style.display = 'none';

        // Reset form inputs
        elements.authUsername.value = '';
        elements.authPassword.value = '';

        // Load correct UI states and notifications
        refreshTemplateSelectors();
        renderArchiveGrid();
        switchView('dashboard');
        showToast(`Authenticated successfully. Welcome back, ${state.currentUser.username}!`, "success");
      } else {
        showToast("Invalid username or password. Please try again.", "error");
      }
    });

    // 3. Event Listener: Sign Out Session
    elements.btnLogout.addEventListener('click', () => {
      if (confirm("Are you sure you want to sign out?")) {
        // Clear active session
        sessionStorage.removeItem('minutae_current_user');
        state.currentUser = null;
        state.meetings = [];

        // Reset sidebar active states and panels
        toggleAdminUIElements('user');
        
        // Show auth overlay
        elements.authOverlay.style.display = 'flex';
        
        // Clean layout text inputs
        elements.meetingTitle.value = '';
        elements.transcriptInput.value = '';
        elements.notesInput.value = '';

        // Clear files details
        if (elements.btnRemoveAudio) elements.btnRemoveAudio.click();
        if (elements.btnRemoveText) elements.btnRemoveText.click();

        renderArchiveGrid();
        showToast("Logged out successfully.", "info");
      }
    });

    // 4. Modal Triggers & Form Bindings for Account Registration (Admin Only)
    elements.btnCreateUserModal.addEventListener('click', () => {
      elements.createUsername.value = '';
      elements.createPassword.value = '';
      elements.createRole.value = 'user';
      elements.createUserDialog.showModal();
    });

    const closeCreateUserDialog = () => {
      elements.createUserDialog.close();
    };

    elements.btnCloseCreateUser.addEventListener('click', closeCreateUserDialog);
    elements.btnCancelCreateUser.addEventListener('click', closeCreateUserDialog);

    elements.createUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = elements.createUsername.value.trim().toLowerCase();
      const password = elements.createPassword.value;
      const role = elements.createRole.value;

      if (username.length < 3) {
        showToast("Username must be at least 3 characters.", "error");
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showToast("Username must contain only letters, numbers, and underscores.", "error");
        return;
      }
      if (password.length < 4) {
        showToast("Password must be at least 4 characters.", "error");
        return;
      }

      let users = [];
      try {
        users = JSON.parse(localStorage.getItem('minutae_users') || '[]');
      } catch (err) {
        console.error("Failed to parse users database", err);
      }

      if (users.some(u => u.username === username)) {
        showToast(`Username "${username}" is already taken.`, "error");
        return;
      }

      const newUser = {
        username: username,
        passwordHash: await pwHash(password),
        role: role,
        createdAt: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
      };

      users.push(newUser);
      localStorage.setItem('minutae_users', JSON.stringify(users));

      showToast(`Successfully registered operator account: ${username}`, "success");
      closeCreateUserDialog();
      renderUsersTable();
    });

    // 5. Active Session Recovery Check
    const activeSession = sessionStorage.getItem('minutae_current_user');
    if (activeSession) {
      try {
        state.currentUser = JSON.parse(activeSession);
        
        // Restore meeting state
        state.meetings = JSON.parse(localStorage.getItem('minutae_meetings_' + state.currentUser.username) || '[]');
        
        // Load UI Layout overrides
        toggleAdminUIElements(state.currentUser.role);
        elements.authOverlay.style.display = 'none';

        // Render grids and templates
        refreshTemplateSelectors();
        renderArchiveGrid();
        switchView('dashboard');
      } catch (err) {
        console.error("Session restoration failed", err);
        sessionStorage.removeItem('minutae_current_user');
        elements.authOverlay.style.display = 'flex';
      }
    } else {
      // Direct access guard - force auth cards
      elements.authOverlay.style.display = 'flex';
    }
  }

  // Seeding default administrator profile
  async function seedDefaultAdmin() {
    let users = [];
    try {
      users = JSON.parse(localStorage.getItem('minutae_users') || '[]');
    } catch (e) {
      console.error("Failed to read user store during boot", e);
    }

    if (!Array.isArray(users) || users.length === 0) {
      users = [
        {
          username: 'admin',
          passwordHash: await pwHash('admin123'),
          role: 'admin',
          createdAt: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
        }
      ];
      localStorage.setItem('minutae_users', JSON.stringify(users));
    }
  }

  // Port generic unauthenticated templates/summaries to seed administrator
  function migrateLegacyMeetings() {
    const legacy = localStorage.getItem('minutae_meetings');
    if (legacy) {
      try {
        const legacyMeetings = JSON.parse(legacy);
        if (Array.isArray(legacyMeetings) && legacyMeetings.length > 0) {
          const adminKey = 'minutae_meetings_admin';
          const adminMeetings = JSON.parse(localStorage.getItem(adminKey) || '[]');
          
          // Combine existing records, filter duplicates
          const merged = [...legacyMeetings, ...adminMeetings];
          const unique = [];
          const seenIds = new Set();
          
          for (const meet of merged) {
            if (!seenIds.has(meet.id)) {
              seenIds.add(meet.id);
              unique.push(meet);
            }
          }
          
          localStorage.setItem(adminKey, JSON.stringify(unique));
          // Synchronize state.meetings
          state.meetings = unique;
        }
      } catch (e) {
        console.error("Pre-existing data migration error", e);
      }
      localStorage.removeItem('minutae_meetings');
    }
  }

  // Toggle admin-only element blocks (e.g. User Management sidebar button)
  function toggleAdminUIElements(role) {
    const adminBtns = document.querySelectorAll('.admin-only');
    adminBtns.forEach(btn => {
      if (role === 'admin') {
        btn.style.display = 'flex';
      } else {
        btn.style.display = 'none';
      }
    });
  }

  // Directory renderer for registered administrators & operator credentials
  function renderUsersTable() {
    let users = [];
    try {
      users = JSON.parse(localStorage.getItem('minutae_users') || '[]');
    } catch (e) {
      console.error("Failed to fetch users directory index", e);
    }

    elements.usersTableBody.innerHTML = '';

    users.forEach(user => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid rgba(255, 255, 255, 0.03)';

      const isSelf = user.username === state.currentUser.username;
      const badgeClass = user.role === 'admin' ? 'badge-purple' : 'badge-cyan';
      const roleLabel = user.role === 'admin' ? 'Admin' : 'Operator';

      const safeUsername = esc(user.username);
      row.innerHTML = `
        <td style="padding: 1rem 0.5rem; font-weight: 500;">
          ${safeUsername} ${isSelf ? '<span style="color: var(--text-muted); font-size: 0.8rem; font-weight: normal; margin-left: 4px;">(You)</span>' : ''}
        </td>
        <td style="padding: 1rem 0.5rem;">
          <span class="badge ${badgeClass}">${roleLabel}</span>
        </td>
        <td style="padding: 1rem 0.5rem; color: var(--text-muted); font-size: 0.9rem;">
          ${esc(user.createdAt || 'N/A')}
        </td>
        <td style="padding: 1rem 0.5rem; text-align: right;">
          <div class="action-group">
            <button class="action-btn-secondary-mini btn-reset-password" data-username="${safeUsername}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mini-icon" style="width: 12px; height: 12px;">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Reset Pass
            </button>
            ${!isSelf ? `
              <button class="action-btn-secondary-mini btn-toggle-role" data-username="${safeUsername}">
                Role
              </button>
              <button class="action-btn-danger-mini btn-delete-user" data-username="${safeUsername}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mini-icon" style="width: 12px; height: 12px;">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Delete
              </button>
            ` : ''}
          </div>
        </td>
      `;

      // Bind dynamic controller action triggers
      row.querySelector('.btn-reset-password').addEventListener('click', () => {
        resetOperatorPassword(user.username);
      });

      if (!isSelf) {
        row.querySelector('.btn-toggle-role').addEventListener('click', () => {
          toggleOperatorRole(user.username);
        });
        row.querySelector('.btn-delete-user').addEventListener('click', () => {
          deleteOperatorAccount(user.username);
        });
      }

      elements.usersTableBody.appendChild(row);
    });
  }

  // Operator CRUD triggers
  async function resetOperatorPassword(username) {
    const newPassword = prompt(`Enter new password for ${username} (min 4 characters):`);
    if (newPassword === null) return;

    if (newPassword.length < 4) {
      showToast("Password must be at least 4 characters long.", "error");
      return;
    }

    let users = [];
    try {
      users = JSON.parse(localStorage.getItem('minutae_users') || '[]');
    } catch (e) {
      console.error(e);
    }

    const index = users.findIndex(u => u.username === username);
    if (index !== -1) {
      users[index].passwordHash = await pwHash(newPassword);
      localStorage.setItem('minutae_users', JSON.stringify(users));
      showToast(`Passcode for ${username} has been updated successfully.`, "success");
    }
  }

  function toggleOperatorRole(username) {
    let users = [];
    try {
      users = JSON.parse(localStorage.getItem('minutae_users') || '[]');
    } catch (e) {
      console.error(e);
    }

    const index = users.findIndex(u => u.username === username);
    if (index !== -1) {
      const newRole = users[index].role === 'admin' ? 'user' : 'admin';
      users[index].role = newRole;
      localStorage.setItem('minutae_users', JSON.stringify(users));
      showToast(`Role mapping for ${username} set to ${newRole === 'admin' ? 'Admin' : 'Operator'}.`, "success");
      renderUsersTable();
    }
  }

  function deleteOperatorAccount(username) {
    if (confirm(`Are you absolutely sure you want to permanently delete the profile for ${username}?`)) {
      let users = [];
      try {
        users = JSON.parse(localStorage.getItem('minutae_users') || '[]');
      } catch (e) {
        console.error(e);
      }

      users = users.filter(u => u.username !== username);
      localStorage.setItem('minutae_users', JSON.stringify(users));
      
      // Clean up workspace workspace index
      localStorage.removeItem('minutae_meetings_' + username);
      
      showToast(`Operator ${username} wiped from system database.`, "info");
      renderUsersTable();
    }
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
  }

  init();
});

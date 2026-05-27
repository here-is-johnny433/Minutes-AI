# Minutes.AI - Premium Meeting Synthesizer

An ultra-premium, privacy-first Single Page Application (SPA) designed to synthesize comprehensive meeting minutes, interactive action items, executive briefs, technical engineering summaries, or lateral brainstorm outlines. It achieves this by combining raw transcripts (imported, pasted, or recorded live) with your own handwritten personal notes using artificial intelligence.

---

## 🌟 Key Features

1. **Dual AI Engines**:
   - **Cloud Gemini API**: Fast, highly intelligent synthesis powered by `gemini-2.5-flash` client-side REST commands. No backend server needed; requires a free API key from Google AI Studio.
   - **Native On-Device AI**: Leverages the standardized Chrome `LanguageModel` API running **Gemini Nano** locally on your device. Zero cloud server requests, completely free, and completely private.
2. **5 Specialized Synthesis Templates**:
   - *Standard Chronological Minutes*: Full chronological topics, attendee logs, finalized decisions, and next steps.
   - *Action-Item Focused*: Generates a structured task breakdown table showing tasks, owners, deadlines, priority, and descriptions.
   - *Executive Brief (TL;DR)*: Dense, concise summary cards for leadership review.
   - *Technical Engineering Summary*: Covers architecture modifications, bug resolutions, code impact, and QA parameters.
   - *Creative Concept Map*: Brainstorm mapping showing primary conceptual branches and wild explorations.
3. **Live Voice Dictation**: Direct integration with the **HTML5 Web Speech API** (`SpeechRecognition`), streaming text in real time with audio level wave visualizations and duration timers.
4. **Local Archiving & Offline Storage**: Fast browser-side CRUD indexing of past meetings utilizing `localStorage`.
5. **Interactive Controls & Exporters**: Custom glassmorphic overlay for processing logs, clipboard copy shortcuts, and downloading cleanly styled Markdown files.
6. **Spectacular Modern Design**: A premium dark theme using obsidian obsidian shades, rotating glowing background mesh grids, high-performance glassmorphism layers, floating label form controls, and CSS micro-animations.

---

## 🚀 Setup & How to Run

Because this is a serverless Single Page Application, running it is incredibly easy:

### 1. Run via Docker (Recommended for Docker Desktop)
Containerizing the application ensures isolated dependency running, highly efficient asset serving, and smooth browser-side microphone connections.

To build and run the Docker container:
```bash
# 1. Navigate to the project directory
cd /Users/stephantinschert/.gemini/antigravity/scratch/ai-meeting-minutes

# 2. Build the Docker image
docker build -t minutes-ai .

# 3. Run the container on port 8080 (or any open port)
docker run -d -p 8080:80 --name minutes-ai-app minutes-ai
```
Open your browser and navigate to **`http://localhost:8080`**.

### 2. Run via Local Static Server
To run the project with a lightweight static server instead:
```bash
# Using Node.js npx (instant)
npx -y serve ./

# Or using Python 3
python -y -m http.server 8000
```
Navigate to the address shown (usually `http://localhost:3000` or `http://localhost:8000`).


---

## ⚙️ Configuring AI Engines

Navigate to the **Settings** view from the sidebar to set up your AI synthesis parameters:

### A. Configuring Cloud Gemini
1. Go to [Google AI Studio](https://aistudio.google.com/) and grab a free API Key.
2. Select **Cloud Gemini API** as your engine in Minutes.AI settings.
3. Paste the key into the input field. The key is stored 100% locally in your own browser's `localStorage` and only communicates directly with official Google endpoints.

### B. Configuring On-Device Gemini Nano (Experimental)
To run local summaries on Gemini Nano, ensure you satisfy these conditions:
1. **Browser**: Chrome 148+ (Dev/Canary channels offer the most stable standard APIs).
2. **RAM**: 16GB+ RAM and modern CPU/GPU capabilities.
3. **Enable Experimental flags**:
   - Open `chrome://flags` in a new tab.
   - Enable **Optimization Guide On-Device Model** (`#optimization-guide-on-device-model`). Set it to `Enabled BypassPrefChecks`.
   - Enable **Prompt API for Gemini Nano** (`#prompt-api-for-gemini-nano`) or equivalent.
   - Relaunch Chrome.
4. Go to **Settings** in Minutes.AI, select **On-Device Gemini Nano**, and click **Initialize Model Download**. Wait for the 2GB model download to complete. Once finished, you are ready to synthesize meeting minutes locally, for free, and completely offline!

---

## 🔒 Security & Privacy Policy

- **No Server Tracking**: Minutes.AI operates entirely within your browser client. There are no tracking scripts, analytics, databases, or cloud servers managing your meeting details.
- **Local Keys**: Your API keys and meeting transcripts are stored inside the browser's sandboxed `localStorage` cache. 
- **On-Device Processing**: If On-Device Engine is selected, the transcript processing, merging of notes, and formatting calculations are executed entirely inside your device's RAM via Gemini Nano.

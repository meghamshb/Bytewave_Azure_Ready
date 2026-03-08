document.addEventListener('DOMContentLoaded', () => {
    const chatMessages  = document.getElementById('chat-messages');
    const welcomeScreen = document.getElementById('welcome-screen');
    const chatInput     = document.getElementById('chat-input');
    const sendBtn       = document.getElementById('send-btn');
    const qualitySelect = document.getElementById('quality-select');
    const historyPanel  = document.getElementById('history-panel');
    const historyList   = document.getElementById('history-list');
    const toggleHistory = document.getElementById('toggle-history');
    const closeHistory  = document.getElementById('close-history');

    const API_BASE = (window.location.origin || 'http://localhost:8000') + '/api';
    const FETCH_TIMEOUTS = { plan: 120_000, code: 120_000, combined: 180_000, followup: 300_000, quick: 15_000 };
    const POLL_INTERVAL_MS = 2000;

    let conversationHistory = [];
    let currentPlan   = '';
    let currentCode   = '';
    let originalQuestion = '';
    let abortController  = null;
    let cancelEnabled    = false;
    let isGenerating     = false;

    // Refinement keywords — if the user's message contains these, treat as a follow-up
    // to the current animation rather than a brand new question.
    const FOLLOWUP_KEYWORDS = [
        'make it', 'change', 'modify', 'adjust', 'update', 'slower', 'faster',
        'longer', 'shorter', 'bigger', 'smaller', 'increase', 'decrease',
        'add friction', 'remove friction', 'with friction', 'no friction',
        'set ', 'use ', 'now ', 'instead', 'what if', 'what happens',
        'again', 'redo', 'same but', 'this time', 'elastic', 'inelastic',
        'higher', 'lower', 'heavier', 'lighter', 'more', 'less',
    ];

    function isRefinement(text) {
        const t = text.toLowerCase();
        return FOLLOWUP_KEYWORDS.some(k => t.includes(k));
    }

    function resetAnimationState() {
        originalQuestion = '';
        currentPlan = '';
        currentCode = '';
        conversationHistory = [];
    }

    // Animation history entries: [{id, question, videoUrl, timestamp}]
    let animationHistory = JSON.parse(localStorage.getItem('physiMateHistory') || '[]');
    renderHistoryPanel();

    // Load persisted animations from backend DB (survives browser refresh)
    async function loadAnimationsFromDB() {
        try {
            const resp = await fetch(`${API_BASE}/animations`);
            if (!resp.ok) return;
            const data = await resp.json();
            if (!Array.isArray(data) || !data.length) return;
            // Merge DB entries with any localStorage-only entries, deduplicate by video URL
            const dbEntries = data.map(a => ({
                id: a.id,
                question: a.question,
                videoUrl: a.video_url,
                timestamp: Math.round(a.created_at * 1000),
                fromDB: true,
            }));
            const localUrls = new Set(animationHistory.map(e => e.videoUrl));
            for (const e of dbEntries) {
                if (!localUrls.has(e.videoUrl)) animationHistory.push(e);
            }
            animationHistory.sort((a, b) => b.timestamp - a.timestamp);
            animationHistory = animationHistory.slice(0, 200);
            localStorage.setItem('physiMateHistory', JSON.stringify(animationHistory));
            renderHistoryPanel();
        } catch (_) { /* non-fatal */ }
    }
    loadAnimationsFromDB();

    // ── Sidebar ──────────────────────────────────────────────────────────────

    toggleHistory.addEventListener('click', () => {
        historyPanel.classList.toggle('open');
    });
    closeHistory.addEventListener('click', () => {
        historyPanel.classList.remove('open');
    });

    // ── New Animation button ─────────────────────────────────────────────────
    document.getElementById('new-animation-btn').addEventListener('click', () => {
        if (isGenerating) return;
        resetAnimationState();
        chatMessages.innerHTML = `
            <div class="welcome-screen" id="welcome-screen">
                <div class="welcome-icon"></div>
                <h2>What do you want to learn?</h2>
                <p>Ask any physics question — get a live interactive simulation <em>and</em> a beautiful video explanation.</p>
                <div class="suggestion-chips">
                    <button class="chip" data-q="How does a pendulum work? Show me the forces involved.">Pendulum forces</button>
                    <button class="chip" data-q="Show me projectile motion with velocity components.">Projectile motion</button>
                    <button class="chip" data-q="Show me an elastic collision between two balls m1=2 m2=1.">Elastic collision</button>
                    <button class="chip" data-q="Explain Newton's second law with a block on a surface.">Newton's 2nd law</button>
                    <button class="chip" data-q="Show spring-mass oscillation with k=8 m=2.">Spring oscillation</button>
                    <button class="chip" data-q="Show a block sliding down a frictionless inclined plane.">Inclined plane</button>
                </div>
            </div>`;
        chatMessages.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                chatInput.value = chip.dataset.q;
                chatInput.dispatchEvent(new Event('input'));
                handleSend();
            });
        });
        chatInput.focus();
    });

    function addToHistory(question, videoUrl) {
        animationHistory.unshift({ question, videoUrl, timestamp: Date.now() });
        if (animationHistory.length > 200) animationHistory.pop();
        localStorage.setItem('physiMateHistory', JSON.stringify(animationHistory));
        renderHistoryPanel();
        // Refresh from DB in the background to pick up the server-saved record
        setTimeout(loadAnimationsFromDB, 1500);
    }

    function renderHistoryPanel() {
        historyList.innerHTML = '';
        if (!animationHistory.length) {
            historyList.innerHTML = '<li class="history-empty">No animations yet</li>';
            return;
        }
        animationHistory.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.title = entry.question;
            li.innerHTML = `
                <div class="history-item-main">
                    <div class="history-q">${escapeHtml(entry.question.slice(0, 60))}${entry.question.length > 60 ? '…' : ''}</div>
                    <div class="history-ts">${new Date(entry.timestamp).toLocaleString()}</div>
                </div>
                <button class="history-del" title="Remove from history" data-url="${escapeHtml(entry.videoUrl || '')}" data-id="${escapeHtml(entry.id || '')}">✕</button>`;
            li.querySelector('.history-item-main').addEventListener('click', () => {
                historyPanel.classList.remove('open');
                playHistoryEntry(entry);
            });
            li.querySelector('.history-del').addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                const url = e.currentTarget.dataset.url;
                animationHistory = animationHistory.filter(a => a.videoUrl !== url);
                localStorage.setItem('physiMateHistory', JSON.stringify(animationHistory));
                renderHistoryPanel();
                if (id) {
                    try { await fetch(`${API_BASE}/animations/${id}`, { method: 'DELETE' }); } catch (_) {}
                }
            });
            historyList.appendChild(li);
        });
    }

    function playHistoryEntry(entry) {
        if (welcomeScreen) welcomeScreen.remove();
        appendMessage('user', entry.question);
        appendAssistantWithVideo('Here\'s your previous animation:', buildVideoUrl(entry.videoUrl));
    }

    // ── Auto-resize textarea ─────────────────────────────────────────────────

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    sendBtn.addEventListener('click', () => {
        if (isGenerating && cancelEnabled) {
            cancelRequest();
            return;
        }
        if (!isGenerating) handleSend();
    });

    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chatInput.value = chip.dataset.q;
            chatInput.dispatchEvent(new Event('input'));
            handleSend();
        });
    });

    function handleSend() {
        const text = chatInput.value.trim();
        if (!text) return;

        chatInput.value = '';
        chatInput.style.height = 'auto';

        if (welcomeScreen && welcomeScreen.parentNode) welcomeScreen.remove();

        // Only treat as a follow-up if the user is clearly refining the CURRENT animation.
        // Any new physics topic always gets a fresh render.
        if (originalQuestion && currentCode && isRefinement(text)) {
            handleFollowup(text);
        } else {
            resetAnimationState();
            handleNewQuestion(text);
        }
    }

    // ── New Question Flow ─────────────────────────────────────────────────────

    async function handleNewQuestion(question) {
        originalQuestion = question;
        conversationHistory = [];
        currentPlan = '';
        currentCode = '';
        const quality = qualitySelect.value;

        appendMessage('user', question);
        const loadingEl = appendLoading('Analyzing question...');
        setGenerating(true);

        try {
            // ── Fast path: try template render first (no LLM needed) ──
            updateLoadingText(loadingEl, 'Checking physics domain...');
            let jobId = null;
            let usedTemplate = false;

            try {
                const quickResp = await apiFetch('/quick_render', { question, quality }, FETCH_TIMEOUTS.quick);
                if (quickResp && quickResp.job_id) {
                    jobId = quickResp.job_id;
                    usedTemplate = true;
                    const domain = quickResp.domain || 'physics';
                    const cached = quickResp.cached ? ' (instant)' : '';
                    updateLoadingText(loadingEl, `Rendering ${domain} animation${cached}...`);
                }
            } catch (_) {
                // quick_render failed or timed out — fall through to LLM path
            }

            // ── Medium path: single combined LLM call (plan + code) ──
            let plan = '';
            let code = '';
            if (!jobId) {
                try {
                    updateLoadingText(loadingEl, 'Step 1/2: Generating animation plan & code...');
                    const combined = await apiFetch('/generate_plan_and_code', { question }, FETCH_TIMEOUTS.combined);
                    plan = combined.plan || '';
                    code = combined.code || '';
                    if (plan.trim() && code.trim()) {
                        currentPlan = plan;
                        updateLoadingText(loadingEl, 'Step 2/2: Queuing render...');
                        const jobResp = await apiFetch('/render_async', { code, plan, question, quality }, 30_000);
                        jobId = jobResp.job_id;
                    }
                } catch (_combinedErr) {
                    // Combined call failed — fall back to two-step flow
                    plan = '';
                    code = '';
                    jobId = null;
                }
            }

            // ── Slow fallback: separate plan → code → render ──────────
            if (!jobId) {
                updateLoadingText(loadingEl, 'Step 1/3: Understanding the physics...');
                const planResp = await apiFetch('/generate_plan', { question }, FETCH_TIMEOUTS.plan);
                plan = planResp.plan || '';
                if (!plan.trim()) throw new Error('Failed to generate a plan. Try rephrasing your question.');
                currentPlan = plan;

                updateLoadingText(loadingEl, 'Step 2/3: Writing animation code...');
                const codeResp = await apiFetch('/generate_code', { question, plan }, FETCH_TIMEOUTS.code);
                code = codeResp.code || '';
                if (!code.trim()) throw new Error('Failed to generate animation code.');

                updateLoadingText(loadingEl, 'Step 3/3: Queuing render...');
                const jobResp = await apiFetch('/render_async', { code, plan, question, quality }, 30_000);
                jobId = jobResp.job_id;
                if (!jobId) throw new Error('Failed to start render job.');
            }

            // ── Poll until done ───────────────────────────────────────
            const renderResult = await pollJobUntilDone(jobId, loadingEl);
            const videoUrl = buildVideoUrl(renderResult.video_url);
            if (!videoUrl) throw new Error('Render completed but no video was produced. Try again.');

            currentCode = renderResult.final_code || code;
            if (!currentPlan) currentPlan = plan || question;

            removeElement(loadingEl);

            const replyText = usedTemplate
                ? `Here's your physics animation:\n\n${question}`
                : buildPhysicsReply(plan);
            appendAssistantWithVideo(replyText, videoUrl, question);
            addToHistory(question, renderResult.video_url);
            openVideoWindow(videoUrl, question);
            conversationHistory = [];

        } catch (err) {
            removeElement(loadingEl);
            if (err.name === 'AbortError') {
                appendMessage('assistant', 'Generation stopped. You can retry or ask a different question.');
            } else {
                appendError(err.message || 'Something went wrong. Please try again.', question);
            }
        } finally {
            setGenerating(false);
        }
    }

    // ── Async render polling ─────────────────────────────────────────────────

    async function pollJobUntilDone(jobId, loadingEl) {
        const startTime = Date.now();
        const MAX_POLL_MS = 130_000; // slightly above server timeout (120s)
        let consecutiveErrors = 0;

        while (true) {
            await sleep(POLL_INTERVAL_MS);

            // Hard timeout — never hang forever
            if (Date.now() - startTime > MAX_POLL_MS) {
                throw new Error('Render timed out. Try a simpler animation.');
            }

            // Check if user cancelled
            if (abortController && abortController.signal.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            let resp;
            try {
                resp = await fetch(`${API_BASE}/job/${jobId}`, {
                    signal: abortController ? abortController.signal : undefined,
                });
            } catch (e) {
                if (e.name === 'AbortError') throw e;
                // transient network hiccup — back off and retry
                consecutiveErrors++;
                await sleep(Math.min(2000 * consecutiveErrors, 8000));
                continue;
            }

            // 404 = job never existed or server was restarted — stop immediately
            if (resp.status === 404) {
                throw new Error('Render job lost (server may have restarted). Please try again.');
            }

            // 429 = we're still rate-limited despite exempting job polling.
            // Back off 5 s and retry without counting as consecutive error.
            if (resp.status === 429) {
                await sleep(5000);
                continue;
            }

            if (!resp.ok) {
                consecutiveErrors++;
                await sleep(Math.min(2000 * consecutiveErrors, 8000));
                continue;
            }

            consecutiveErrors = 0;
            const jobData = await resp.json();

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const qualityLabel = { low: '480p', medium: '720p', high: '1080p' }[qualitySelect.value] || '480p';
            updateLoadingText(loadingEl, `Rendering ${qualityLabel} animation… ${elapsed}s`);

            if (jobData.status === 'done') {
                return jobData.result;
            }
            if (jobData.status === 'error') {
                throw new Error(jobData.error || 'Render job failed.');
            }
            // still pending/rendering — keep polling
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ── Follow-up Flow ────────────────────────────────────────────────────────

    async function handleFollowup(message) {
        const quality = qualitySelect.value;
        appendMessage('user', message);
        conversationHistory.push({ role: 'user', content: message });

        const loadingEl = appendLoading('Checking...');
        setGenerating(true);

        try {
            // ── Fast path: try quick_render first ──────────────────────────
            // If the follow-up matches a physics template (e.g. same topic with
            // new params), skip the LLM entirely and render immediately.
            let quickJobId = null;
            let quickDomain = null;
            try {
                const quickResp = await apiFetch(
                    '/quick_render', { question: message, quality }, FETCH_TIMEOUTS.quick
                );
                if (quickResp && quickResp.job_id) {
                    quickJobId = quickResp.job_id;
                    quickDomain = quickResp.domain || 'physics';
                }
            } catch (_) { /* non-fatal */ }

            if (quickJobId) {
                updateLoadingText(loadingEl, `Rendering ${quickDomain} animation...`);
                const renderResult = await pollJobUntilDone(quickJobId, loadingEl);
                const videoUrl = buildVideoUrl(renderResult.video_url);
                removeElement(loadingEl);
                if (videoUrl) {
                    currentCode = renderResult.final_code || currentCode;
                    const reply = 'Here\'s the updated animation:';
                    appendAssistantWithVideo(reply, videoUrl, message);
                    addToHistory(message, renderResult.video_url);
                    openVideoWindow(videoUrl, message);
                    conversationHistory.push({ role: 'assistant', content: reply });
                    return;
                }
            }

            // ── Slow path: LLM follow-up ───────────────────────────────────
            updateLoadingText(loadingEl, 'Thinking...');
            const followupController = new AbortController();
            const timeoutId = setTimeout(() => followupController.abort(), 300_000);

            const resp = await fetch(`${API_BASE}/followup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    history: conversationHistory,
                    previous_plan: currentPlan,
                    previous_code: currentCode,
                    original_question: originalQuestion,
                    quality,
                }),
                signal: followupController.signal,
            });
            clearTimeout(timeoutId);

            if (!resp.ok) throw new Error(await getErrorText(resp));
            const data = await resp.json();
            removeElement(loadingEl);

            if (data.type === 'animate' && data.video_url) {
                const reply = data.reply || 'Here is the updated animation:';
                if (data.plan) currentPlan = data.plan;
                if (data.code) currentCode = data.code;
                const videoUrl = buildVideoUrl(data.video_url);
                appendAssistantWithVideo(reply, videoUrl, message);
                addToHistory(message, data.video_url);
                openVideoWindow(videoUrl, message);
                conversationHistory.push({ role: 'assistant', content: reply });
            } else {
                const reply = data.reply || 'I couldn\'t generate a response.';
                appendMessage('assistant', reply);
                conversationHistory.push({ role: 'assistant', content: reply });
            }
        } catch (err) {
            removeElement(loadingEl);
            if (err.name === 'AbortError') {
                appendMessage('assistant', 'Generation stopped. You can retry or ask a different question.');
            } else {
                appendMessage('error', err.message || 'Something went wrong. Please try again.');
            }
        } finally {
            setGenerating(false);
        }
    }

    // ── API Helper ────────────────────────────────────────────────────────────

    function apiFetch(path, body, timeoutMs) {
        const timeoutId = setTimeout(() => { if (abortController) abortController.abort(); }, timeoutMs);
        return fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: abortController ? abortController.signal : undefined,
        }).then(async resp => {
            clearTimeout(timeoutId);
            if (!resp.ok) throw new Error(await getErrorText(resp));
            return resp.json();
        }).catch(err => {
            clearTimeout(timeoutId);
            throw err;
        });
    }

    async function getErrorText(resp) {
        try {
            const data = await resp.json();
            const d = data.detail;
            if (d == null) return resp.statusText;
            if (Array.isArray(d)) return d.map(x => x.msg || JSON.stringify(x)).join('; ');
            return typeof d === 'string' ? d : JSON.stringify(d);
        } catch {
            return `HTTP ${resp.status}: ${resp.statusText}`;
        }
    }

    // ── DOM Helpers ───────────────────────────────────────────────────────────

    function appendMessage(role, text) {
        const wrapper = document.createElement('div');
        wrapper.className = `msg msg-${role}`;

        const label = document.createElement('div');
        label.className = 'msg-label';
        label.textContent = role === 'user' ? 'You' : role === 'error' ? '' : 'PhysiMate';

        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';

        if (role === 'assistant' && typeof marked !== 'undefined' && marked.parse) {
            bubble.innerHTML = marked.parse(text);
        } else {
            bubble.textContent = text;
        }

        if (role !== 'error') wrapper.appendChild(label);
        wrapper.appendChild(bubble);
        chatMessages.appendChild(wrapper);
        scrollToBottom();
        return wrapper;
    }

    // ── Simulator panel counter (unique IDs) ─────────────────────────────────
    let _simCounter = 0;

    // ── Open each animation in its own dedicated browser window ─────────────
    function openVideoWindow(videoUrl, question) {
        const win = window.open(
            '',
            'physiMate_' + Date.now(),
            'width=960,height=680,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'
        );
        if (!win) return; // popup blocked
        const q = (question || 'Physics Animation').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PhysiMate – ${q.slice(0, 60)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f1117;color:#e2e8f0;font-family:'Inter',system-ui,sans-serif;
       display:flex;flex-direction:column;min-height:100vh;padding:28px 32px}
  .top{display:flex;align-items:center;gap:12px;margin-bottom:20px}
  .logo{font-weight:800;font-size:18px;letter-spacing:-.03em;color:#fff}
  .logo span{color:#818cf8}
  .question{font-size:14px;font-weight:500;color:#94a3b8;line-height:1.5;
            background:#1e2130;border:1px solid #2d3148;border-radius:10px;
            padding:12px 16px;margin-bottom:20px}
  .player-wrap{flex:1;background:#000;border-radius:14px;overflow:hidden;
               display:flex;align-items:center;justify-content:center;min-height:380px}
  video{width:100%;max-height:520px;border-radius:14px;display:block}
  .footer{display:flex;align-items:center;justify-content:space-between;margin-top:18px;gap:12px}
  .dl{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;
      background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;
      font-size:13px;font-weight:600;transition:background .15s}
  .dl:hover{background:#4338ca}
  .close-btn{background:none;border:1px solid #2d3148;border-radius:8px;
             padding:9px 16px;color:#94a3b8;font-size:13px;font-weight:600;
             cursor:pointer;transition:border-color .15s}
  .close-btn:hover{border-color:#818cf8;color:#818cf8}
  .ts{font-size:12px;color:#475569}
</style>
</head>
<body>
  <div class="top">
    <div class="logo">Physi<span>Mate</span></div>
  </div>
  <div class="question">${q}</div>
  <div class="player-wrap">
    <video controls autoplay loop playsinline>
      <source src="${videoUrl}" type="video/mp4">
    </video>
  </div>
  <div class="footer">
    <span class="ts">${new Date().toLocaleString()}</span>
    <a class="dl" href="${videoUrl}" download="physiMate-${Date.now()}.mp4">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Download MP4
    </a>
    <button class="close-btn" onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`);
        win.document.close();
    }

    function appendAssistantWithVideo(text, videoUrl, question) {
        const wrapper = document.createElement('div');
        wrapper.className = 'msg msg-assistant';

        const label = document.createElement('div');
        label.className = 'msg-label';
        label.textContent = 'PhysiMate';

        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        if (typeof marked !== 'undefined' && marked.parse) {
            bubble.innerHTML = marked.parse(text);
        } else {
            bubble.textContent = text;
        }

        // ── Tabbed simulator panel ──────────────────────────────────────────
        const simId = 'sim-' + (++_simCounter);
        const panel = document.createElement('div');
        panel.className = 'sim-panel';

        // Tab bar
        const tabBar = document.createElement('div');
        tabBar.className = 'sim-tab-bar';
        tabBar.innerHTML = `
            <button class="sim-tab-btn active" data-tab="interactive" data-sim="${simId}">⚡ Interactive</button>
            <button class="sim-tab-btn" data-tab="video" data-sim="${simId}">🎬 Video</button>`;
        panel.appendChild(tabBar);

        // ── Interactive pane ─────────────────────────────────────────────────
        const interactivePane = document.createElement('div');
        interactivePane.className = 'sim-pane';
        interactivePane.id = 'pane-interactive-' + simId;

        // Canvas area (Matter.js injects canvas here)
        const canvasArea = document.createElement('div');
        canvasArea.className = 'sim-canvas-area';
        canvasArea.id = 'sim-canvas-' + simId;

        // Loading state
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'sim-loading';
        loadingDiv.id = 'sim-loading-' + simId;
        loadingDiv.innerHTML = `<div class="sim-loading-spinner"></div> <span>Loading interactive simulation…</span>`;
        canvasArea.appendChild(loadingDiv);

        interactivePane.appendChild(canvasArea);

        // Controls bar
        const ctrlBar = document.createElement('div');
        ctrlBar.className = 'sim-ctrl-bar';
        ctrlBar.id = 'sim-ctrls-' + simId;
        ctrlBar.innerHTML = `
            <button class="sim-ctrl-btn" title="Play" onclick="window._simCtrl('${simId}','play')">▶</button>
            <button class="sim-ctrl-btn" title="Pause" onclick="window._simCtrl('${simId}','pause')">⏸</button>
            <button class="sim-ctrl-btn" title="Reset" onclick="window._simCtrl('${simId}','reset')">↺ Reset</button>
            <div class="sim-speed-label">
                Speed:
                <select class="sim-speed-select" onchange="window._simCtrl('${simId}','speed',this.value)">
                    <option value="0.5">0.5×</option>
                    <option value="1" selected>1×</option>
                    <option value="2">2×</option>
                    <option value="3">3×</option>
                </select>
            </div>`;
        interactivePane.appendChild(ctrlBar);

        // Slider panel (filled after scene loads)
        const slidersDiv = document.createElement('div');
        slidersDiv.className = 'sim-sliders';
        slidersDiv.id = 'sim-sliders-' + simId;
        interactivePane.appendChild(slidersDiv);

        panel.appendChild(interactivePane);

        // ── Video pane ───────────────────────────────────────────────────────
        const videoPane = document.createElement('div');
        videoPane.className = 'sim-pane hidden';
        videoPane.id = 'pane-video-' + simId;

        const videoWrap = document.createElement('div');
        videoWrap.className = 'sim-video-wrap';

        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = false;
        video.loop = true;
        video.playsInline = true;
        const source = document.createElement('source');
        source.src = videoUrl;
        source.type = 'video/mp4';
        video.appendChild(source);
        videoWrap.appendChild(video);

        // Download button
        const videoFooter = document.createElement('div');
        videoFooter.className = 'sim-video-footer';
        const dlBtn = document.createElement('a');
        dlBtn.className = 'download-btn';
        dlBtn.href = videoUrl;
        dlBtn.download = `physiMate-${Date.now()}.mp4`;
        dlBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download MP4`;
        videoFooter.appendChild(dlBtn);
        videoPane.appendChild(videoWrap);
        videoPane.appendChild(videoFooter);
        panel.appendChild(videoPane);

        wrapper.appendChild(label);
        wrapper.appendChild(bubble);
        wrapper.appendChild(panel);
        chatMessages.appendChild(wrapper);
        scrollToBottom();

        // Tab switching logic
        tabBar.addEventListener('click', e => {
            const btn = e.target.closest('.sim-tab-btn');
            if (!btn) return;
            const tab = btn.dataset.tab;
            tabBar.querySelectorAll('.sim-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('pane-interactive-' + simId).classList.toggle('hidden', tab !== 'interactive');
            document.getElementById('pane-video-' + simId).classList.toggle('hidden', tab !== 'video');
            if (tab === 'video') video.play().catch(() => {});
        });

        // Async: fetch scene config + boot simulator
        if (question) {
            _fetchAndBootSimulator(simId, question);
        }
    }

    /** Fetch /api/simulate and initialise Matter.js scene. */
    async function _fetchAndBootSimulator(simId, question) {
        const canvasArea = document.getElementById('sim-canvas-' + simId);
        const slidersDiv = document.getElementById('sim-sliders-' + simId);

        // Helper: show an error/note in the canvas area regardless of
        // whether the loading spinner has already been removed.
        function showSimError(msg) {
            const spinner = document.getElementById('sim-loading-' + simId);
            if (spinner) {
                spinner.innerHTML = `<span style="color:#6b7280;font-size:0.8rem;">${escapeHtml(msg)}</span>`;
            } else if (canvasArea) {
                const note = document.createElement('div');
                note.className = 'sim-unsupported';
                note.textContent = msg;
                canvasArea.appendChild(note);
            }
        }

        function removeSpinner() {
            const spinner = document.getElementById('sim-loading-' + simId);
            if (spinner) spinner.remove();
        }

        try {
            // Guard: Matter.js must be available
            if (typeof Matter === 'undefined') {
                showSimError('Physics engine (Matter.js) failed to load.');
                return;
            }

            // 15-second timeout — interactive classification may use the LLM (Anthropic)
            const fetchCtrl = new AbortController();
            const fetchTimeout = setTimeout(() => fetchCtrl.abort(), 15000);

            let resp;
            try {
                resp = await fetch(`${API_BASE}/simulate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question }),
                    signal: fetchCtrl.signal,
                });
            } finally {
                clearTimeout(fetchTimeout);
            }

            if (!resp.ok) throw new Error('Server returned ' + resp.status);
            const scene = await resp.json();

            if (!canvasArea) return; // panel was removed from DOM

            if (!scene || !scene.supported) {
                removeSpinner();
                const note = document.createElement('div');
                note.className = 'sim-unsupported';
                note.textContent = scene?.message || 'Interactive simulation not available for this topic.';
                canvasArea.appendChild(note);
                return;
            }

            // Spinner removed here — only after we know the scene is valid
            removeSpinner();

            // Boot simulator in its own try so errors don't leave a blank panel
            try {
                const sim = new PhysicsSimulator('sim-canvas-' + simId, scene);
                window._simulators[simId] = sim;
                _buildSliders(slidersDiv, simId, scene.params || []);
            } catch (bootErr) {
                console.error('Simulator boot error:', bootErr);
                showSimError('Simulation failed to start — watch the video tab instead.');
            }

        } catch (err) {
            const msg = err.name === 'AbortError'
                ? 'Simulation timed out — watch the video tab instead.'
                : 'Interactive simulation unavailable.';
            showSimError(msg);
        }
    }

    /** Build a slider for each scene parameter. */
    function _buildSliders(container, simId, params) {
        container.innerHTML = '';
        if (!params.length) return;

        params.forEach(p => {
            const row = document.createElement('div');
            row.className = 'sim-slider-row';

            const lbl = document.createElement('label');
            lbl.className = 'sim-slider-label';
            lbl.textContent = p.unit ? `${p.label} (${p.unit})` : p.label;
            lbl.htmlFor = `slider-${simId}-${p.id}`;

            const input = document.createElement('input');
            input.type = 'range';
            input.className = 'sim-slider-input';
            input.id = `slider-${simId}-${p.id}`;
            input.min  = p.min;
            input.max  = p.max;
            input.step = p.step;
            input.value = p.value;

            const valDisplay = document.createElement('span');
            valDisplay.className = 'sim-slider-value';
            valDisplay.textContent = p.value;

            input.addEventListener('input', () => {
                const v = parseFloat(input.value);
                valDisplay.textContent = v;
                const sim = window._simulators[simId];
                if (sim) sim.updateParam(p.id, v);
            });

            row.appendChild(lbl);
            row.appendChild(input);
            row.appendChild(valDisplay);
            container.appendChild(row);
        });
    }

    /** Global handler called by inline onclick in control bar. */
    window._simCtrl = function(simId, action, value) {
        const sim = window._simulators[simId];
        if (!sim) return;
        switch (action) {
            case 'play':  sim.play();  break;
            case 'pause': sim.pause(); break;
            case 'reset': sim.reset(); break;
            case 'speed': sim.setSpeed(value); break;
        }
    };

    function appendLoading(text) {
        const wrapper = document.createElement('div');
        wrapper.className = 'msg msg-loading';
        wrapper.innerHTML = `
            <div class="typing-indicator">
                <div class="typing-dots"><span></span><span></span><span></span></div>
                <span class="typing-text">${escapeHtml(text)}</span>
            </div>`;
        chatMessages.appendChild(wrapper);
        scrollToBottom();
        return wrapper;
    }

    function updateLoadingText(el, text) {
        if (!el) return;
        const span = el.querySelector('.typing-text');
        if (span) span.textContent = text;
    }

    function appendError(message, retryQuestion) {
        const wrapper = document.createElement('div');
        wrapper.className = 'msg msg-error';

        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        bubble.textContent = message;

        if (retryQuestion) {
            const btn = document.createElement('button');
            btn.className = 'retry-btn';
            btn.textContent = 'Retry';
            btn.addEventListener('click', () => {
                chatInput.value = retryQuestion;
                chatInput.dispatchEvent(new Event('input'));
                handleNewQuestion(retryQuestion);
            });
            bubble.appendChild(document.createElement('br'));
            bubble.appendChild(btn);
        }

        wrapper.appendChild(bubble);
        chatMessages.appendChild(wrapper);
        scrollToBottom();
    }

    function removeElement(el) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── State Helpers ─────────────────────────────────────────────────────────

    function setGenerating(active) {
        isGenerating = active;
        chatInput.disabled = active;

        if (active) {
            abortController = new AbortController();
            cancelEnabled = false;
            sendBtn.classList.add('cancel-mode');
            sendBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
            setTimeout(() => { cancelEnabled = true; }, 1000);
        } else {
            abortController = null;
            cancelEnabled = false;
            sendBtn.classList.remove('cancel-mode');
            sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
            chatInput.disabled = false;
            chatInput.focus();
        }
    }

    function cancelRequest() {
        if (abortController) abortController.abort();
        setGenerating(false);
    }

    function buildVideoUrl(urlPath) {
        if (!urlPath || typeof urlPath !== 'string') return null;
        const origin = window.location.origin || 'http://localhost:8000';
        return origin + (urlPath.startsWith('/') ? urlPath : '/' + urlPath);
    }

    function buildPhysicsReply(plan) {
        if (!plan) return 'Here\'s your animation:';
        const lines = plan.split('\n').filter(l => l.trim());
        if (lines.length <= 3) return plan + '\n\nHere\'s the animation:';
        return plan + '\n\n**Here\'s the animation:**';
    }
});

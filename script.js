document.addEventListener('DOMContentLoaded', () => {
    // --- INITIALIZATION ---
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const messageFeed = document.getElementById('message-feed');
    const sendBtn = document.getElementById('send-btn');
    let conversationHistory = []; // Session history
    const API_KEY = "--------------"; // <--- Add your API key  here



    // --- SETUP ---
    function init() {
        if (conversationHistory.length > 0) {
            messageFeed.innerHTML = '';
            conversationHistory.forEach(msg => {
                appendMessage(msg.role === 'user' ? 'user' : 'ai', msg.parts[0].text, false, false);
            });
        }
    }



    function appendMessage(sender, text, animate = true, isStreaming = false) {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${animate ? 'animate' : ''}`;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = sender === 'ai' ? 'A' : 'You';

        const content = document.createElement('div');
        content.className = 'message-content';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = isStreaming ? text : parseMarkdown(text);

        content.appendChild(bubble);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        wrapper.appendChild(messageDiv);
        messageFeed.appendChild(wrapper);

        if (!isStreaming) scrollToBottom();
        return bubble;
    }

    function scrollToBottom() {
        messageFeed.scrollTo({
            top: messageFeed.scrollHeight,
            behavior: 'smooth'
        });
    }

    // --- FORM HANDLERS ---
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = (userInput.scrollHeight) + 'px';
        sendBtn.disabled = !userInput.value.trim();
    });

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = userInput.value.trim();
        if (!text) return;

        // Visual feedback
        userInput.value = '';
        userInput.style.height = 'auto';
        sendBtn.disabled = true;

        appendMessage('user', text);
        await getGeminiResponse(text);
    });


    // --- CORE LOGIC ---
    async function getGeminiResponse(userPrompt) {
        if (!API_KEY || API_KEY === "PASTE_YOUR_KEY_HERE") {
            return appendMessage('ai', "Critical: Please add your Gemini API Key in `script.js` (line 15).");
        }

        conversationHistory.push({ role: "user", parts: [{ text: userPrompt }] });
        showTypingIndicator();

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${API_KEY}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: conversationHistory,
                    generationConfig: {
                        temperature: 1,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 8192,
                        responseMimeType: "text/plain",
                    }
                })
            });

            removeTypingIndicator();

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.error("Gemini API Error:", errData);
                throw new Error(errData.error?.message || 'API Error');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            let bubble = appendMessage('ai', '...', true, true);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                // Robust parsing of nested JSON chunks from Gemini
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.trim().startsWith('"text"')) {
                        const match = line.match(/"text":\s*"(.*)"/);
                        if (match) {
                            const val = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                            fullText += val;
                            bubble.innerHTML = parseMarkdown(fullText);
                            scrollToBottom();
                        }
                    } else if (line.includes('"text":')) {
                        // Fallback for different chunk structures
                        const match = line.match(/"text":\s*"((?:[^"\\]|\\.)*)"/);
                        if (match) {
                            const val = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                            fullText += val;
                            bubble.innerHTML = parseMarkdown(fullText);
                            scrollToBottom();
                        }
                    }
                }
            }

            conversationHistory.push({ role: "model", parts: [{ text: fullText }] });
            saveSession();

        } catch (err) {
            removeTypingIndicator();
            triggerBackup(userPrompt);
        }
    }

    function triggerBackup(userPrompt) {
        const backupResponses = {
            "hello": "AERIA Link Offline. Standard Neural Backup initialized. How can I help?",
            "code": "My technical processors are currently restricted. Please check your network or API key status.",
            "default": "I'm having trouble connecting to my central neural core. Please ensure your Gemini API Key is valid in Settings."
        };
        const text = backupResponses[userPrompt.toLowerCase()] || backupResponses.default;
        appendMessage('ai', `<span class="backup-badge">Backup Active</span> ${text}`);
    }

    // --- PERSISTENCE ---
    function saveSession() {
        localStorage.setItem('AERIA_CURRENT_SESSION', JSON.stringify(conversationHistory));
    }

    // --- MARKDOWN ENGINE ---
    function parseMarkdown(text) {
        // Allow the backup badge to pass through first
        let html = text;
        const hasBadge = html.includes('backup-badge');

        if (!hasBadge) {
            html = html
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        // Code Blocks
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        // Inline Code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        // Headers
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Lists
        html = html.replace(/^\s*[\*\-]\s+(.*)/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>');

        return html.replace(/\n/g, '<br>');
    }

    function showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'typing-indicator';
        indicator.className = 'message-wrapper animate';
        indicator.innerHTML = `
            <div class="message ai">
                <div class="message-avatar">A</div>
                <div class="message-content">
                    <div class="message-bubble">...</div>
                </div>
            </div>
        `;
        messageFeed.appendChild(indicator);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    init();
});

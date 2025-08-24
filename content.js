let alreadyHandled = false;
let currentVideoId = null;
let isGettingTranscript = false;

if (window.contentScriptLoaded) {
    window.contentScriptLoaded = false;
    alreadyHandled = false;
}
window.contentScriptLoaded = true;

function getCurrentVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

function waitForVideoLoad(targetVideoId, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        function check() {
            const currentId = getCurrentVideoId();
            const videoElement = document.querySelector('video');
            const titleElement = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
            
            if (currentId === targetVideoId && 
                videoElement && 
                titleElement && 
                titleElement.textContent.trim()) {
                resolve(currentId);
                return;
            }
            
            if (Date.now() - startTime > timeout) {
                reject(new Error(`Video ${targetVideoId} not loaded within ${timeout}ms`));
                return;
            }
            
            setTimeout(check, 200);
        }
        
        check();
    });
}

function clearExistingTranscripts() {
    return new Promise((resolve) => {
        const existingTranscripts = document.querySelectorAll('[role="dialog"] ytd-transcript-renderer, ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-transcript"]');
        existingTranscripts.forEach(el => el.remove());
        
        const closeButtons = document.querySelectorAll('button[aria-label*="Close transcript" i], button[aria-label*="close" i]');
        closeButtons.forEach(btn => {
            if (btn.closest('[target-id="engagement-panel-transcript"]')) {
                btn.click();
            }
        });
        
        setTimeout(resolve, 1000);
    });
}

async function forceRefreshTranscript() {
    await clearExistingTranscripts();
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    for (let attempt = 0; attempt < 3; attempt++) {
        const transcriptButtons = document.querySelectorAll('button[aria-label*="transcript" i]');
        
        for (const button of transcriptButtons) {
            const isActive = button.getAttribute('aria-pressed') === 'true' || 
                           button.classList.contains('style-default-active');
            
            if (!isActive) {
                button.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const transcriptPanel = document.querySelector('ytd-transcript-renderer, [target-id="engagement-panel-transcript"]');
                if (transcriptPanel) {
                    return true;
                }
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return false;
}

async function getYouTubeTranscript() {
    if (isGettingTranscript) {
        throw new Error("Already getting transcript, please wait");
    }
    
    try {
        isGettingTranscript = true;
        const videoId = getCurrentVideoId();
        
        if (!videoId) {
            throw new Error("No video ID found in URL");
        }
        
        if (currentVideoId !== videoId) {
            await waitForVideoLoad(videoId);
            currentVideoId = videoId;
        }
        
        const transcriptOpened = await forceRefreshTranscript();
        
        if (!transcriptOpened) {
            throw new Error("Could not open transcript panel - transcripts may not be available");
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        if (getCurrentVideoId() !== videoId) {
            throw new Error("Video changed during transcript extraction");
        }
        
        let transcriptText = await extractTranscriptText(videoId);
        
        if (!transcriptText || transcriptText.length < 50) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            transcriptText = await extractTranscriptTextAlternative();
        }
        
        if (!transcriptText || transcriptText.length < 50) {
            throw new Error("No valid transcript content found");
        }
        
        return transcriptText;
        
    } finally {
        isGettingTranscript = false;
    }
}

async function extractTranscriptText(videoId) {
    const selectors = [
        'ytd-transcript-segment-renderer .segment-text',
        '.ytd-transcript-segment-renderer',
        'ytd-transcript-body-renderer .segment',
        '[data-params*="transcript"] .segment'
    ];
    
    for (const selector of selectors) {
        const elements = Array.from(document.querySelectorAll(selector));
        
        if (elements.length > 0) {
            let captions = elements.map(el => {
                let text = el.textContent || el.innerText || '';
                return text.replace(/\d{1,2}:\d{2}/g, '').replace(/\n/g, ' ').trim();
            });
            
            captions = captions
                .filter(caption => caption.length > 0 && !caption.match(/^\d{1,2}:\d{2}$/))
                .filter((caption, i, arr) => caption !== arr[i - 1]);
            
            const result = captions.join(' ').trim();
            if (result.length > 50) {
                return result;
            }
        }
    }
    
    return null;
}

async function extractTranscriptTextAlternative() {
    const containers = [
        'ytd-transcript-renderer',
        '[target-id="engagement-panel-transcript"]',
        '.ytd-transcript-body-renderer'
    ];
    
    for (const containerSelector of containers) {
        const container = document.querySelector(containerSelector);
        if (container) {
            const allText = container.textContent || container.innerText || '';
            const cleaned = allText
                .replace(/\d{1,2}:\d{2}/g, '')
                .replace(/\s+/g, ' ')
                .replace(/Show transcript|Hide transcript|Transcript/gi, '')
                .trim();
            
            if (cleaned.length > 50) {
                return cleaned;
            }
        }
    }
    
    return null;
}

async function getText() {
    if (window.location.hostname.includes("youtube.com")) {
        try {
            return await getYouTubeTranscript();
        } catch (error) {
            console.error("YouTube transcript failed:", error.message);
            
            const descriptionSelectors = [
                '#description-text',
                '#meta-contents #description',
                'ytd-watch-metadata #description',
                '.ytd-video-secondary-info-renderer #description'
            ];
            
            for (const selector of descriptionSelectors) {
                const description = document.querySelector(selector);
                if (description && description.textContent.trim().length > 50) {
                    return `Video Description: ${description.textContent.trim()}`;
                }
            }
            
            return `Unable to get YouTube transcript: ${error.message}. Please ensure captions are available for this video.`;
        }
    }
    
    const article = document.querySelector("article");
    if (article && article.innerText.trim()) {
        return article.innerText;
    }
    
    const paragraphs = Array.from(document.querySelectorAll("p"));
    const text = paragraphs.map(p => p.innerText).join("\n").trim();
    
    return text || "No readable text found on this page.";
}

if (window.location.hostname.includes("youtube.com")) {
    let lastUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            const newVideoId = getCurrentVideoId();
            if (newVideoId && newVideoId !== currentVideoId) {
                currentVideoId = newVideoId;
                isGettingTranscript = false; 
            }
        }
    });
    
    observer.observe(document, { subtree: true, childList: true });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GO_TO_AI") {
        const now = Date.now();
        const lastHandled = window.lastPromptTime || 0;
        
        if (now - lastHandled < 2000) { 
            sendResponse({ success: false, message: "Duplicate request ignored" });
            return;
        }
        
        window.lastPromptTime = now;
        (async () => {
            try {
                const promptText = request.prompt || "No text found";

                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const inputSelectors = [
                    'textarea[placeholder*="Ask"]',
                    'div[contenteditable="true"]',
                    'textarea[data-id="root"]',
                    '#prompt-textarea',
                    'textarea[placeholder*="Message"]'
                ];
                
                let inputElement = null;
                for (const selector of inputSelectors) {
                    inputElement = document.querySelector(selector);
                    if (inputElement && inputElement.offsetParent !== null) break;
                }
                
                if (inputElement) {
                    inputElement.value = '';
                    inputElement.textContent = '';
                    inputElement.innerHTML = '';
                    
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    inputElement.focus();
                    inputElement.value = promptText;
                    inputElement.textContent = promptText;
                    
                    ['input', 'change', 'keyup'].forEach(eventType => {
                        inputElement.dispatchEvent(new Event(eventType, { bubbles: true }));
                    });
                    
                    sendResponse({ success: true, message: "Prompt inserted" });
                } else {
                    sendResponse({ success: false, message: "AI input not found" });
                }
                
            } catch (error) {
                console.error("Error inserting prompt:", error);
                sendResponse({ success: false, message: error.message });
            }
        })();
        
        return true;
    }
    
    if (request.type === "GET_TEXT") {
        getText().then(text => {
            sendResponse({ text });
        }).catch(error => {
            console.error("Error getting text:", error);
            sendResponse({ error: error.message });
        });
        return true;
    }
});
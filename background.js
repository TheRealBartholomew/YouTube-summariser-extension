chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(["apikey"], (result) => {
        if (!result.apikey) {
            chrome.tabs.create({ url: "options.html" });
        }
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "openAI") {
        const summaryType = message.summaryType;
        const aiType = message.aiType;

        chrome.tabs.query({ active: true, currentWindow: true }, ([ytTab]) => {
            const isYouTube = ytTab.url.includes('youtube.com');
            const delay = isYouTube ? 3000 : 1000;
            
            setTimeout(() => {
                chrome.tabs.sendMessage(ytTab.id, { type: "GET_TEXT" }, (response) => {
                    if (!response || !response.text) {
                        console.error("No text found on tab");
                        return;
                    }

                    const promptText = response.text;

                    const aiTypeMap = {
                        chatgpt: "https://chatgpt.com/",
                        claude: "https://claude.ai/"
                    };

                    const aiUrl = aiTypeMap[aiType];
                    if (!aiUrl) {
                        console.error("Unknown AI type:", aiType);
                        return;
                    }

                    chrome.tabs.create({ url: aiUrl }, (newTab) => {
                        const tabId = newTab.id;
                        let messageSent = false;

                        function listener(updatedTabId, info) {
                            if (updatedTabId === tabId && info.status === "complete" && !messageSent) {
                                messageSent = true;
                                chrome.tabs.onUpdated.removeListener(listener);

                                chrome.scripting.executeScript({
                                    target: { tabId: tabId },
                                    func: () => {

                                        window.contentScriptLoaded = false;
                                        window.lastPromptTime = 0;
                                    }
                                }).then(() => {

                                    return chrome.scripting.executeScript({
                                        target: { tabId: tabId },
                                        files: ["content.js"],
                                    });
                                }).then(() => {

                                    setTimeout(() => {
                                        chrome.storage.sync.get(["promptChanged", "shortPrompt", "detailedPrompt"], (data) => {
                                            let finalPrompt;
                                            const status = data.promptChanged || "none";
                                            
                                            if (status !== "none") {
                                                // Use custom prompts based on what's available
                                                const useCustom = (summaryType === "short" && (status === "short" || status === "both")) ||
                                                                (summaryType === "detailed" && (status === "detailed" || status === "both"));
                                                
                                                if (useCustom) {
                                                    const customPrompt = summaryType === "short" ? data.shortPrompt : data.detailedPrompt;
                                                    finalPrompt = `${customPrompt}:\n\n${promptText}`;
                                                } else {
                                                    // Fall back to default if custom prompt for this type doesn't exist
                                                    finalPrompt = summaryType === "short"
                                                        ? `summarise this text shortly :\n\n${promptText}`
                                                        : `summarise this text in detail :\n\n${promptText}`;
                                                }
                                            } else {
                                                // Use default prompts
                                                finalPrompt = summaryType === "short"
                                                    ? `summarise this text shortly :\n\n${promptText}`
                                                    : `summarise this text in detail :\n\n${promptText}`;
                                            }

                                            chrome.tabs.sendMessage(tabId, { 
                                                action: "GO_TO_AI", 
                                                prompt: finalPrompt 
                                            }, (resp) => {
                                                if (!resp || !resp.success) {
                                                    console.error("Failed to insert prompt:", resp);
                                                }
                                            });
                                        });
                                    }, 2000);
                                }).catch(err => console.error("Injection error:", err));
                            }
                        }

                        chrome.tabs.onUpdated.addListener(listener);
                    });
                });
            }, delay);
        });
    }
});
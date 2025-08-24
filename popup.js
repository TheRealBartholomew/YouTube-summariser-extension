document.addEventListener("DOMContentLoaded", () => {
    const resultDiv = document.getElementById("result");

    chrome.storage.local.get(["lastSummary"], ({ lastSummary }) => {
        if (lastSummary) {
            resultDiv.textContent = lastSummary;
        }
    });
});



document.getElementById("generate-summary").addEventListener("click", async () => {
    const resultDiv = document.getElementById("result");
    const summaryType = document.getElementById("summary-type").value;

    resultDiv.innerHTML = '<div class="loader"></div>';

    chrome.storage.sync.get(["apikey"], ({ apikey }) => {
        if (!apikey) {
            resultDiv.innerHTML = "API key is missing.";
            return;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {

            chrome.tabs.sendMessage(
                tab.id, 
                { type: "GET_TEXT" },
                async (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Runtime error:", chrome.runtime.lastError);
                        resultDiv.textContent = "Could not connect to page. Please refresh and try again.";
                        return;
                    }

                    if (!response || !response.text) {
                        resultDiv.textContent = "No text found on the page.";
                        return;
                    }

                    try {
                        const summary = await getGeminiSummary(response.text, summaryType, apikey);
                        resultDiv.textContent = summary;
                        chrome.storage.local.set({ lastSummary: summary });
                    } catch (error) {
                        console.error("Error generating summary:", error);
                        resultDiv.textContent = "Error generating summary.";
                    }
                }
            );
        });
    });
});

document.getElementById("ai").addEventListener("click", () => {
    const resultDiv = document.getElementById("result");
    const aiButton = document.getElementById("ai");
    const summaryType = document.getElementById("summary-type").value;
    const aiType = document.getElementById("model").value;

    resultDiv.innerHTML = '<div class="loader"></div>';
    aiButton.disabled = true;
    aiButton.textContent = "Processing...";

    chrome.runtime.sendMessage({
        action: "openAI",
        summaryType: summaryType,
        aiType: aiType
    }, (response) => {
        if (response && response.success) {
        } else {
            console.error("Failed to send to AI:", aiType, response?.error);
        }
    });
});

document.getElementById("changePrompt").addEventListener("click", () => {
    chrome.tabs.create({ url: "prompts.html" });
});

async function getGeminiSummary(rawText, summaryType, apikey) {
    const promptMap = {
       short: `Summarize the following text in a few sentences:\n\n${rawText}`,
        detailed: `Provide a detailed summary of the following text:\n\n${rawText}`
    };

    const prompt = promptMap[summaryType] || promptMap.detailed;

    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apikey, 
        {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 },
        })
    });

    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
        return data.candidates[0].content?.parts?.[0].text ?? "No summary generated.";
    }

document.getElementById("copy").addEventListener("click", () => {
    const resultDiv = document.getElementById("result");
    const text = resultDiv.textContent.trim();
    const message = document.getElementById("message");

    const invalidTexts = [
        "No text found on the page.",
        "Error generating summary.",
        "API key is missing.",
        "Could not connect to page. Please refresh and try again.",
        "No valid text to copy.",
        "Select a type and summarise"
    ];
    if (invalidTexts.includes(text) || !text) {
        message.textContent = "No valid text to copy.";
        message.classList.add("show");
        setTimeout(() => message.classList.remove("show"), 2000);
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        message.textContent = "Text copied to clipboard!";
        message.classList.add("show");
        setTimeout(() => message.classList.remove("show"), 2000);
    }).catch(err => {
        console.error("Error copying text:", err);
        message.textContent = "Failed to copy text.";
        message.classList.add("show");
    });
});


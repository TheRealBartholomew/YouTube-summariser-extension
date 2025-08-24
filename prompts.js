let promptChanged = false;

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get(["detailedPrompt", "shortPrompt"], (data) => {
        if (data.detailedPrompt) {
            document.getElementById("detailedPrompt").value = data.detailedPrompt;
        }
        if (data.shortPrompt) {
            document.getElementById("shortPrompt").value = data.shortPrompt;
        }
    });
});

document.getElementById("submitBtn").addEventListener("click", () => {
    const detailedPrompt = document.getElementById("detailedPrompt").value;
    const shortPrompt = document.getElementById("shortPrompt").value;
    
    let status = "none";
    if (detailedPrompt.trim() && shortPrompt.trim()) status = "both";
    else if (detailedPrompt.trim()) status = "detailed";
    else if (shortPrompt.trim()) status = "short";

    chrome.storage.sync.set({
        detailedPrompt: detailedPrompt,
        shortPrompt: shortPrompt,
        promptChanged: status
    }, () => {
        window.close();
    });
});

document.getElementById("resetBtn").addEventListener("click", () => {
    document.getElementById("detailedPrompt").value = "";
    document.getElementById("shortPrompt").value = "";
    
    chrome.storage.sync.set({
        detailedPrompt: "",
        shortPrompt: "",
        promptChanged: "none"
    }, () => {
        window.close();
    });
});
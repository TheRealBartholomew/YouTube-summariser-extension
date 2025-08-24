document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.sync.get(["apikey"], ({ apikey }) => {
        if (apikey) document.getElementById("apikey").value = apikey;
    });

    document.getElementById("save").addEventListener("click", () => {
        const apikey = document.getElementById("apikey").value.trim();
        if (!apikey) return;

        chrome.storage.sync.set({ apikey: apikey }, () => {
            document.getElementById("save-button").style.display = "block";
        });
    });
});

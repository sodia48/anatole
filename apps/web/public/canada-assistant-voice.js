(() => {
  const input = document.querySelector('textarea[name="q"]');
  const start = document.getElementById("voice-start");
  const status = document.getElementById("voice-status");
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const french = document.documentElement.lang === "fr";

  if (input && start && status && Recognition) {
    const recognition = new Recognition();
    recognition.lang = french ? "fr-CA" : "en-CA";
    recognition.interimResults = false;
    recognition.continuous = false;
    let listening = false;
    start.hidden = false;
    start.setAttribute("aria-pressed", "false");

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        input.value = [input.value.trim(), transcript].filter(Boolean).join(" ");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
        status.textContent = french
          ? "Dictée ajoutée. Vérifie le texte avant d’envoyer."
          : "Dictation added. Review the text before sending.";
      }
    };
    recognition.onerror = () => {
      status.textContent = french
        ? "Dictée indisponible. Tu peux écrire ta question."
        : "Dictation unavailable. You can type your question.";
    };
    recognition.onend = () => {
      listening = false;
      start.setAttribute("aria-pressed", "false");
    };
    start.addEventListener("click", () => {
      if (listening) {
        recognition.stop();
        return;
      }
      try {
        recognition.start();
        listening = true;
        start.setAttribute("aria-pressed", "true");
        status.textContent = french ? "Écoute en cours…" : "Listening…";
      } catch {
        status.textContent = french
          ? "Dictée indisponible. Tu peux écrire ta question."
          : "Dictation unavailable. You can type your question.";
      }
    });
  }

  if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
    document.querySelectorAll("[data-voice-speak]").forEach((button) => { button.hidden = false; });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-voice-speak]");
      if (!button) return;
        const answer = button.closest(".message")?.querySelector("p")?.textContent;
        if (!answer) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(answer.slice(0, 3000));
        utterance.lang = french ? "fr-CA" : "en-CA";
        window.speechSynthesis.speak(utterance);
    });
  }
})();

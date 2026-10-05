(() => {
  document.documentElement.classList.remove("no-js");
  const form = document.querySelector('[data-testid="canada360-message-form"]');
  const chat = document.querySelector('[data-testid="canada360-assistant-chat"]');
  const input = form?.querySelector('textarea[name="q"]');
  const send = document.getElementById("send-message");
  const hero = document.getElementById("empty-hero");
  const composer = document.getElementById("composer-wrap");
  const shell = document.getElementById("chat-shell");
  const last = document.getElementById("last-message");
  const tools = document.getElementById("tools-toggle");
  const panel = document.getElementById("tools-panel");
  const memory = document.getElementById("conversation-memory");
  if (!form || !chat || !input || !send) return;
  try {
    const parentRoot = window.parent.document.documentElement;
    const syncTheme = () => { document.documentElement.dataset.theme = parentRoot.dataset.theme || "dark"; };
    syncTheme();
    new MutationObserver(syncTheme).observe(parentRoot, { attributes: true, attributeFilter: ["data-theme"] });
  } catch { /* Standalone iframe keeps the dark Anatole theme. */ }
  const fr = document.documentElement.lang === "fr";
  let busy = false;
  let retry = null;
  const nearBottom = () => chat.scrollHeight - chat.scrollTop - chat.clientHeight < 90;
  const goBottom = (smooth = false) => chat.scrollTo({ top: chat.scrollHeight, behavior: smooth ? "smooth" : "instant" });
  const updateLast = () => { last.hidden = nearBottom() || chat.scrollHeight <= chat.clientHeight; };
  chat.addEventListener("scroll", updateLast, { passive: true });
  last.addEventListener("click", () => { goBottom(true); last.hidden = true; });
  tools.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    tools.setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      panel.hidden = true;
      tools.setAttribute("aria-expanded", "false");
      tools.focus();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  const text = (tag, value, className) => {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  };
  const article = (role, value, className = "") => {
    const node = document.createElement("article");
    node.className = `message ${role === "user" ? "user" : ""} ${className}`;
    node.append(text("b", role === "user" ? (fr ? "TOI" : "YOU") : "CANADA 360"));
    node.append(text("p", value));
    chat.append(node);
    return node;
  };
  const addSources = (node, links) => {
    const valid = (links || []).filter((link) => {
      try { return new URL(link.url).protocol === "https:"; } catch { return false; }
    });
    if (!valid.length) return;
    const details = document.createElement("details");
    details.className = "sources";
    details.append(text("summary", `${fr ? "Sources officielles" : "Official sources"} (${valid.length})`));
    const list = text("div", "", "links");
    for (const [index, link] of valid.entries()) {
      const a = document.createElement("a");
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.append(text("span", `[${index + 1}] ${link.agency || link.level || "Source"} · ${link.jurisdiction || "CA"}`));
      a.append(text("strong", link.label || link.url));
      a.append(text("small", link.url));
      if (link.updated_at) a.append(text("small", `${fr ? "Période / mise à jour" : "Period / update"}: ${link.updated_at}`));
      list.append(a);
    }
    details.append(list);
    node.append(details);
  };
  const addFeedback = (node, turn, index, conversationId) => {
    const feedback = document.createElement("form");
    feedback.className = "feedback";
    feedback.method = "post";
    feedback.action = "/api/canada-assistant";
    for (const [name, value] of Object.entries({
      action: "feedback", conversation_id: conversationId, turn_index: index,
      lang: form.elements.lang.value, jurisdiction: form.elements.jurisdiction.value,
    })) {
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = name;
      field.value = value;
      feedback.append(field);
    }
    feedback.append(text("span", fr ? "Utile ?" : "Helpful?"));
    for (const [rating, label, symbol] of [
      ["up", fr ? "Réponse utile" : "Helpful answer", "👍"],
      ["down", fr ? "Réponse inutile" : "Unhelpful answer", "👎"],
    ]) {
      const button = text("button", symbol);
      button.type = "submit";
      button.name = "rating";
      button.value = rating;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(turn.feedback === rating));
      feedback.append(button);
    }
    node.append(feedback);
  };
  const renderTurns = (turns, conversationId) => {
    chat.replaceChildren();
    turns.forEach((turn, index) => {
      const node = article(turn.role, turn.text || "");
      if (turn.role === "assistant") {
        addSources(node, turn.links);
        if (turn.source_line) node.append(text("small", turn.source_line));
        const speak = text("button", fr ? "Écouter la réponse" : "Listen to answer", "speak");
        speak.type = "button";
        speak.dataset.voiceSpeak = "";
        speak.hidden = !("speechSynthesis" in window);
        node.append(speak);
        addFeedback(node, turn, index, conversationId);
      }
    });
  };
  const renderMemory = (profile) => {
    if (!profile) return;
    const values = [profile.age != null ? `${profile.age} ${fr ? "ans" : "years old"}` : null,
      profile.family_status, profile.employment_status,
      profile.children != null ? `${profile.children} ${fr ? "enfant(s)" : "child(ren)"}` : null,
      profile.province].filter(Boolean);
    memory.replaceChildren();
    if (!values.length) return;
    const box = text("div", "", "memory");
    box.dataset.testid = "canada360-conversation-memory";
    box.append(text("span", fr ? "Contexte retenu pour cette conversation" : "Context kept for this conversation"));
    box.append(text("strong", values.join(" · ")));
    memory.append(box);
  };
  const showError = (pending, message, work) => {
    pending.classList.remove("pending");
    pending.classList.add("error");
    pending.querySelector("p").textContent = message;
    const button = text("button", fr ? "Réessayer" : "Retry");
    button.type = "button";
    button.addEventListener("click", () => {
      pending.remove();
      retry = work;
      form.requestSubmit();
    });
    pending.append(button);
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const work = retry || { question: input.value.trim(), body: new FormData(form) };
    retry = null;
    const pdf = work.body.get("pdf");
    if (!work.question && !(pdf instanceof File && pdf.size)) return;
    if (pdf instanceof File && pdf.size && work.body.get("document_consent") !== "on") {
      article("assistant", fr ? "Confirme l’avertissement sur les données sensibles avant de joindre le PDF." : "Confirm the sensitive-data notice before attaching the PDF.", "error");
      goBottom();
      return;
    }
    work.body.set("q", work.question);
    if (!work.question) work.question = fr ? "Explique-moi ce document officiel." : "Explain this official document.";
    busy = true;
    send.disabled = true;
    const hadRetry = Boolean(work.optimistic);
    if (!hadRetry) {
      article("user", work.question);
      work.optimistic = true;
    }
    hero.hidden = true;
    shell.classList.remove("empty");
    chat.hidden = false;
    composer.classList.remove("empty");
    input.value = "";
    input.style.height = "auto";
    const pending = article("assistant", fr ? "Canada 360 prépare la réponse…" : "Canada 360 is preparing an answer…", "pending");
    pending.setAttribute("aria-live", "polite");
    pending.querySelector("p").classList.add("dots");
    goBottom();
    const stage2 = setTimeout(() => { pending.querySelector("p").textContent = fr ? "Consultation des sources officielles…" : "Checking official sources…"; }, 2000);
    const stage3 = setTimeout(() => { pending.querySelector("p").textContent = fr ? "Vérification de la réponse…" : "Checking the answer…"; }, 6000);
    try {
      const response = await fetch(form.getAttribute("action"), { method: "POST", body: work.body, headers: { Accept: "application/json" }, credentials: "same-origin" });
      if (!response.ok) throw new Error("upstream");
      const result = await response.json();
      if (result.failed || result.upload_error) throw new Error(result.upload_error || "upstream");
      const shouldFollow = nearBottom();
      const oldTop = chat.scrollTop;
      form.elements.conversation_id.value = result.conversation_id;
      renderTurns(result.turns, result.conversation_id);
      renderMemory(result.profile);
      form.elements.pdf.value = "";
      if (shouldFollow) goBottom(); else chat.scrollTop = oldTop;
      updateLast();
    } catch (error) {
      showError(pending, error.message !== "upstream" && error.message !== "Failed to fetch" ? error.message :
        (fr ? "La réponse est momentanément indisponible. Réessaie." : "The answer is temporarily unavailable. Try again."), work);
      updateLast();
    } finally {
      clearTimeout(stage2);
      clearTimeout(stage3);
      busy = false;
      send.disabled = false;
      input.focus({ preventScroll: true });
    }
  });
  goBottom();
  updateLast();
})();

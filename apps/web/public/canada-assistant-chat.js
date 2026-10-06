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
  let authorizedPositions = [];
  const skillLabels = { canada360: "Canada 360", portfolio_analysis: fr ? "Portefeuille" : "Portfolio",
    stock_analysis: "Focus", etf_analysis: "ETF", compare: fr ? "Comparateur" : "Compare",
    market_analysis: fr ? "Marché" : "Market", news_context: fr ? "Actualités" : "News",
    data_quality: fr ? "Qualité des données" : "Data quality" };
  const safeAction = /^\/(?:focus\/[A-Z0-9.^-]{1,15}|etf(?:\/[A-Z0-9.^-]{1,15})?|portefeuille|comparateur(?:\?symbols=[A-Z0-9.^,-]{1,80})?|actualites|canada|terminal|screener|assistant|qualite)$/;
  const portfolioCue = /portefeuille|positions|allocation|r[eé]partition|concentration|chevauch|overlap|(?:mon|mes|my).{0,30}risqu|my portfolio|my positions/i;
  const explicitSwitch = /gouvernement|province|canada 360|qu[eé]bec|ontario|alberta|passeport|statistique|march[eé]|market|terminal|actualit[eé]|news|\b(?:SHOP|XIC|LSPD)\b|\b(?:analyse|cours|prix|compare)\b/i;
  const readTurns = () => { try { return JSON.parse(form.elements.history.value || "[]"); } catch { return []; } };
  const portfolioFor = (question) => {
    if (!authorizedPositions.length) return [];
    const lastSkill = [...readTurns()].reverse().find((turn) => turn.role === "assistant")?.skill;
    return portfolioCue.test(question) || lastSkill === "portfolio_analysis" && !explicitSwitch.test(question)
      ? authorizedPositions : [];
  };
  const requestPortfolio = () => new Promise((resolve) => {
    if (window.parent === window) { resolve([]); return; }
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { window.removeEventListener("message", onMessage); resolve([]); }, 5000);
    const onMessage = (event) => {
      if (event.origin !== location.origin || event.source !== window.parent ||
          event.data?.type !== "anatole:portfolio-response" || event.data.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(Array.isArray(event.data.positions) ? event.data.positions.slice(0, 30) : []);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "anatole:portfolio-request", id }, location.origin);
  });
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
    node.append(text("b", role === "user" ? (fr ? "TOI" : "YOU") : "ANATOLE"));
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
  const addUnifiedEvidence = (node, turn) => {
    const sources = (turn.evidence || []).flatMap((row) => row.sources || []);
    const missing = (turn.evidence || []).flatMap((row) => row.missing_data || []);
    const limitations = (turn.evidence || []).flatMap((row) => row.limitations || []);
    if (sources.length || missing.length || limitations.length) {
      const details = text("details", "", "sources");
      details.append(text("summary", fr ? "Sources et données utilisées" : "Sources and data used"));
      const list = text("div", "", "links");
      for (const source of sources) {
        const label = `${source.label} · ${source.freshness || "unknown"}${source.timestamp ? ` · ${new Date(source.timestamp).toLocaleDateString(fr ? "fr-CA" : "en-CA")}` : ""}`;
        const href = source.url;
        if (href && /^https:\/\//i.test(href)) {
          const link = text("a", label);
          link.href = href; link.target = "_blank"; link.rel = "noreferrer"; list.append(link);
        } else list.append(text("span", label));
      }
      for (const item of missing) list.append(text("span", `${fr ? "Donnée manquante" : "Missing data"} · ${item}`));
      for (const item of limitations) list.append(text("span", item));
      details.append(list); node.append(details);
    }
    for (const action of turn.actions || []) {
      if (!safeAction.test(action.href)) continue;
      const link = text("a", `${action.label} →`, "assistantAction");
      link.href = action.href; link.target = "_parent"; node.append(link);
    }
  };
  const addFeedback = (node, turn, index, conversationId, unified = false) => {
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
    if (unified) feedback.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.submitter;
      if (!button) return;
      const body = new FormData(feedback);
      body.set("rating", button.value);
      try {
        const response = await fetch(feedback.getAttribute("action"), { method: "POST", body, credentials: "same-origin", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("feedback");
        feedback.querySelectorAll('button[name="rating"]').forEach((item) =>
          item.setAttribute("aria-pressed", String(item.value === button.value)));
      } catch { feedback.append(text("span", fr ? "Avis indisponible" : "Feedback unavailable")); }
    });
    node.append(feedback);
  };
  const renderTurns = (turns, conversationId) => {
    chat.replaceChildren();
    turns.forEach((turn, index) => {
      const node = article(turn.role, turn.text || "");
      if (turn.role === "assistant") {
        if (turn.skill) node.insertBefore(text("small", skillLabels[turn.skill] || turn.skill, "skillChip"), node.querySelector("p"));
        if (turn.evidence) addUnifiedEvidence(node, turn);
        else addSources(node, turn.links);
        if (turn.source_line) node.append(text("small", turn.source_line));
        const speak = text("button", fr ? "Écouter la réponse" : "Listen to answer", "speak");
        speak.type = "button";
        speak.dataset.voiceSpeak = "";
        speak.hidden = !("speechSynthesis" in window);
        node.append(speak);
        if (turn.government_feedback?.conversation_id && Number.isInteger(turn.government_feedback.turn_index)) {
          addFeedback(node, turn, turn.government_feedback.turn_index, turn.government_feedback.conversation_id, true);
        } else if (!turn.skill) addFeedback(node, turn, index, conversationId);
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
  const showPermission = (question, work) => {
    const box = text("div", "", "permission");
    box.setAttribute("role", "group");
    box.setAttribute("aria-live", "polite");
    box.append(text("strong", fr ? "Autoriser Anatole Assistant à analyser les positions de ce portefeuille pour cette conversation ?" : "Allow Anatole Assistant to analyze this portfolio's positions for this conversation?"));
    const allow = text("button", fr ? "Autoriser pour cette conversation" : "Allow for this conversation");
    allow.type = "button";
    allow.addEventListener("click", async () => {
      allow.disabled = true;
      authorizedPositions = await requestPortfolio();
      if (!authorizedPositions.length) {
        box.append(text("p", fr ? "Aucune position locale valide à analyser." : "No valid local positions to analyze."));
        allow.disabled = false; return;
      }
      box.remove();
      work.body.set("history", form.elements.history.value);
      work.body.set("conversation_id", form.elements.conversation_id.value);
      work.body.set("resume", "on");
      work.body.set("portfolio_consent", "on");
      work.body.set("portfolio_positions", JSON.stringify(authorizedPositions));
      retry = work;
      form.requestSubmit();
    });
    const decline = text("button", fr ? "Pas maintenant" : "Not now");
    decline.type = "button";
    decline.addEventListener("click", () => {
      box.remove();
      const turns = readTurns();
      turns.push({ role: "assistant", text: fr ? "Sans accès aux positions, je peux expliquer les risques généraux, mais pas ceux de votre portefeuille." : "Without positions, I can explain general risks, but not those of your portfolio.", links: [], source_line: null });
      form.elements.history.value = JSON.stringify(turns.slice(-20));
      renderTurns(turns, form.elements.conversation_id.value);
      goBottom();
    });
    box.append(allow, decline);
    chat.append(box); goBottom();
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
    if (!retry && !work.body.get("resume")) {
      const positions = portfolioFor(work.question);
      work.body.set("portfolio_consent", positions.length ? "on" : "");
      work.body.set("portfolio_positions", JSON.stringify(positions));
    }
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
    const pending = article("assistant", fr ? "Anatole prépare la réponse…" : "Anatole is preparing an answer…", "pending");
    pending.setAttribute("aria-live", "polite");
    pending.querySelector("p").classList.add("dots");
    goBottom();
    const stage2 = setTimeout(() => { pending.querySelector("p").textContent = fr ? "Consultation des données et sources…" : "Checking data and sources…"; }, 2000);
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
      form.elements.history.value = JSON.stringify(result.turns.slice(-20));
      const governmentTurn = [...result.turns].reverse().find((turn) => turn.government_feedback?.conversation_id);
      if (governmentTurn) form.elements.government_conversation_id.value = governmentTurn.government_feedback.conversation_id;
      form.elements.resume.value = "";
      form.elements.portfolio_consent.value = "";
      form.elements.portfolio_positions.value = "";
      renderMemory(result.profile);
      if (result.permission_required) showPermission(work.question, work);
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

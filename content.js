(() => {
  "use strict";
  if (globalThis.__voiceHotkeysLoaded) return;
  globalThis.__voiceHotkeysLoaded = true;

  const { DEFAULTS, fromEvent } = globalThis.VoiceHotkeys;
  const MIC = [
    'button[aria-label="Start dictation"]',
    'button[aria-label="Dictate button"]',
    'button[aria-label="Dictate"]',
    'button[title="Start dictation"]',
    'button[aria-label="Dikte"]',
    'button[aria-label="Dikteyi başlat"]',
    'button[aria-label="Sesli yaz"]',
    'button[aria-label="Ses kaydını başlat"]',
    'button[aria-label="Mikrofon"]',
    'button[aria-label="Mikrofonu aç"]',
    'button[aria-label="Sesli giriş"]',
    'button[aria-label="Sesle yaz"]',
    'button[title="Dikte et"]',
    'button[title="Mikrofon"]',
    'button[data-testid="composer-dictate-button"]',
    'button[data-testid="composer-microphone-button"]',
    'button[data-testid="composer-speech-button"]'
  ];
  const SUBMIT_VOICE = [
    'button[aria-label="Submit dictation"]',
    'button[aria-label="Transcribe and send"]',
    'button[aria-label="Send dictated message"]',
    'button[aria-label="Accept dictation"]',
    'button[aria-label="Confirm dictation"]',
    'button[aria-label="Dikteyi onayla"]',
    'button[aria-label="Dikteyi gönder"]',
    'button[title="Submit dictation"]'
  ];
  const STOP = [
    'button[aria-label="Stop recording"]',
    'button[aria-label="Stop dictation"]',
    'button[aria-label="Stop Dictation"]',
    'button[aria-label="Kaydı durdur"]',
    'button[aria-label="Ses kaydını durdur"]',
    'button[aria-label="Dikteyi durdur"]',
    'button[title="Stop recording"]'
  ];
  const VOICE_STATE = [
    ...SUBMIT_VOICE,
    ...STOP,
    'button[aria-label="Cancel dictation"]',
    'button[aria-label="Dikteyi iptal et"]'
  ];
  const SEND = [
    'button[data-testid="send-button"]',
    '#composer-submit-button',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Send"]',
    'button[aria-label="Gönder"]',
    'button.composer-submit-btn'
  ];
  const EDITOR = [
    '#prompt-textarea',
    'form[data-chatgpt-composer] .ProseMirror[contenteditable="true"]',
    'form[data-type="unified-composer"] [contenteditable="true"]',
    'textarea[data-testid="textbox"]',
    '[contenteditable="true"][role="textbox"]'
  ];

  let shortcuts = { ...DEFAULTS };
  // No asynchronous send queue: a hotkey performs exactly one click.
  let lastActionAt = 0;
  let lastToast = null;

  const getElement = (selectors) => {
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (isUsable(el)) return el;
      }
    }
    return null;
  };

  function isUsable(el) {
    if (!el || !el.isConnected || el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    if (el.getClientRects().length === 0) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  // The dictation control is not consistently labelled across ChatGPT UI
  // releases/locales. Prefer semantic selectors, then a *strictly scoped*
  // layout fallback: icon button immediately left of a verified Voice Mode
  // button. Avoid guessing when the composer does not have this geometry.
  function composerRoot() {
    const editor = getElement(EDITOR);
    if (editor) {
      const form = editor.closest("form");
      if (form) return form;
    }
    return document.querySelector('form[data-chatgpt-composer], form[data-type="unified-composer"]');
  }

  function nameFor(button) {
    const own = ["aria-label", "title", "data-testid"]
      .map(attr => button.getAttribute(attr) || "").join(" ");
    const labelledBy = (button.getAttribute("aria-labelledby") || "")
      .split(/\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.textContent || "").join(" ");
    return `${own} ${labelledBy}`.toLocaleLowerCase();
  }

  function isVoiceMode(button) {
    const name = nameFor(button);
    return /voice.mode|start.voice|sesli.sohbet|sesli.mod|sesli.görüşme|sesli.gorusme|konuşma.mod|konusma.mod/.test(name)
      && !/dictat|dikte|microphone|mikrofon|record|kayıt|kayit/.test(name);
  }

  function looksBlue(button) {
    // Used only to *locate the known, rightmost blue voice-chat control*.
    for (const el of [button, button.firstElementChild]) {
      if (!(el instanceof Element)) continue;
      const parts = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/)?.[1]
        .split(",").map(s => Number.parseFloat(s));
      if (!parts || parts.length < 3) continue;
      const [r, g, b, a = 1] = parts;
      if (a > .75 && b > 110 && b > r * 1.25 && b > g * 1.12) return true;
    }
    return false;
  }

  function findMic() {
    const composer = composerRoot();
    // Prefer labelled microphone buttons *inside the composer*.
    if (!composer) return null;
    for (const selector of MIC) {
      for (const button of composer.querySelectorAll(selector)) {
        if (isUsable(button)) return button;
      }
    }
    // Loose label matches are limited to *start* semantics; never touch
    // dictation submit/cancel/stop or the live conversation-mode button.
    const buttons = [...composer.querySelectorAll("button")].filter(isUsable);
    const labelled = buttons.filter(button => {
      const name = nameFor(button);
      return /dictat|dikte|microphone|mikrofon|sesli.yaz|sesli.giriş|sesli.giris/.test(name)
        && !/stop|submit|send|cancel|confirm|accept|onay|gönder|gonder|dur|iptal|voice.mode/.test(name);
    });
    if (labelled.length === 1) return labelled[0];
    if (labelled.length > 1) return null;

    // Screenshot-confirmed UI: small mic icon directly before round blue
    // voice-chat button, both at far right of composer. A lone unlabelled
    // button is NOT sufficient evidence, so ambiguities fail closed.
    const iconButtons = buttons.filter(button => {
      const rect = button.getBoundingClientRect();
      return rect.width > 16 && rect.width <= 64 && rect.height > 16 && rect.height <= 64
        && !!button.querySelector("svg");
    });
    const voices = iconButtons.filter(isVoiceMode);
    let voice;
    if (voices.length === 1) voice = voices[0];
    else if (voices.length === 0) {
      const blue = iconButtons.filter(looksBlue);
      if (blue.length !== 1) return null;
      voice = blue[0];
    } else return null;

    const vr = voice.getBoundingClientRect();
    const vx = vr.left + vr.width / 2;
    const vy = vr.top + vr.height / 2;
    // Require the Voice Mode control to be the rightmost icon control.
    if (iconButtons.some(button => button !== voice &&
      button.getBoundingClientRect().left > vr.right + 4)) return null;
    const adjacent = iconButtons.filter(button => {
      if (button === voice) return false;
      const r = button.getBoundingClientRect();
      const dx = vx - (r.left + r.width / 2);
      const dy = vy - (r.top + r.height / 2);
      return dx >= 25 && dx <= 78 && Math.abs(dy) <= 13;
    });
    return adjacent.length === 1 ? adjacent[0] : null;
  }

  function click(el) {
    if (!isUsable(el)) return false;
    // Native click is sufficient for normal React buttons. An extension cannot create isTrusted events.
    el.click();
    return true;
  }

  function getComposerText() {
    const el = getElement(EDITOR);
    if (!el) return "";
    return ("value" in el ? el.value : el.innerText || el.textContent || "")
      .replace(/\u00a0/g, " ").trim();
  }

  // Distinguish a recording control from a generic editor submit control.
  // The recorder has a stop *square* immediately left of a blue send arrow.
  function hasStopSquare(button) {
    const svg = button.querySelector("svg");
    if (!svg) return false;
    const descriptive = [button.getAttribute("data-testid"), svg.getAttribute("class"),
      svg.getAttribute("data-lucide"), svg.getAttribute("aria-label")].filter(Boolean).join(" ").toLowerCase();
    if (/stop.record|stop.dictat|square|stop-circle/.test(descriptive)) return true;
    for (const rect of svg.querySelectorAll("rect")) {
      const w = Number(rect.getAttribute("width"));
      const h = Number(rect.getAttribute("height"));
      if (w >= 6 && h >= 6 && Math.abs(w - h) <= 2 && w <= 20) return true;
    }
    for (const path of svg.querySelectorAll("path")) {
      const d = (path.getAttribute("d") || "").replace(/\s+/g, "");
      // Standard solid-square paths; do not match the crossed paths of X icons.
      if (/^M[0-9.]+[ ,][0-9.]+[hvHV][^zZ]+[zZ]$/.test(d) &&
          !/[cCsSqQtTaA]/.test(d)) return true;
    }
    return false;
  }

  function nearbyStop(blueButton, buttons) {
    const br = blueButton.getBoundingClientRect();
    const bx = br.left + br.width / 2;
    const by = br.top + br.height / 2;
    const candidates = buttons.filter(btn => {
      if (btn === blueButton || !hasStopSquare(btn)) return false;
      const r = btn.getBoundingClientRect();
      const dx = bx - (r.left + r.width / 2);
      const dy = by - (r.top + r.height / 2);
      return dx >= 24 && dx <= 82 && Math.abs(dy) <= 18 &&
        r.width >= 18 && r.width <= 64 && r.height >= 18 && r.height <= 64;
    });
    return candidates.length === 1 ? candidates[0] : null;
  }

  // The recorder's right-hand blue arrow is often *unlabelled*, even when
  // the stop button immediately beside it has an accessible name. v0.1.2
  // returned early on a labelled stop and therefore never searched for the
  // arrow. Identify the pair spatially, without clicking the stop for Alt+X.
  function submitBesideStop(stop, buttons) {
    const sr = stop.getBoundingClientRect();
    const sx = sr.left + sr.width / 2;
    const sy = sr.top + sr.height / 2;
    const candidates = buttons.filter(button => {
      if (button === stop || !button.querySelector("svg")) return false;
      const label = nameFor(button);
      if (/stop|dur(dur|durma)?|cancel|iptal|mic(rophone)?|mikrofon|voice.mode|sesli.sohbet/.test(label)) return false;
      const r = button.getBoundingClientRect();
      const dx = (r.left + r.width / 2) - sx;
      const dy = (r.top + r.height / 2) - sy;
      return dx >= 24 && dx <= 82 && Math.abs(dy) <= 18 &&
        r.width >= 24 && r.width <= 64 && r.height >= 24 && r.height <= 64 &&
        looksBlue(button);
    });
    // Never infer the target if several blue buttons could match.
    return candidates.length === 1 ? candidates[0] : null;
  }

  function recordingControls() {
    const labelledStop = getElement(STOP);
    const labelledSubmit = getElement(SUBMIT_VOICE);
    const buttons = [...document.querySelectorAll("button")].filter(isUsable);

    // Crucial: even if one control has a label, resolve the *other* control.
    // Previous versions skipped this inference and Alt+X failed mid-recording.
    if (labelledStop) {
      return {
        active: true,
        stop: labelledStop,
        submit: labelledSubmit || submitBesideStop(labelledStop, buttons)
      };
    }
    if (labelledSubmit) {
      return { active: true, stop: nearbyStop(labelledSubmit, buttons), submit: labelledSubmit };
    }

    // Strict visual fallback for ChatGPT versions with unlabelled controls.
    // Never mistake the ordinary microphone beside Voice Mode for a recorder:
    // its glyph is a microphone, not a solid stop square.
    const blueButtons = buttons.filter(button => {
      const r = button.getBoundingClientRect();
      return r.width >= 24 && r.width <= 64 && r.height >= 24 && r.height <= 64
        && looksBlue(button) && !!button.querySelector("svg");
    });
    const pairs = blueButtons.map(submit => ({ submit, stop: nearbyStop(submit, buttons) }))
      .filter(pair => !!pair.stop && submitBesideStop(pair.stop, buttons) === pair.submit);
    if (pairs.length !== 1) return { active: false, stop: null, submit: null };
    return { active: true, ...pairs[0] };
  }

  function findStop(controls) {
    if (controls.stop) return controls.stop;
    const voiceSubmit = controls.submit;
    if (!voiceSubmit) return null;
    const sendRect = voiceSubmit.getBoundingClientRect();
    const sy = sendRect.top + sendRect.height / 2;
    const sx = sendRect.left + sendRect.width / 2;
    const buttons = [...document.querySelectorAll("button")].filter(b => b !== voiceSubmit && isUsable(b));
    const candidates = buttons.filter(button => {
      const label = nameFor(button);
      if (/cancel|iptal|close|kapat|send|gönder|submit|accept|confirm|microphone|dictate|sesli|start|voice/.test(label)) return false;
      const r = button.getBoundingClientRect();
      const dx = sx - (r.left + r.width / 2);
      const dy = sy - (r.top + r.height / 2);
      return dx >= 24 && dx <= 82 && Math.abs(dy) <= 18 && r.width <= 64 && r.height <= 64;
    });
    // Only click an unlabelled stop if the button is unambiguously nearby.
    return candidates.length === 1 ? candidates[0] : null;
  }

  function toast(message, error = false) {
    lastToast?.remove();
    const box = document.createElement("div");
    box.setAttribute("role", "status");
    box.textContent = `Voice Hotkeys · ${message}`;
    Object.assign(box.style, {
      position: "fixed", zIndex: "2147483647", bottom: "96px", right: "22px",
      padding: "10px 14px", borderRadius: "10px", fontFamily: "system-ui,sans-serif",
      fontSize: "12px", lineHeight: "1.4", color: "#fff",
      background: error ? "#963f3f" : "#244c3e", border: "1px solid #ffffff25",
      boxShadow: "0 8px 30px #0005", pointerEvents: "none", maxWidth: "310px"
    });
    (document.body || document.documentElement).appendChild(box);
    lastToast = box;
    setTimeout(() => { if (lastToast === box) lastToast = null; box.remove(); }, 2600);
  }

  function toggleRecording() {
    const controls = recordingControls();
    if (controls.active) {
      const stop = findStop(controls);
      if (stop && click(stop)) {
        toast("Recording stopped. Press Alt+X when the text is ready.");
      } else {
        toast("Stop button not found. No action taken.", true);
      }
      return;
    }
    const mic = findMic();
    if (!mic) {
      toast("Microphone not found. ChatGPT may be processing the recording.", true);
      return;
    }
    if (click(mic)) toast("Opening microphone…");
  }

  function sendMessage() {
    const controls = recordingControls();
    if (controls.active) {
      // Clicking ChatGPT's BLUE dictation submit arrow is the *only* action.
      // Do not click the stop-square; do not queue a second click after transcription.
      if (controls.submit && click(controls.submit)) {
        toast("Pressed the blue voice message send button.");
      } else {
        toast("Voice recording send button not found. No action taken.", true);
      }
      return;
    }
    // The voice UI is gone: only send an already completed, visible message.
    // No waiting/polling: a later manual stop must NEVER trigger a past Alt+X.
    if (!getComposerText()) {
      toast("No message is ready to send.", true);
      return;
    }
    const button = getElement(SEND);
    if (!button || !click(button)) {
      toast("Send button not found.", true);
      return;
    }
    toast("Pressed the send button.");
  }

  window.addEventListener("keydown", event => {
    if (event.repeat || event.defaultPrevented || event.isComposing) return;
    const combo = fromEvent(event);
    if (!combo) return;
    let command = null;
    if (combo === shortcuts.toggle) command = "toggle";
    else if (combo === shortcuts.send) command = "send";
    if (!command) return;
    // Prevent ChatGPT and browser page handlers where the browser allows it.
    event.preventDefault();
    event.stopImmediatePropagation();
    const now = Date.now();
    if (now - lastActionAt < 380) return;
    lastActionAt = now;
    if (command === "toggle") toggleRecording();
    else sendMessage();
  }, true);

  chrome.storage.sync.get("shortcuts").then(value => {
    if (!value.shortcuts || typeof value.shortcuts !== "object") return;
    for (const id of ["toggle", "send"]) {
      if (typeof value.shortcuts[id] === "string" && value.shortcuts[id]) shortcuts[id] = value.shortcuts[id];
    }
  }).catch(error => console.warn("[Voice Hotkeys] Settings unavailable", error));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.shortcuts) return;
    const candidate = changes.shortcuts.newValue;
    if (!candidate || typeof candidate !== "object") return;
    for (const id of ["toggle", "send"]) {
      shortcuts[id] = typeof candidate[id] === "string" && candidate[id] ? candidate[id] : DEFAULTS[id];
    }
  });
})();

(() => {
  "use strict";
  const { DEFAULTS, fromEvent, label } = globalThis.VoiceHotkeys;
  const ids = ["toggle", "send"];
  const buttons = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const message = document.getElementById("message");
  let shortcuts = { ...DEFAULTS };
  let capturing = null;
  let saving = false;

  function announce(text, kind = "") {
    message.textContent = text;
    message.className = "status" + (kind ? ` ${kind}` : "");
  }

  function render() {
    for (const id of ids) {
      buttons[id].textContent = capturing === id ? "Press keys…" : label(shortcuts[id]);
      buttons[id].classList.toggle("capturing", capturing === id);
    }
  }

  async function persist(next) {
    saving = true;
    try {
      await chrome.storage.sync.set({ shortcuts: next });
      shortcuts = next;
      render();
      announce("Shortcuts saved.", "success");
    } catch (error) {
      announce("Could not save. Check browser permissions.", "error");
      console.error("[Voice Hotkeys]", error);
    } finally {
      saving = false;
    }
  }

  for (const id of ids) {
    buttons[id].addEventListener("click", () => {
      if (saving) return;
      capturing = id;
      render();
      announce("Press a new key combination. Esc to cancel.");
      buttons[id].focus();
    });
  }

  document.addEventListener("keydown", async event => {
    if (!capturing || saving) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      capturing = null;
      render();
      announce("Change canceled.");
      return;
    }
    const keyCombo = fromEvent(event);
    if (!keyCombo) {
      announce("Press Alt, Ctrl or Win/Cmd with a letter, number or function key.", "error");
      return;
    }
    const other = ids.find(id => id !== capturing);
    if (shortcuts[other] === keyCombo) {
      announce("This combination is already assigned to the other action.", "error");
      return;
    }
    const updated = { ...shortcuts, [capturing]: keyCombo };
    capturing = null;
    render();
    await persist(updated);
  }, true);

  document.getElementById("reset").addEventListener("click", async () => {
    capturing = null;
    render();
    if (!saving) await persist({ ...DEFAULTS });
  });

  (async () => {
    try {
      const saved = await chrome.storage.sync.get("shortcuts");
      const candidate = saved.shortcuts;
      if (candidate && typeof candidate === "object") {
        for (const id of ids) {
          if (typeof candidate[id] === "string" && candidate[id]) shortcuts[id] = candidate[id];
        }
      }
      render();
    } catch (error) {
      announce("Could not load settings. Using defaults.", "error");
    }
  })();
})();

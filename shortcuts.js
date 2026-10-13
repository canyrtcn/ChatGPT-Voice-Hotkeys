/* Pure shortcut parsing used by both popup and ChatGPT content script. */
(() => {
  "use strict";
  const DEFAULTS = Object.freeze({ toggle: "Alt+KeyZ", send: "Alt+KeyX" });

  function fromEvent(event) {
    if (event.isComposing || event.getModifierState?.("AltGraph")) return null;
    // Ctrl+Alt often means AltGr for international keyboard layouts.
    if (event.ctrlKey && event.altKey) return null;
    if (!(event.altKey || event.ctrlKey || event.metaKey)) return null;
    const code = event.code || "";
    const accepted = /^Key[A-Z]$|^Digit[0-9]$|^F(?:[1-9]|1[0-2])$/.test(code) ||
      ["Space", "Comma", "Period", "Slash", "Semicolon", "Backquote", "Minus", "Equal", "BracketLeft", "BracketRight"].includes(code);
    if (!accepted) return null;
    const mods = [];
    if (event.ctrlKey) mods.push("Ctrl");
    if (event.altKey) mods.push("Alt");
    if (event.shiftKey) mods.push("Shift");
    if (event.metaKey) mods.push("Meta");
    mods.push(code);
    return mods.join("+");
  }

  function label(combo) {
    if (typeof combo !== "string") return "—";
    return combo.split("+").map(part => {
      if (part.startsWith("Key")) return part.slice(3);
      if (part.startsWith("Digit")) return part.slice(5);
      if (part === "Meta") return "Win / Cmd";
      if (part === "Space") return "Space";
      const symbol = {Comma:",",Period:".",Slash:"/",Semicolon:";",Backquote:"`",Minus:"-",Equal:"=",BracketLeft:"[",BracketRight:"]"};
      return symbol[part] || part;
    }).join(" + ");
  }

  const api = Object.freeze({ DEFAULTS, fromEvent, label });
  // Shared script loaded both in extension page and on chatgpt.com (isolated world).
  globalThis.VoiceHotkeys = api;
})();

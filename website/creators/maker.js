/* Notification stills for /creators — no video editing, branding locked. */
(function () {
  var msg1 = document.getElementById("msg1");
  var msg2 = document.getElementById("msg2");
  var live1 = document.getElementById("live-msg-1");
  var live2 = document.getElementById("live-msg-2");
  var pngBtn = document.getElementById("export-png");
  var jpegBtn = document.getElementById("export-jpeg");
  if (!msg1 || !msg2 || !live1 || !live2) return;

  function sync() {
    live1.textContent = msg1.value.trim() || "…";
    live2.textContent = msg2.value.trim() || "…";
  }
  msg1.addEventListener("input", sync);
  msg2.addEventListener("input", sync);
  sync();

  var COLORS = {
    bg: "#F3E9DC",
    card: "#FAF3E7",
    ink: "#3B2E25",
    muted: "#8A7770",
    accent: "#B4553C",
    rule: "#E2D5C2",
  };

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function wrapLines(ctx, text, maxWidth) {
    var words = String(text).split(/\s+/).filter(Boolean);
    var lines = [];
    var line = "";
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 4);
  }

  function drawCard(ctx, x, y, w, body, time) {
    var pad = 18;
    var icon = 24;
    var gap = 12;
    ctx.font = "16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    var textMax = w - pad * 2 - icon - gap;
    var lines = wrapLines(ctx, body, textMax);
    var h = Math.max(78, pad + 14 + 8 + lines.length * 22 + pad);
    roundRect(ctx, x, y, w, h, 18);
    ctx.fillStyle = COLORS.card;
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();

    roundRect(ctx, x + pad, y + pad, icon, icon, 6);
    ctx.fillStyle = COLORS.accent;
    ctx.fill();
    ctx.fillStyle = COLORS.bg;
    ctx.font = "bold 15px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("F", x + pad + icon / 2, y + pad + icon / 2 + 1);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COLORS.ink;
    ctx.font = "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("Future Self", x + pad + icon + gap, y + pad + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "right";
    ctx.fillText(time, x + w - pad, y + pad + 12);

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.ink;
    ctx.font = "16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + pad + icon + gap, y + pad + 38 + i * 22);
    }
    return h;
  }

  function exportImage(kind) {
    var dpr = 2;
    var width = 390;
    var pad = 20;
    var inner = width - pad * 2;
    var measure = document.createElement("canvas").getContext("2d");
    if (!measure) return;
    var h1 = drawCard(measure, 0, 0, inner, msg1.value.trim() || "…", "Now");
    var h2 = drawCard(measure, 0, 0, inner, msg2.value.trim() || "…", "3h ago");
    var gap = 14;
    var height = pad + h1 + gap + h2 + pad;
    var canvas = document.createElement("canvas");
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    var y = pad;
    y += drawCard(ctx, pad, y, inner, msg1.value.trim() || "…", "Now") + gap;
    drawCard(ctx, pad, y, inner, msg2.value.trim() || "…", "3h ago");
    var mime = kind === "jpeg" ? "image/jpeg" : "image/png";
    var ext = kind === "jpeg" ? "jpg" : "png";
    var link = document.createElement("a");
    link.download = "future-self-notifications." + ext;
    link.href = canvas.toDataURL(mime, kind === "jpeg" ? 0.92 : undefined);
    link.click();
  }

  if (pngBtn) pngBtn.addEventListener("click", function () { exportImage("png"); });
  if (jpegBtn) jpegBtn.addEventListener("click", function () { exportImage("jpeg"); });
})();

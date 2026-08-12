const API_BASE = window.ATS_API_BASE || "http://localhost:8000";

const form = document.getElementById("ats-form");
const scanBtn = document.getElementById("scan-btn");
const scanStatus = document.getElementById("scan-status");
const scanOverlay = document.getElementById("scan-overlay");
const scanOverlayText = document.getElementById("scan-overlay-text");
const resultsSection = document.getElementById("results");
const errorBox = document.getElementById("error-box");
const errorText = document.getElementById("error-text");

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("resume-file");
const dropzoneLabel = document.getElementById("dropzone-label");
const resumeTextarea = document.getElementById("resume-text");
const modeButtons = document.querySelectorAll(".mode-btn");

let resumeMode = "file";

/* ---------- Resume input mode: upload vs paste ---------- */
modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    modeButtons.forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    resumeMode = btn.dataset.mode;
    const isFile = resumeMode === "file";
    dropzone.hidden = !isFile;
    resumeTextarea.hidden = isFile;
  });
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("is-drag");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-drag"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("is-drag");
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    updateDropzoneLabel();
  }
});
fileInput.addEventListener("change", updateDropzoneLabel);

function updateDropzoneLabel() {
  if (fileInput.files && fileInput.files[0]) {
    dropzoneLabel.textContent = fileInput.files[0].name;
  } else {
    dropzoneLabel.textContent = "Drag a PDF here, or click to browse";
  }
}

/* ---------- Scan overlay copy, cycled while waiting ---------- */
const scanMessages = [
  "Reading resume…",
  "Parsing job description…",
  "Matching keywords…",
  "Scoring ATS compatibility…",
];
let scanMessageTimer = null;

function startScanCopy() {
  let i = 0;
  scanOverlayText.textContent = scanMessages[0];
  scanMessageTimer = setInterval(() => {
    i = (i + 1) % scanMessages.length;
    scanOverlayText.textContent = scanMessages[i];
  }, 1400);
}
function stopScanCopy() {
  clearInterval(scanMessageTimer);
}

/* ---------- Submit ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.hidden = true;

  const jobDescription = document.getElementById("job-description").value.trim();
  if (!jobDescription) {
    showError("Add a job description before scanning.");
    return;
  }
  if (resumeMode === "file" && !fileInput.files.length) {
    showError("Upload a resume PDF, or switch to “Paste text”.");
    return;
  }
  if (resumeMode === "text" && !resumeTextarea.value.trim()) {
    showError("Paste your resume text before scanning.");
    return;
  }

  const formData = new FormData();
  formData.append("job_description", jobDescription);
  if (resumeMode === "file") {
    formData.append("resume_file", fileInput.files[0]);
  } else {
    formData.append("resume_text", resumeTextarea.value.trim());
  }

  scanBtn.disabled = true;
  scanStatus.textContent = "Scanning…";
  scanOverlay.hidden = false;
  resultsSection.hidden = true;
  startScanCopy();

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Something went wrong.");
    }
    renderResults(data);
    scanStatus.textContent = "Scan complete.";
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showError(err.message || "Couldn't reach the backend. Is it running?");
    scanStatus.textContent = "Two inputs required: resume + job description.";
  } finally {
    stopScanCopy();
    scanOverlay.hidden = true;
    scanBtn.disabled = false;
  }
});

function showError(message) {
  errorText.textContent = message;
  errorBox.hidden = false;
  errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------- Render ---------- */
function renderResults(data) {
  resultsSection.hidden = false;

  // Gauge
  const circumference = 2 * Math.PI * 70; // r=70
  const gaugeFill = document.getElementById("gauge-fill");
  const offset = circumference - (data.score / 100) * circumference;
  gaugeFill.style.strokeDasharray = circumference;
  gaugeFill.style.strokeDashoffset = circumference; // reset for transition
  gaugeFill.style.stroke = scoreColor(data.score);
  requestAnimationFrame(() => {
    gaugeFill.style.strokeDashoffset = offset;
  });
  animateNumber(document.getElementById("gauge-score"), data.score);

  document.getElementById("result-summary-text").textContent =
    data.summary || "";

  renderChips("matched-keywords", data.matched_keywords, "chip-match");
  renderChips("missing-keywords", data.missing_keywords, "chip-miss");
  document.getElementById("matched-count").textContent =
    (data.matched_keywords || []).length;
  document.getElementById("missing-count").textContent =
    (data.missing_keywords || []).length;

  const list = document.getElementById("suggestion-list");
  list.innerHTML = "";
  (data.suggestions || []).forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s;
    list.appendChild(li);
  });
}

function renderChips(containerId, items, chipClass) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  if (!items || !items.length) {
    const span = document.createElement("span");
    span.className = "chip-empty";
    span.textContent = "None found.";
    el.appendChild(span);
    return;
  }
  items.forEach((kw) => {
    const span = document.createElement("span");
    span.className = `chip ${chipClass}`;
    span.textContent = kw;
    el.appendChild(span);
  });
}

function scoreColor(score) {
  if (score >= 80) return "#46E39A";
  if (score >= 50) return "#F6B23D";
  return "#F65454";
}

function animateNumber(el, target) {
  let current = 0;
  const step = Math.max(1, Math.round(target / 30));
  const timer = setInterval(() => {
    current += step;
    if (current >= target) {
      current = target;
      clearInterval(timer);
    }
    el.textContent = current;
  }, 20);
}

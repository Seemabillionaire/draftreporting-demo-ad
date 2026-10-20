const MAX_RECORDING_MS = 10 * 60 * 1000;
const SILENCE_MS = 4000;
const SILENCE_RMS = 0.012;

const select = document.getElementById("mic-select");
const using = document.getElementById("mic-using");
const meter = document.getElementById("mic-meter");
const meterFill = document.getElementById("mic-meter-fill");
const button = document.getElementById("mic-button");
const againButton = document.getElementById("mic-again");
const status = document.getElementById("mic-status");
const warning = document.getElementById("mic-warning");
const error = document.getElementById("mic-error");
const playback = document.getElementById("mic-playback");
const transcriptBox = document.getElementById("transcript-box");
const transcriptInput = document.getElementById("transcript");

let initialized = false;
let recording = false;
let starting = false;
let stopping = false;
let transcribing = false;
let permissionBlocked = false;
let stream = null;
let audioContext = null;
let analyser = null;
let meterData = null;
let source = null;
let recorder = null;
let chunks = [];
let meterFrame = null;
let maxTimer = null;
let lastSoundAt = 0;
let silenceShown = false;
let playbackUrl = null;
let stopReason = "";
let deviceCount = 0;
let onTranscript = null;

function setStatus(message) {
  status.textContent = message;
}

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function clearError() {
  error.textContent = "";
  error.hidden = true;
}

function showWarning(message) {
  warning.textContent = message;
  warning.hidden = false;
}

function clearWarning() {
  warning.textContent = "";
  warning.hidden = true;
}

function updateUsing() {
  const option = select.options[select.selectedIndex];
  if (select.value === "" || !option) {
    using.textContent = "Using: no microphone chosen";
    return;
  }
  using.textContent = "Using: " + option.textContent;
}

function updateButtonState() {
  if (recording) {
    button.disabled = false;
    return;
  }
  button.disabled = select.value === "" || permissionBlocked || starting || transcribing || deviceCount === 0;
}

function listAudioInputs() {
  return navigator.mediaDevices.enumerateDevices().then((devices) => {
    return devices.filter((deviceItem) => deviceItem.kind === "audioinput");
  });
}

function populateDevices(devices) {
  const current = select.value;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a microphone";
  const options = [placeholder];

  devices.forEach((deviceItem, index) => {
    const option = document.createElement("option");
    option.value = deviceItem.deviceId;
    option.textContent = deviceItem.label || "Microphone " + (index + 1);
    options.push(option);
  });

  select.replaceChildren(...options);
  if (current !== "" && devices.some((deviceItem) => deviceItem.deviceId === current)) {
    select.value = current;
  } else {
    select.value = "";
  }

  deviceCount = devices.length;
  select.disabled = recording || starting || devices.length === 0;
  updateUsing();
  updateButtonState();

  if (devices.length === 0) {
    if (error.hidden) {
      showError("No microphone found. Connect a microphone and reload the page.");
    }
    setStatus("No microphone is available.");
  }
}

function showPermissionError() {
  permissionBlocked = true;
  showError(
    "Microphone permission is blocked. Click the lock icon in Chrome's address bar, allow the microphone, then reload the page."
  );
  setStatus("Microphone permission is blocked.");
  select.disabled = true;
  button.disabled = true;
}

function showNoMicrophone() {
  showError("No microphone found. Connect a microphone and reload the page.");
  setStatus("No microphone is available.");
  select.disabled = true;
  button.disabled = true;
}

function handleInitialMediaError(mediaError) {
  if (mediaError && (mediaError.name === "NotAllowedError" || mediaError.name === "SecurityError")) {
    showPermissionError();
    return;
  }
  if (mediaError && (mediaError.name === "NotFoundError" || mediaError.name === "DevicesNotFoundError")) {
    showNoMicrophone();
    return;
  }
  showError("The microphone could not be opened. Check the microphone and try again.");
  setStatus("The microphone could not be opened.");
  button.disabled = true;
}

async function refreshDevices(askPermission, checkDeviceLoss = false) {
  let devices;
  try {
    devices = await listAudioInputs();
  } catch (listError) {
    showError("The microphone list could not be read.");
    setStatus("The microphone list could not be read.");
    return;
  }

  const needsPermission =
    askPermission &&
    (devices.length === 0 || devices.some((deviceItem) => deviceItem.label === ""));

  if (needsPermission) {
    try {
      const temporary = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of temporary.getTracks()) track.stop();
    } catch (mediaError) {
      handleInitialMediaError(mediaError);
      return;
    }
    try {
      devices = await listAudioInputs();
    } catch (listError) {
      showError("The microphone list could not be read.");
      setStatus("The microphone list could not be read.");
      return;
    }
  }

  const selectedDevice = select.value;
  if (
    checkDeviceLoss &&
    recording &&
    selectedDevice !== "" &&
    !devices.some((deviceItem) => deviceItem.deviceId === selectedDevice)
  ) {
    stopRecording("disconnected");
  }

  if (askPermission) clearError();
  populateDevices(devices);
  if (askPermission && devices.length > 0) {
    setStatus("Choose a microphone, then press Start recording.");
  }
}

function releasePlayback() {
  playback.pause();
  if (playbackUrl !== null) {
    URL.revokeObjectURL(playbackUrl);
    playbackUrl = null;
  }
  playback.removeAttribute("src");
  playback.load();
  playback.hidden = true;
  againButton.hidden = true;
}

function measureLevel() {
  if (!recording || analyser === null || meterData === null) return;

  analyser.getByteTimeDomainData(meterData);
  let total = 0;
  for (const value of meterData) {
    const centred = (value - 128) / 128;
    total += centred * centred;
  }
  const rms = Math.sqrt(total / meterData.length);
  const level = Math.min(100, Math.round(rms * 700));
  meterFill.style.width = level + "%";
  meter.setAttribute("aria-valuenow", String(level));

  const now = performance.now();
  if (rms >= SILENCE_RMS) {
    lastSoundAt = now;
    if (silenceShown) {
      silenceShown = false;
      clearWarning();
    }
  } else if (!silenceShown && now - lastSoundAt >= SILENCE_MS) {
    silenceShown = true;
    showWarning("No sound heard, check the microphone.");
  }

  meterFrame = requestAnimationFrame(measureLevel);
}

function stopTracks() {
  if (stream !== null) {
    for (const track of stream.getTracks()) {
      track.onended = null;
      track.stop();
    }
    stream = null;
  }
}

function resetMeter() {
  if (meterFrame !== null) {
    cancelAnimationFrame(meterFrame);
    meterFrame = null;
  }
  meterFill.style.width = "0%";
  meter.setAttribute("aria-valuenow", "0");
}

function stripClosingPhrases(text) {
  return text
    .replace(
      /\bplease\s+(?:give\s+report|make\s+(?:a\s+)?report|draft\s+report)\b[\s.,!?]*/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

async function transcribeRecording(blob) {
  if (transcribing) return;
  if (blob.size > 4300000) {
    showError(
      "The recording is too large to send. Use the list below. Nothing in the list has been lost."
    );
    return;
  }

  transcribing = true;
  againButton.disabled = true;
  updateButtonState();
  setStatus("Transcribing the recording...");

  try {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob,
      signal: AbortSignal.timeout(140000)
    });
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }
    if (!response.ok) {
      const message =
        typeof data.error === "string"
          ? data.error.trim().replace(/[.\s]+$/, "")
          : "Speech to text failed. Use the list below";
      showError(message + ". Nothing in the list has been lost.");
      return;
    }
    const text = typeof data.transcript === "string" ? data.transcript.trim() : "";
    const cleaned = stripClosingPhrases(text);
    if (cleaned === "") {
      showError(
        "No dictation was found after the closing phrase. Use the list below. Nothing in the list has been lost."
      );
      return;
    }
    transcriptInput.value = cleaned;
    transcriptBox.hidden = false;
    clearError();
    setStatus("Transcript ready. You can edit it below.");
    if (typeof onTranscript === "function") {
      try {
        await onTranscript(cleaned);
      } catch (error) {
        showError("The report could not be drafted. Use the list below.");
      }
    }
  } catch (error) {
    const message =
      error && error.name === "TimeoutError"
        ? "Transcription timed out. Use the list below."
        : "The transcription service could not be reached. Use the list below.";
    showError(message + " Nothing in the list has been lost.");
  } finally {
    transcribing = false;
    againButton.disabled = false;
    updateButtonState();
  }
}

function finalizeRecording() {
  recording = false;
  starting = false;
  stopping = false;
  resetMeter();
  clearWarning();
  if (maxTimer !== null) {
    clearTimeout(maxTimer);
    maxTimer = null;
  }
  if (audioContext !== null) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  stopTracks();
  analyser = null;
  meterData = null;
  source = null;

  const type = recorder && recorder.mimeType ? recorder.mimeType : "audio/webm";
  const blob = chunks.length > 0 ? new Blob(chunks, { type }) : null;
  chunks = [];
  recorder = null;

  button.textContent = "Start recording";
  button.classList.remove("recording");
  select.disabled = deviceCount === 0;
  updateButtonState();

  if (blob !== null && blob.size > 0) {
    if (playbackUrl !== null) URL.revokeObjectURL(playbackUrl);
    playbackUrl = URL.createObjectURL(blob);
    playback.src = playbackUrl;
    playback.hidden = false;
    againButton.hidden = false;
    playback.load();
    if (stopReason === "max") {
      showError("Maximum recording length reached (10 minutes). Recording stopped.");
      setStatus("Recording stopped.");
    } else if (stopReason === "disconnected") {
      showError(
        "The microphone disconnected. Recording stopped. You can play back what was captured."
      );
      setStatus("Recording stopped.");
    } else if (stopReason === "error") {
      showError("Recording stopped because of a microphone error.");
      setStatus("Recording stopped.");
    } else {
      setStatus("Recording stopped. Play it back below.");
    }
  } else {
    againButton.hidden = false;
    if (stopReason === "max") {
      showError("Maximum recording length reached (10 minutes). Recording stopped.");
      setStatus("Recording stopped.");
    } else if (stopReason === "disconnected") {
      showError("The microphone disconnected. Recording stopped.");
      setStatus("Recording stopped.");
    } else if (stopReason === "error") {
      showError("Recording stopped because of a microphone error.");
      setStatus("Recording stopped.");
    } else {
      setStatus("Nothing was recorded.");
    }
  }

  if (blob !== null && blob.size > 0) {
    transcribeRecording(blob);
  }

  stopReason = "";
}

function stopRecording(reason) {
  if (!recording || stopping) return;
  stopping = true;
  stopReason = reason;
  button.disabled = true;
  if (maxTimer !== null) {
    clearTimeout(maxTimer);
    maxTimer = null;
  }
  if (recorder !== null && recorder.state !== "inactive") {
    try {
      recorder.stop();
      return;
    } catch (stopError) {
      finalizeRecording();
      return;
    }
  }
  finalizeRecording();
}

function handleStartError(mediaError) {
  starting = false;
  stopping = false;
  recording = false;
  resetMeter();
  stopTracks();
  if (audioContext !== null) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  analyser = null;
  meterData = null;
  source = null;
  recorder = null;
  chunks = [];
  button.textContent = "Start recording";
  button.classList.remove("recording");
  select.disabled = deviceCount === 0;
  updateButtonState();

  if (mediaError && (mediaError.name === "NotAllowedError" || mediaError.name === "SecurityError")) {
    showPermissionError();
    return;
  }
  if (
    mediaError &&
    (mediaError.name === "NotFoundError" ||
      mediaError.name === "DevicesNotFoundError" ||
      mediaError.name === "OverconstrainedError")
  ) {
    showError("That microphone is not available. Choose another microphone.");
    setStatus("Choose a microphone and try again.");
    refreshDevices(false).catch(() => {});
    return;
  }
  if (mediaError && mediaError.name === "NotReadableError") {
    showError("The microphone is busy or unavailable. Close other apps using it and try again.");
    setStatus("The microphone is busy.");
    return;
  }
  showError("The microphone could not be started. Check the microphone and try again.");
  setStatus("The microphone could not be started.");
}

async function startRecording() {
  if (recording || starting || transcribing) return;
  clearError();
  clearWarning();
  silenceShown = false;

  if (select.value === "") {
    showError("Choose a microphone first.");
    setStatus("Choose a microphone first.");
    select.focus();
    return;
  }
  if (permissionBlocked) {
    showPermissionError();
    return;
  }

  starting = true;
  stopping = false;
  button.disabled = true;
  select.disabled = true;
  releasePlayback();
  setStatus("Starting the microphone...");

  try {
    const selectedDevice = select.value;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: selectedDevice },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error("No audio track.");
    track.onended = () => {
      if (recording) stopRecording("disconnected");
    };

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    meterData = new Uint8Array(analyser.fftSize);
    source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const options = { audioBitsPerSecond: 32000 };
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      options.mimeType = "audio/webm;codecs=opus";
    }
    recorder = new MediaRecorder(stream, options);
    chunks = [];
    stopReason = "";
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("stop", finalizeRecording);
    recorder.addEventListener("error", () => {
      if (recording) {
        showError("Recording stopped because of a microphone error.");
        stopRecording("error");
      }
    });
    recorder.start(250);

    recording = true;
    starting = false;
    button.textContent = "Stop recording";
    button.classList.add("recording");
    button.disabled = false;
    select.disabled = true;
    lastSoundAt = performance.now();
    setStatus("Recording...");
    updateUsing();
    meterFrame = requestAnimationFrame(measureLevel);
    maxTimer = setTimeout(() => stopRecording("max"), MAX_RECORDING_MS);
  } catch (mediaError) {
    handleStartError(mediaError);
  }
}

function chooseDevice() {
  updateUsing();
  clearError();
  if (select.value === "") {
    setStatus("Choose a microphone, then press Start recording.");
  } else {
    setStatus("Ready to record.");
  }
  updateButtonState();
}

export async function initMicrophone(transcriptHandler) {
  if (initialized) return;
  initialized = true;
  onTranscript = typeof transcriptHandler === "function" ? transcriptHandler : null;

  button.addEventListener("click", () => {
    if (recording) stopRecording("user");
    else startRecording();
  });
  againButton.addEventListener("click", () => {
    if (!recording && !starting) startRecording();
  });
  select.addEventListener("change", chooseDevice);
  if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === "function") {
    navigator.mediaDevices.addEventListener("devicechange", () => {
      refreshDevices(false, true).catch(() => {});
    });
  }

  if (!window.isSecureContext) {
    showError("The microphone only works over HTTPS or localhost. Open the secure address.");
    setStatus("The microphone is not available on this address.");
    button.disabled = true;
    select.disabled = true;
    return;
  }
  if (
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function" ||
    typeof MediaRecorder === "undefined"
  ) {
    showError("This browser cannot record audio. Use Chrome.");
    setStatus("Recording is not supported in this browser.");
    button.disabled = true;
    select.disabled = true;
    return;
  }

  setStatus("Looking for microphones...");
  await refreshDevices(true);
}

window.addEventListener("pagehide", () => {
  if (recording) stopRecording("user");
  resetMeter();
  if (playbackUrl !== null) {
    URL.revokeObjectURL(playbackUrl);
    playbackUrl = null;
  }
});

import "./style.css";
import { FtarRenderer } from "./easy-renderer.js";
// import { FtarRenderer } from "flexatar-easy-renderer";

const canvas = document.getElementById("flexatarCanvas");
const statusElement = document.getElementById("status");
const startButton = document.getElementById("startButton");
const uploadButton = document.getElementById("uploadButton");
const stopButton = document.getElementById("stopButton");
const audioFileInput = document.getElementById("audioFileInput");

const engineFilesUrl = `${window.location.origin}/files`;
const renderer = new FtarRenderer(engineFilesUrl, canvas);

let microphoneStream;
let playbackStream;
let playbackAudio;
let fileAudioContext;
let fileSourceStream;
let fileAudioElement;
let fileAudioNode;
let fileObjectUrl;

function setStatus(message) {
  statusElement.textContent = message;
}

function stopPlayback() {
  if (playbackAudio) {
    playbackAudio.pause();
    playbackAudio.srcObject = null;
    playbackAudio.remove();
    playbackAudio = null;
  }

  if (playbackStream) {
    playbackStream.getTracks().forEach((track) => track.stop());
    playbackStream = null;
  }
}

function stopMicrophone() {
  if (microphoneStream) {
    microphoneStream.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
  }
}

async function stopFileAudio() {
  if (fileAudioElement) {
    fileAudioElement.pause();
    fileAudioElement.src = "";
    fileAudioElement.onended = null;
    fileAudioElement.onerror = null;
    fileAudioElement = null;
  }

  if (fileSourceStream) {
    fileSourceStream.getTracks().forEach((track) => track.stop());
    fileSourceStream = null;
  }

  if (fileAudioNode) {
    fileAudioNode.disconnect();
    fileAudioNode = null;
  }

  if (fileAudioContext) {
    if (fileAudioContext.state !== "closed") {
      await fileAudioContext.close();
    }
    fileAudioContext = null;
  }

  if (fileObjectUrl) {
    URL.revokeObjectURL(fileObjectUrl);
    fileObjectUrl = null;
  }
}

async function stopAllSources() {
  stopPlayback();
  stopMicrophone();
  await stopFileAudio();
}

function setRunningState(isRunning) {
  startButton.disabled = isRunning;
  uploadButton.disabled = isRunning;
  stopButton.disabled = !isRunning;
}

async function connectInputStream(stream, { enablePlayback = true } = {}) {
  stopPlayback();
  playbackStream = renderer.connectMediaStream(stream);

  if (!enablePlayback) {
    return;
  }

  playbackAudio = new Audio();
  playbackAudio.autoplay = true;
  playbackAudio.srcObject = playbackStream;
  playbackAudio.style.display = "none";
  document.body.append(playbackAudio);
}

async function startMicrophone() {
  await stopAllSources();
  microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  await connectInputStream(microphoneStream, { enablePlayback: true });
  setRunningState(true);
  setStatus("Microphone connected. Lip sync is running with about 450 ms delay.");
}

async function startAudioFile(file) {
  await stopAllSources();

  fileAudioContext = new AudioContext();
  const streamDestination = fileAudioContext.createMediaStreamDestination();
  fileAudioElement = new Audio();
  fileAudioElement.src = URL.createObjectURL(file);
  fileObjectUrl = fileAudioElement.src;
  fileAudioElement.preload = "auto";

  fileAudioNode = fileAudioContext.createMediaElementSource(fileAudioElement);
  fileAudioNode.connect(streamDestination);
  fileSourceStream = streamDestination.stream;

  await fileAudioContext.resume();
  await connectInputStream(fileSourceStream, { enablePlayback: true });

  fileAudioElement.onended = async () => {
    await stopAllSources();
    setRunningState(false);
    setStatus("Audio file finished.");
  };

  fileAudioElement.onerror = async () => {
    await stopAllSources();
    setRunningState(false);
    setStatus("Audio file error.");
  };

  await fileAudioElement.play();
  setRunningState(true);
  setStatus(`Audio file connected: ${file.name}. Lip sync is running with about 450 ms delay.`);
}

renderer.readyPromise.then(() => {
  renderer.size = { width: 320, height: 320 };
  renderer.slot1 = `${engineFilesUrl}/default_ftar.p`;

  renderer.background = `${engineFilesUrl}/backgrounds/1.jpg`;

  startButton.disabled = false;
  uploadButton.disabled = false;
  setStatus("Renderer ready. Lip sync will be visible with about 450 ms delay.");

  renderer.vCamStream.port.postMessage({ setLipState: [0.0, 0.0, 0.0, 0.0, 0.0] })
});

startButton.addEventListener("click", async () => {
  try {
    await startMicrophone();
  } catch (error) {
    console.error(error);
    await stopAllSources();
    setRunningState(false);
    setStatus(`Microphone error: ${error.message}`);
  }
});

uploadButton.addEventListener("click", () => {
  audioFileInput.click();
});

audioFileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files ?? [];
  audioFileInput.value = "";

  if (!file) {
    return;
  }

  try {
    await startAudioFile(file);
  } catch (error) {
    console.error(error);
    await stopAllSources();
    setRunningState(false);
    setStatus(`Audio file error: ${error.message}`);
  }
});

stopButton.addEventListener("click", async () => {
  await stopAllSources();
  setRunningState(false);
  setStatus("Stopped.");
});

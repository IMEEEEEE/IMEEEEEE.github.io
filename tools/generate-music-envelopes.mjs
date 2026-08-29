import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const assetsRoot = path.join(root, "assets");
const musicRoot = path.join(assetsRoot, "Music");
const outputPath = path.join(musicRoot, "music-envelopes.js");
const port = 4174;

const musicFiles = async () => {
  const folders = await fs.readdir(musicRoot, { withFileTypes: true });
  const files = [];
  for (const folder of folders.filter((entry) => entry.isDirectory())) {
    const folderPath = path.join(musicRoot, folder.name);
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    entries.filter((entry) => entry.isFile() && !entry.name.startsWith("._") && /\.mp3$/i.test(entry.name)).forEach((entry) => {
      files.push(`assets/Music/${folder.name}/${entry.name}`);
    });
  }
  return files.sort((a, b) => a.localeCompare(b));
};

const page = `<!doctype html>
<meta charset="utf-8">
<title>Music envelope generator</title>
<style>body{max-width:720px;margin:48px auto;font:16px/1.5 system-ui}button{padding:10px 16px}pre{white-space:pre-wrap}</style>
<h1>Music envelope generator</h1>
<button id="generate">Generate envelopes</button>
<pre id="status">Ready.</pre>
<script>
const RATE = 20;
const status = document.querySelector('#status');
const encode = bytes => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
};
const envelope = buffer => {
  const binCount = Math.max(1, Math.ceil(buffer.duration * RATE));
  const values = new Uint8Array(binCount);
  const samplesPerBin = buffer.sampleRate / RATE;
  const channels = Array.from({length: Math.min(2, buffer.numberOfChannels)}, (_, index) => buffer.getChannelData(index));
  for (let bin = 0; bin < binCount; bin += 1) {
    const start = Math.floor(bin * samplesPerBin);
    const end = Math.min(buffer.length, Math.floor((bin + 1) * samplesPerBin));
    const stride = Math.max(1, Math.floor((end - start) / 72));
    let energy = 0;
    let count = 0;
    for (let sample = start; sample < end; sample += stride) {
      channels.forEach(channel => { const value = channel[sample] || 0; energy += value * value; count += 1; });
    }
    const rms = count ? Math.sqrt(energy / count) : 0;
    const level = Math.pow(Math.min(1, Math.max(0, (rms - .006) * 4.6)), .82);
    values[bin] = Math.round(level * 255);
  }
  return encode(values);
};
document.querySelector('#generate').addEventListener('click', async () => {
  const context = new AudioContext();
  const files = await fetch('/manifest').then(response => response.json());
  const tracks = {};
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    status.textContent = 'Analyzing ' + (index + 1) + ' / ' + files.length + '\\n' + file;
    const bytes = await fetch('/audio?file=' + encodeURIComponent(file)).then(response => response.arrayBuffer());
    const buffer = await context.decodeAudioData(bytes);
    tracks[file] = envelope(buffer);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  await fetch('/save', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({rate:RATE, tracks})});
  status.textContent = 'DONE — ' + files.length + ' envelopes generated.';
});
</script>`;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(page);
    return;
  }
  if (url.pathname === "/manifest") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(await musicFiles()));
    return;
  }
  if (url.pathname === "/audio") {
    const relative = url.searchParams.get("file") || "";
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${assetsRoot}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const data = await fs.readFile(target);
    response.writeHead(200, { "content-type": "audio/mpeg", "content-length": data.length });
    response.end(data);
    return;
  }
  if (url.pathname === "/save" && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const source = `window.MUSIC_ENVELOPES = ${JSON.stringify(payload)};\n`;
    await fs.writeFile(outputPath, source, "utf8");
    response.writeHead(204).end();
    return;
  }
  response.writeHead(404).end();
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Music envelope generator: http://127.0.0.1:${port}\n`);
});

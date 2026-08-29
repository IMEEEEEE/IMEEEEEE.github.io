import fs from "node:fs";
import path from "node:path";

const [, , inputArg, outputArg] = process.argv;

if (!inputArg || !outputArg) {
  throw new Error("Usage: node tools/assign-akm-glb-materials.mjs <input.glb> <output.glb>");
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
const source = fs.readFileSync(inputPath);

if (source.toString("ascii", 0, 4) !== "glTF") {
  throw new Error("Input is not a binary glTF (GLB) file.");
}

const version = source.readUInt32LE(4);
if (version !== 2) throw new Error(`Unsupported GLB version: ${version}`);

const chunks = [];
let offset = 12;
while (offset < source.length) {
  const byteLength = source.readUInt32LE(offset);
  const type = source.readUInt32LE(offset + 4);
  const dataStart = offset + 8;
  const dataEnd = dataStart + byteLength;
  chunks.push({ type, data: source.subarray(dataStart, dataEnd) });
  offset = dataEnd;
}

const JSON_CHUNK = 0x4e4f534a;
const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK);
if (!jsonChunk) throw new Error("GLB has no JSON chunk.");

const gltf = JSON.parse(jsonChunk.data.toString("utf8").trimEnd());

const srgbToLinear = (channel) => {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
};

const colorFactor = (hex, alpha = 1) => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [
    srgbToLinear((value >> 16) & 255),
    srgbToLinear((value >> 8) & 255),
    srgbToLinear(value & 255),
    alpha,
  ];
};

const materialDefinitions = [
  ["MAT_Steel_Parkerized", "#151918", 0.82, 0.52, "parkerized-steel"],
  ["MAT_Steel_BlackOxide", "#171C1B", 0.88, 0.36, "black-oxide-steel"],
  ["MAT_Aluminum_BlackAnodized", "#181D1F", 0.70, 0.38, "black-anodized-aluminum"],
  ["MAT_Polymer_Black", "#111719", 0.0, 0.78, "matte-polymer"],
  ["MAT_Rubber_Black", "#0D100F", 0.0, 0.92, "rubber"],
  ["MAT_Steel_BareSilver", "#747B7C", 0.96, 0.30, "bare-silver-steel"],
];

gltf.materials = materialDefinitions.map(([name, color, metallic, roughness, materialClass]) => ({
  name,
  pbrMetallicRoughness: {
    baseColorFactor: colorFactor(color),
    metallicFactor: metallic,
    roughnessFactor: roughness,
  },
  doubleSided: false,
  extras: { materialClass },
}));

const materialIndex = Object.fromEntries(gltf.materials.map((material, index) => [material.name, index]));

const chooseMaterial = (name) => {
  const part = name.toLowerCase();

  if (part.includes("acog") && part.includes("eyepiece")) return "MAT_Rubber_Black";
  if (part.includes("magpul moe carbine-1")) return "MAT_Polymer_Black";
  if (part.includes("pistol grip") || part.includes("vertical grip")) return "MAT_Polymer_Black";
  if (part.includes("bolt carrier")) return "MAT_Steel_BareSilver";

  if (
    part.includes("handguard") ||
    part.includes("ak-47 to ar adapter") ||
    part === "carbine-1" ||
    (part.includes("acog") && (part.includes("mount") || part.includes("body") || part.includes("knob")))
  ) return "MAT_Aluminum_BlackAnodized";

  if (
    part.includes("picatinny screw") ||
    part.includes("pin") ||
    part.includes("trigger") ||
    part.includes("fire selector") ||
    part.includes("recoil spring guide") ||
    part.includes("rear sight") ||
    part.includes("front sight") ||
    part.includes("slant brake") ||
    part.includes("mag lug") ||
    part.includes("adjuster") ||
    part.includes("limiter")
  ) return "MAT_Steel_BlackOxide";

  return "MAT_Steel_Parkerized";
};

const assignmentCounts = Object.fromEntries(gltf.materials.map((material) => [material.name, 0]));

for (const node of gltf.nodes ?? []) {
  if (node.mesh === undefined) continue;
  const materialName = chooseMaterial(node.name ?? "");
  const mesh = gltf.meshes[node.mesh];
  for (const primitive of mesh.primitives ?? []) {
    primitive.material = materialIndex[materialName];
    assignmentCounts[materialName] += 1;
  }
  node.extras = {
    ...(node.extras ?? {}),
    materialClass: gltf.materials[materialIndex[materialName]].extras.materialClass,
  };
}

gltf.asset = {
  ...gltf.asset,
  generator: `${gltf.asset?.generator ?? "Unknown"} + Codex PBR material pass`,
};

let jsonData = Buffer.from(JSON.stringify(gltf), "utf8");
const padding = (4 - (jsonData.length % 4)) % 4;
if (padding) jsonData = Buffer.concat([jsonData, Buffer.alloc(padding, 0x20)]);

const outputChunks = chunks.map((chunk) => (
  chunk.type === JSON_CHUNK ? { type: chunk.type, data: jsonData } : chunk
));
const totalLength = 12 + outputChunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
const output = Buffer.alloc(totalLength);
output.write("glTF", 0, 4, "ascii");
output.writeUInt32LE(2, 4);
output.writeUInt32LE(totalLength, 8);

offset = 12;
for (const chunk of outputChunks) {
  output.writeUInt32LE(chunk.data.length, offset);
  output.writeUInt32LE(chunk.type, offset + 4);
  chunk.data.copy(output, offset + 8);
  offset += 8 + chunk.data.length;
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);

console.log(JSON.stringify({
  inputPath,
  outputPath,
  outputBytes: output.length,
  materialCount: gltf.materials.length,
  assignmentCounts,
}, null, 2));

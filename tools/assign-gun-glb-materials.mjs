import fs from "node:fs";
import path from "node:path";

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  throw new Error("Usage: node tools/assign-gun-glb-materials.mjs <input.glb> <output.glb>");
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
const source = fs.readFileSync(inputPath);
if (source.toString("ascii", 0, 4) !== "glTF" || source.readUInt32LE(4) !== 2) {
  throw new Error("Input must be a GLB 2.0 file.");
}

const JSON_CHUNK = 0x4e4f534a;
const chunks = [];
let offset = 12;
while (offset < source.length) {
  const byteLength = source.readUInt32LE(offset);
  const type = source.readUInt32LE(offset + 4);
  const start = offset + 8;
  chunks.push({ type, data: source.subarray(start, start + byteLength) });
  offset = start + byteLength;
}

const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK);
if (!jsonChunk) throw new Error("GLB has no JSON chunk.");
const gltf = JSON.parse(jsonChunk.data.toString("utf8").trimEnd());

const srgbToLinear = (channel) => {
  const value = channel / 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
};

const colorFactor = (hex) => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [
    srgbToLinear((value >> 16) & 255),
    srgbToLinear((value >> 8) & 255),
    srgbToLinear(value & 255),
    1,
  ];
};

const definitions = [
  ["MAT_Steel_Parkerized", "#151918", .82, .52, "parkerized-steel"],
  ["MAT_Steel_BlackOxide", "#171C1B", .88, .36, "black-oxide-steel"],
  ["MAT_Aluminum_BlackAnodized", "#181D1F", .70, .38, "black-anodized-aluminum"],
  ["MAT_Polymer_Black", "#1A2024", 0, .74, "matte-polymer"],
  ["MAT_Rubber_Black", "#0D100F", 0, .92, "rubber"],
  ["MAT_Composite_Black", "#171A18", 0, .82, "textured-black-composite"],
  ["MAT_Brass_Satin", "#A8752B", .72, .34, "satin-brass"],
  ["MAT_Cerakote_FDE", "#5F5242", .05, .58, "fde-cerakote"],
  ["MAT_Polymer_FDE", "#574F44", 0, .68, "fde-polymer"],
];

gltf.materials = definitions.map(([name, color, metallic, roughness, materialClass]) => ({
  name,
  pbrMetallicRoughness: {
    baseColorFactor: colorFactor(color),
    metallicFactor: metallic,
    roughnessFactor: roughness,
  },
  doubleSided: false,
  extras: { materialClass },
}));

const indices = Object.fromEntries(gltf.materials.map((material, index) => [material.name, index]));
const rootName = (gltf.nodes ?? []).find((node) => /assembly/i.test(node.name ?? ""))?.name?.toLowerCase() ?? "";
const modelType = rootName.includes("ar-15") ? "ar15" : rootName.includes("m24") ? "m24" : "generic";

const chooseMaterial = (name) => {
  const part = name.toLowerCase();

  if (modelType === "ar15") {
    if (part.includes("5.56x45")) return "MAT_Brass_Satin";
    if (part.includes("pmag")) return "MAT_Polymer_Black";
    if (part.includes("magpul moe carbine-1") || part.includes("pistol grip") || part.includes("angle grip")) return "MAT_Polymer_FDE";
    if (part.includes("lower receiver") || part.includes("upper receiver") || part.includes("handguard") || part.includes("suppressor")) return "MAT_Cerakote_FDE";
    if (part.includes("vortex") || part.includes("geissele")) return "MAT_Aluminum_BlackAnodized";
    if (part === "carbine-1" || part.includes("barrel") || part.includes("bolt") || part.includes("trigger") || part.includes("selector") || part.includes("release") || part.includes("locker") || part.includes("lrbho") || part.includes("assist") || part.includes("charging handle") || part.includes("dust cover") || part.includes("pin")) return "MAT_Steel_BlackOxide";
  }

  if (modelType === "m24") {
    if (part.includes("buttpad-1")) return "MAT_Rubber_Black";
    if (part.includes("sws stock")) return "MAT_Composite_Black";
    if (part.includes("vortex") || part.includes("seekings")) return "MAT_Aluminum_BlackAnodized";
    if (part.includes("barrel") || part.includes("receiver") || part.includes("firing pin") || part.includes("floorplate") || part.includes("connector ring") || part.includes("fixed ring")) return "MAT_Steel_Parkerized";
    if (part.includes("bolt") || part.includes("trigger") || part.includes("wheel") || part.includes("screw")) return "MAT_Steel_BlackOxide";
  }

  return "MAT_Steel_Parkerized";
};

const assignmentCounts = Object.fromEntries(gltf.materials.map((material) => [material.name, 0]));
for (const node of gltf.nodes ?? []) {
  if (node.mesh === undefined) continue;
  const materialName = chooseMaterial(node.name ?? "");
  const mesh = gltf.meshes[node.mesh];
  for (const primitive of mesh.primitives ?? []) {
    primitive.material = indices[materialName];
    assignmentCounts[materialName] += 1;
  }
  node.extras = { ...(node.extras ?? {}), materialClass: gltf.materials[indices[materialName]].extras.materialClass };
}

gltf.asset = { ...gltf.asset, generator: `${gltf.asset?.generator ?? "Unknown"} + Codex PBR material pass` };
let jsonData = Buffer.from(JSON.stringify(gltf), "utf8");
const padding = (4 - (jsonData.length % 4)) % 4;
if (padding) jsonData = Buffer.concat([jsonData, Buffer.alloc(padding, 0x20)]);

const outputChunks = chunks.map((chunk) => chunk.type === JSON_CHUNK ? { ...chunk, data: jsonData } : chunk);
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
console.log(JSON.stringify({ modelType, inputPath, outputPath, outputBytes: output.length, assignmentCounts }, null, 2));

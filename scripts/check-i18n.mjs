import fs from "node:fs/promises";
import path from "node:path";
import { content, localeCodes, STATIONS } from "../src/content.js";

const reportArgIndex = process.argv.indexOf("--report");
const reportPath =
  reportArgIndex >= 0 && process.argv[reportArgIndex + 1]
    ? path.resolve(process.argv[reportArgIndex + 1])
    : null;

const requiredStringPaths = [
  "switchLanguage",
  "skipToContent",
  "navLabel",
  "appearanceLabel",
  "themeLabel",
  "paletteLabel",
  "darkMode",
  "lightMode",
  "paletteHeritage",
  "paletteGold",
  "paletteOlive",
  "heroTitle",
  "heroText",
  "heroPrimary",
  "heroSecondary",
  "selectStation",
  "liveNow",
  "playerDescription",
  "play",
  "pause",
  "mute",
  "unmute",
  "volume",
  "loading",
  "playing",
  "paused",
  "error",
  "socialTitle",
  "socialText",
  "footer",
];

function valueType(value) {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function flattenStructure(value, prefix = "", map = new Map()) {
  const type = valueType(value);
  map.set(prefix || "<root>", type);

  if (type === "array") {
    value.forEach((item, index) => {
      flattenStructure(item, `${prefix}[${index}]`, map);
    });
  } else if (type === "object") {
    Object.entries(value).forEach(([key, child]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenStructure(child, nextPrefix, map);
    });
  }

  return map;
}

function getValueAtPath(source, pathString) {
  if (!pathString) {
    return source;
  }

  const tokens = pathString
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

  return tokens.reduce((current, token) => current?.[token], source);
}

const baseLocale = localeCodes[0];
const baseMap = flattenStructure(content[baseLocale]);
const issues = [];

for (const locale of localeCodes) {
  const localeMap = flattenStructure(content[locale]);

  for (const [pathKey, baseType] of baseMap.entries()) {
    if (!localeMap.has(pathKey)) {
      issues.push(`[${locale}] Missing key: ${pathKey}`);
      continue;
    }

    const localeType = localeMap.get(pathKey);
    if (localeType !== baseType) {
      issues.push(`[${locale}] Type mismatch at ${pathKey}: expected ${baseType}, got ${localeType}`);
    }
  }

  for (const pathKey of localeMap.keys()) {
    if (!baseMap.has(pathKey)) {
      issues.push(`[${locale}] Extra key: ${pathKey}`);
    }
  }

  for (const [pathKey, type] of localeMap.entries()) {
    if (type !== "string") {
      continue;
    }

    const value = getValueAtPath(content[locale], pathKey);
    if (!value || !String(value).trim()) {
      issues.push(`[${locale}] Empty string at ${pathKey}`);
    }
  }

  for (const requiredPath of requiredStringPaths) {
    const value = getValueAtPath(content[locale], requiredPath);
    if (typeof value !== "string" || !value.trim()) {
      issues.push(`[${locale}] Missing required label: ${requiredPath}`);
    }
  }
}

for (const [stationId, station] of Object.entries(STATIONS)) {
  for (const locale of localeCodes) {
    if (typeof station.names?.[locale] !== "string" || !station.names[locale].trim()) {
      issues.push(`[station:${stationId}] Missing localized station name for ${locale}`);
    }

    if (typeof station.subtitles?.[locale] !== "string" || !station.subtitles[locale].trim()) {
      issues.push(`[station:${stationId}] Missing localized station subtitle for ${locale}`);
    }
  }
}

const result = {
  checkedAt: new Date().toISOString(),
  baseLocale,
  locales: localeCodes,
  issues,
  passed: issues.length === 0,
};

if (reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(result, null, 2));
}

if (result.passed) {
  console.log(`Localization check passed for locales: ${localeCodes.join(", ")}`);
} else {
  console.error("Localization check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exitCode = 1;
}

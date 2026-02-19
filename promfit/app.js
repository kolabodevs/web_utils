/*
@name         "Promontory FCH SPI Firmware Configuration Editor"
@version      "1.0 - 2026-02-14"
@description  "A javascript-based configuration editor for SPI loaded promontory firmware."
@repository   "https://projects.kolabo.dev/ReProm/"
@author       "@himko9 - me@himko.dev"
@license      "GNU General Public License v3.0 or later"
*/

const state = {
  registerSets: [],
  currentChipset: null,
  currentProfile: null,
  profileOptions: [],
  registers: null,
  items: [],
  itemByCode: new Map(),
  values: new Map(),
  edited: new Set(),
  optionKeys: new Map(),
  openGroups: new Set(),
  outputs: [],
  fwInfo: null,
  hasFirmwareFile: false,
  profileInitialized: false,
  lastProfileIndex: null
};

const els = {
  chipsetSelect: document.getElementById("chipset-select"),
  profileSelect: document.getElementById("profile-select"),
  navList: document.getElementById("nav-list"),
  regionContainer: document.getElementById("region-container"),
  regionTitle: document.getElementById("region-title"),
  uefiFile: document.getElementById("uefi-file"),
  menuFile: document.getElementById("menu-file"),
  titleText: document.getElementById("title-text"),
  loadFirmwareBtn: document.getElementById("load-firmware-btn"),
  loadProfileBtn: document.getElementById("load-profile-btn"),
  saveProfileBtn: document.getElementById("save-profile-btn"),
  profileFile: document.getElementById("profile-file"),
  customInfoBtn: document.getElementById("custom-info-btn"),
  resetAllBtn: document.getElementById("reset-all-btn"),
  buildBtn: document.getElementById("build-btn"),
  menuBuild: document.getElementById("menu-build"),
  menuHelp: document.getElementById("menu-help"),
  logpane: document.getElementById("logpane"),
  modal: document.getElementById("custom-modal"),
  modalInput: document.getElementById("custom-info-input"),
  modalSave: document.getElementById("custom-save"),
  modalCancel: document.getElementById("custom-cancel"),
  ccModal: document.getElementById("cc-modal"),
  ccBody: document.getElementById("cc-body"),
  ccCancel: document.getElementById("cc-cancel"),
  ccContinue: document.getElementById("cc-continue"),
  confirmModal: document.getElementById("confirm-modal"),
  confirmTitle: document.getElementById("confirm-title"),
  confirmBody: document.getElementById("confirm-body"),
  confirmCancel: document.getElementById("confirm-cancel"),
  confirmContinue: document.getElementById("confirm-continue"),
  helpModal: document.getElementById("help-modal"),
  helpClose: document.getElementById("help-close")
};

function logLine(message, options) {
  const opts = options && typeof options === "object" ? options : { isLink: options === true };
  const isLink = Boolean(opts.isLink);
  const allowHtml = Boolean(opts.allowHtml);
  const ts = new Date();
  const stamp = `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}:${String(ts.getSeconds()).padStart(2, "0")}`;
  const div = document.createElement("div");
  div.className = `logline${isLink ? " link" : ""}`;
  if (allowHtml) {
    const stampNode = document.createElement("span");
    stampNode.textContent = `[${stamp}] `;
    const messageNode = document.createElement("span");
    messageNode.innerHTML = message;
    div.appendChild(stampNode);
    div.appendChild(messageNode);
  } else {
    div.textContent = `[${stamp}] ${message}`;
  }
  els.logpane.appendChild(div);
  els.logpane.scrollTop = els.logpane.scrollHeight;
}

function normalizeHex(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `0x${value.toString(16).toUpperCase()}`;
  }
  let s = String(value).trim();
  if (!s) {
    return "";
  }
  s = s.toUpperCase().replace(/^0X/, "");
  s = s.replace(/[^0-9A-F]/g, "");
  if (!s) {
    return "";
  }
  return `0x${s}`;
}

function parseNumeric(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const s = String(value).trim();
  if (!s) {
    return null;
  }
  if (/^0x/i.test(s)) {
    const num = Number.parseInt(s, 16);
    return Number.isFinite(num) ? num : null;
  }
  if (/[a-f]/i.test(s)) {
    const num = Number.parseInt(s, 16);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number.parseInt(s, 10);
  return Number.isFinite(num) ? num : null;
}

function parseHex(value) {
  if (!value) {
    return null;
  }
  const s = String(value).trim();
  if (!s) {
    return null;
  }
  const cleaned = s.startsWith("0x") || s.startsWith("0X") ? s : `0x${s}`;
  const num = Number.parseInt(cleaned, 16);
  return Number.isFinite(num) ? num : null;
}

function parseHexValue(value) {
  if (value === 0) {
    return 0;
  }
  return parseHex(value);
}

function normalizeSequenceValues(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const list = Array.isArray(raw) ? raw : [raw];
  const out = [];
  list.forEach((value) => {
    const num = parseNumeric(value);
    if (!Number.isFinite(num)) {
      return;
    }
    out.push(num);
  });
  return out.length ? out : null;
}

function hexEquals(a, b) {
  return normalizeHex(a) === normalizeHex(b);
}

function flattenItems(node, list) {
  if (Array.isArray(node)) {
    node.forEach((child) => flattenItems(child, list));
    return;
  }
  if (node && typeof node === "object") {
    if (node.items && Array.isArray(node.items)) {
      node.items.forEach((item) => flattenItems(item, list));
    }
    if (node.groups && Array.isArray(node.groups)) {
      node.groups.forEach((group) => flattenItems(group, list));
    }
    if (node.address !== undefined && node.size_bytes !== undefined) {
      list.push(node);
    }
  }
}

function parseBitRange(bits) {
  if (!bits) {
    return null;
  }
  const match = String(bits).match(/(\d+)\s*:\s*(\d+)/);
  if (match) {
    let hi = Number(match[1]);
    let lo = Number(match[2]);
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) {
      return null;
    }
    if (lo > hi) {
      [lo, hi] = [hi, lo];
    }
    const width = hi - lo + 1;
    const mask = ((1 << width) - 1) << lo;
    return { lo, hi, width, mask };
  }
  const single = String(bits).match(/\d+/);
  if (single) {
    const bit = Number(single[0]);
    if (!Number.isFinite(bit)) {
      return null;
    }
    return { lo: bit, hi: bit, width: 1, mask: 1 << bit };
  }
  return null;
}

function getSubfieldRange(field, item, width) {
  const limit = (1 << width) - 1;
  let min = null;
  let max = null;
  if (field && field.range) {
    min = parseNumeric(field.range.minimum);
    max = parseNumeric(field.range.maximum);
  }
  if (min === null && field && field.minimum !== undefined) {
    min = parseNumeric(field.minimum);
  }
  if (max === null && field && field.maximum !== undefined) {
    max = parseNumeric(field.maximum);
  }
  if (min === null && field && field.min !== undefined) {
    min = parseNumeric(field.min);
  }
  if (max === null && field && field.max !== undefined) {
    max = parseNumeric(field.max);
  }
  if ((min === null || max === null) && item && item.range && item.value_type === "subfield") {
    if (min === null) {
      min = parseNumeric(item.range.minimum);
    }
    if (max === null) {
      max = parseNumeric(item.range.maximum);
    }
  }
  if (min === null) {
    min = 0;
  }
  if (max === null) {
    max = limit;
  }
  min = Math.max(0, min);
  max = Math.min(limit, max);
  return { min, max };
}

function collectOptions(options) {
  const entries = [];
  const pushEntry = (value, label, sequenceOverride) => {
    let text = label;
    let sequence = sequenceOverride;
    if (label && typeof label === "object" && !Array.isArray(label)) {
      if (label.name !== undefined) {
        text = label.name;
      } else if (label.label !== undefined) {
        text = label.label;
      }
      if (sequence === undefined) {
        sequence = label.sequence;
      }
    }
    if (text === undefined || text === null || text === "") {
      text = value;
    }
    entries.push({ value, label: text, sequence });
  };
  if (Array.isArray(options)) {
    options.forEach((opt, idx) => {
      if (typeof opt === "string" || typeof opt === "number") {
        pushEntry(String(idx), opt);
        return;
      }
      if (opt && typeof opt === "object" && !Array.isArray(opt)) {
        const hasOptionKeys = Object.prototype.hasOwnProperty.call(opt, "value")
          || Object.prototype.hasOwnProperty.call(opt, "label");
        if (hasOptionKeys) {
          pushEntry(opt.value, opt.label, opt.sequence);
          return;
        }
        if (Object.prototype.hasOwnProperty.call(opt, "name")
          || Object.prototype.hasOwnProperty.call(opt, "sequence")) {
          pushEntry(String(idx), opt);
          return;
        }
        Object.entries(opt).forEach(([value, label]) => {
          pushEntry(value, label);
        });
      }
    });
  } else if (options && typeof options === "object") {
    Object.entries(options).forEach(([value, label]) => {
      pushEntry(value, label);
    });
  }
  return entries
    .map((entry) => {
      const num = parseNumeric(entry.value);
      if (!Number.isFinite(num)) {
        return null;
      }
      return {
        value: String(num),
        label: entry.label,
        num,
        sequence: entry.sequence
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.num - b.num);
}

function collectByteFieldOptions(byteFields, item) {
  const entries = [];
  if (!Array.isArray(byteFields)) {
    return entries;
  }
  byteFields.forEach((opt) => {
    if (!opt || typeof opt !== "object" || Array.isArray(opt)) {
      return;
    }
    const hasOptionKeys = Object.prototype.hasOwnProperty.call(opt, "value")
      || Object.prototype.hasOwnProperty.call(opt, "label");
    if (hasOptionKeys) {
      let text = opt.label;
      let sequence = opt.sequence;
      let writes = opt.writes;
      let required = opt.required;
      if (opt.label && typeof opt.label === "object" && !Array.isArray(opt.label)) {
        if (opt.label.name !== undefined) {
          text = opt.label.name;
        } else if (opt.label.label !== undefined) {
          text = opt.label.label;
        }
        if (sequence === undefined) {
          sequence = opt.label.sequence;
        }
        if (writes === undefined) {
          writes = opt.label.writes;
        }
        if (required === undefined) {
          required = opt.label.required;
        }
      }
      if (text === undefined || text === null || text === "") {
        text = opt.value;
      }
      entries.push({ value: opt.value, label: text, sequence, writes, required });
      return;
    }
    Object.entries(opt).forEach(([value, label]) => {
      if (value === "sequence") {
        return;
      }
      let text = label;
      let sequence = undefined;
      let writes = undefined;
      let required = undefined;
      if (label && typeof label === "object" && !Array.isArray(label)) {
        if (label.name !== undefined) {
          text = label.name;
        } else if (label.label !== undefined) {
          text = label.label;
        }
        sequence = label.sequence;
        writes = label.writes;
        required = label.required;
      }
      if (text === undefined || text === null || text === "") {
        text = value;
      }
      entries.push({ value, label: text, sequence, writes, required });
    });
  });
  const inferValueFromWrites = (writes) => {
    if (!Array.isArray(writes) || !writes.length) {
      return null;
    }
    const first = writes.find((write) => write && typeof write === "object");
    if (!first) {
      return null;
    }
    if (first.value !== undefined) {
      return first.value;
    }
    if (first.data !== undefined) {
      return first.data;
    }
    return null;
  };

  return entries
    .map((entry) => {
      let rawValue = entry.value;
      if ((rawValue === undefined || rawValue === null || rawValue === "")
        && entry.writes !== undefined) {
        rawValue = inferValueFromWrites(entry.writes);
      }
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        const hasLabel = entry.label !== undefined && entry.label !== null && entry.label !== "";
        if (!hasLabel) {
          return null;
        }
        const fallback = item ? item.default : null;
        if (fallback !== undefined && fallback !== null && fallback !== "") {
          rawValue = fallback;
        } else {
          return null;
        }
      }
      const num = parseNumeric(rawValue);
      if (!Number.isFinite(num)) {
        return null;
      }
      const value = normalizeHex(normalizeHex(rawValue));
      const labelText = entry.label !== undefined && entry.label !== null && entry.label !== ""
        ? String(entry.label)
        : value;
      const key = labelText || value;
      return {
        value,
        key,
        label: entry.label,
        num,
        sequence: entry.sequence,
        writes: entry.writes,
        required: entry.required
      };
    })
    .filter(Boolean);
}

function getByteFieldOptions(item) {
  if (!item || !Array.isArray(item.byte_fields)) {
    return [];
  }
  if (item._byteFieldOptions) {
    return item._byteFieldOptions;
  }
  item._byteFieldSequence = null;
  item.byte_fields.forEach((opt) => {
    if (!opt || typeof opt !== "object" || Array.isArray(opt)) {
      return;
    }
    const hasOptionKeys = Object.prototype.hasOwnProperty.call(opt, "value")
      || Object.prototype.hasOwnProperty.call(opt, "label");
    if (hasOptionKeys) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(opt, "sequence")) {
      const seqList = normalizeSequenceValues(opt.sequence);
      if (seqList) {
        item._byteFieldSequence = seqList;
      }
    }
  });
  const options = collectByteFieldOptions(item.byte_fields, item);
  item._byteFieldOptions = options;
  return options;
}

function parseBitFieldDescriptor(desc) {
  const normalizeLabel = (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const label = value.name !== undefined ? value.name
        : (value.label !== undefined ? value.label : "");
      return { label, sequence: value.sequence };
    }
    return { label: value, sequence: undefined };
  };
  if (Array.isArray(desc)) {
    const first = normalizeLabel(desc[0]);
    const second = normalizeLabel(desc[1]);
    return {
      label0: first.label,
      label1: second.label !== undefined ? second.label : first.label,
      sequence0: first.sequence,
      sequence1: second.sequence
    };
  }
  if (desc && typeof desc === "object") {
    const firstRaw = desc[0] !== undefined ? desc[0] : desc["0"];
    const secondRaw = desc[1] !== undefined ? desc[1] : desc["1"];
    const first = normalizeLabel(firstRaw);
    const second = normalizeLabel(secondRaw);
    return {
      label0: first.label,
      label1: second.label !== undefined ? second.label : first.label,
      sequence0: first.sequence,
      sequence1: second.sequence
    };
  }
  if (typeof desc === "string" || typeof desc === "number") {
    return { label0: desc, label1: desc, sequence0: undefined, sequence1: undefined };
  }
  return { label0: "", label1: "", sequence0: undefined, sequence1: undefined };
}

function getBitFieldMeta(item) {
  if (!item || !Array.isArray(item.bit_fields)) {
    return [];
  }
  if (item._bitFieldMeta) {
    return item._bitFieldMeta;
  }
  const meta = item.bit_fields.map((desc) => parseBitFieldDescriptor(desc));
  item._bitFieldMeta = meta;
  return meta;
}

function syncPresetSelect(input, item) {
  const select = input.parentElement ? input.parentElement.querySelector(".preset-select") : null;
  if (!select) {
    return;
  }
  const current = normalizeHex(input.value);
  const storedKey = state.optionKeys.get(item.code);
  if (storedKey && Array.from(select.options).some((opt) => opt.value === storedKey)) {
    select.value = storedKey;
    input.classList.add("hidden-input");
    return;
  }
  let matched = null;
  Array.from(select.options).forEach((opt) => {
    if (!opt.value || opt.value === "__custom__") {
      return;
    }
    if (normalizeHex(opt.dataset.value) === current) {
      matched = opt.value;
    }
  });
  if (matched) {
    select.value = matched;
    input.classList.add("hidden-input");
    state.optionKeys.set(item.code, matched);
  } else {
    select.value = "__custom__";
    input.classList.remove("hidden-input");
    state.optionKeys.delete(item.code);
  }
}

function syncVisibleInputs() {
  document.querySelectorAll(".value-input").forEach((input) => {
    const code = input.dataset.code;
    const item = state.itemByCode.get(code);
    if (!item) {
      return;
    }
    const current = state.values.get(code) || normalizeHex(item.default || "");
    input.value = normalizeHex(current);
    syncPresetSelect(input, item);
    handleInputChange(input, item);
  });
}

function resetAllValues() {
  state.values.clear();
  state.edited.clear();
  state.optionKeys.clear();
  state.items.forEach((item) => {
    const def = normalizeHex(item.default || "");
    if (def) {
      state.values.set(item.code, def);
    }
  });
}

function extractProfileValues(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  if (data.values && typeof data.values === "object" && !Array.isArray(data.values)) {
    return data.values;
  }
  const list = data.registers || data.items;
  if (Array.isArray(list)) {
    const out = {};
    list.forEach((entry) => {
      if (entry && entry.code && entry.value !== undefined) {
        out[entry.code] = entry.value;
      }
    });
    return Object.keys(out).length ? out : null;
  }
  const out = {};
  Object.entries(data).forEach(([key, value]) => {
    if (state.itemByCode.has(key)) {
      out[key] = value;
    }
  });
  return Object.keys(out).length ? out : null;
}

function applyProfileValues(values, sourceName) {
  resetAllValues();
  let applied = 0;
  let skipped = 0;
  Object.entries(values).forEach(([code, value]) => {
    const item = state.itemByCode.get(code);
    if (!item) {
      skipped += 1;
      return;
    }
    const norm = normalizeHex(value);
    if (!norm) {
      skipped += 1;
      return;
    }
    state.values.set(code, norm);
    if (hexEquals(norm, item.default || "")) {
      state.edited.delete(code);
    } else {
      state.edited.add(code);
    }
    applied += 1;
  });
  syncVisibleInputs();
  const label = sourceName ? `: ${sourceName}` : "";
  logLine(`Profile loaded${label} (${applied} overrides, ${skipped} skipped).`);
}

function buildProfileExport() {
  const values = {};
  state.edited.forEach((code) => {
    const value = state.values.get(code);
    if (value) {
      values[code] = value;
    }
  });
  return {
    profile: state.currentProfile ? state.currentProfile.name || "" : "",
    chipset: state.currentChipset ? state.currentChipset.name || "" : "",
    generated_at: new Date().toISOString(),
    values
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function groupKey(node) {
  if (!node || typeof node !== "object") {
    return "";
  }
  return node.code || node.name || "";
}

function itemKey(node) {
  if (!node || typeof node !== "object") {
    return "";
  }
  return node.code || node.name || "";
}

function filterGroupTree(groups, hideGroups, hideItems) {
  if (!Array.isArray(groups)) {
    return [];
  }
  const output = [];
  groups.forEach((group) => {
    const key = groupKey(group);
    if (key && hideGroups.has(key)) {
      return;
    }
    const next = { ...group };
    if (Array.isArray(next.items)) {
      next.items = next.items.filter((item) => {
        const itemId = itemKey(item);
        return !(itemId && hideItems.has(itemId));
      });
    }
    if (Array.isArray(next.groups)) {
      next.groups = filterGroupTree(next.groups, hideGroups, hideItems);
    }
    const hasItems = Array.isArray(next.items) && next.items.length;
    const hasGroups = Array.isArray(next.groups) && next.groups.length;
    if (hasItems || hasGroups) {
      output.push(next);
    }
  });
  return output;
}

function mergeGroup(baseGroup, overrideGroup) {
  const merged = { ...baseGroup, ...overrideGroup };

  if (Array.isArray(baseGroup.items) || Array.isArray(overrideGroup.items)) {
    const baseItems = Array.isArray(baseGroup.items) ? [...baseGroup.items] : [];
    const overrideItems = Array.isArray(overrideGroup.items) ? overrideGroup.items : [];
    overrideItems.forEach((overrideItem) => {
      const key = groupKey(overrideItem);
      const idx = key ? baseItems.findIndex((item) => groupKey(item) === key) : -1;
      if (idx >= 0) {
        baseItems[idx] = { ...baseItems[idx], ...overrideItem };
      } else {
        baseItems.push(overrideItem);
      }
    });
    merged.items = baseItems;
  }

  if (Array.isArray(baseGroup.groups) || Array.isArray(overrideGroup.groups)) {
    const baseGroups = Array.isArray(baseGroup.groups) ? [...baseGroup.groups] : [];
    const overrideGroups = Array.isArray(overrideGroup.groups) ? overrideGroup.groups : [];
    overrideGroups.forEach((overrideChild) => {
      const key = groupKey(overrideChild);
      const idx = key ? baseGroups.findIndex((child) => groupKey(child) === key) : -1;
      if (idx >= 0) {
        baseGroups[idx] = mergeGroup(baseGroups[idx], overrideChild);
      } else {
        baseGroups.push(overrideChild);
      }
    });
    merged.groups = baseGroups;
  }

  return merged;
}

function mergeGroups(baseGroups, overrideGroups) {
  const merged = Array.isArray(baseGroups) ? [...baseGroups] : [];
  const overrides = Array.isArray(overrideGroups) ? overrideGroups : [];
  overrides.forEach((overrideGroup) => {
    const key = groupKey(overrideGroup);
    const idx = key ? merged.findIndex((group) => groupKey(group) === key) : -1;
    if (idx >= 0) {
      merged[idx] = mergeGroup(merged[idx], overrideGroup);
    } else {
      merged.push(overrideGroup);
    }
  });
  return merged;
}

function applyVariant(baseData, variantData, variantMeta) {
  const merged = deepClone(baseData);
  if (variantData && Array.isArray(variantData.groups)) {
    merged.groups = mergeGroups(merged.groups || [], variantData.groups);
  }
  if (variantData && typeof variantData === "object") {
    if (variantData.cc_suffix !== undefined) {
      merged.cc_suffix = variantData.cc_suffix;
    }
    if (variantData.ccSuffix !== undefined) {
      merged.ccSuffix = variantData.ccSuffix;
    }
    if (variantData.suffix !== undefined) {
      merged.suffix = variantData.suffix;
    }
  }
  const hideGroups = new Set([
    ...((variantMeta && (variantMeta.hideGroups || variantMeta.hide_groups)) || []),
    ...((variantData && variantData.hide_groups) || [])
  ]);
  const hideItems = new Set([
    ...((variantMeta && (variantMeta.hideItems || variantMeta.hide_items)) || []),
    ...((variantData && variantData.hide_items) || [])
  ]);
  if (hideGroups.size || hideItems.size) {
    merged.groups = filterGroupTree(merged.groups || [], hideGroups, hideItems);
  }
  return merged;
}

function loadRegisters(data) {
  state.registers = data;
  state.items = [];
  state.itemByCode.clear();
  state.values.clear();
  state.edited.clear();
  state.optionKeys.clear();

  flattenItems(data.groups || [], state.items);
  state.items.forEach((item) => {
    const code = item.code;
    state.itemByCode.set(code, item);
    const def = normalizeHex(item.default || "");
    if (def) {
      state.values.set(code, def);
    }
  });

  renderNav();
  //logLine(`Loaded ${state.items.length} registers.`);
}

async function loadRegisterSets() {
  const fallback = [
    {
      name: "Failed to load families.json",
      profiles: [
        {
          name: "Failed to load variants",
          file: "/"
        }
      ]
    }
  ];
  try {
    const resp = await fetch("json/families.json", { cache: "no-store" });
    if (!resp.ok) {
      throw new Error("families.json not found");
    }
    const data = await resp.json();
    const chipsets = Array.isArray(data) ? data : data.chipsets;
    state.registerSets = chipsets && chipsets.length ? chipsets : fallback;
  } catch (err) {
    state.registerSets = fallback;
  }

  populateChipsetSelect();
}

function populateChipsetSelect() {
  els.chipsetSelect.innerHTML = "";
  state.registerSets.forEach((set, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = set.name || `Chipset ${idx + 1}`;
    els.chipsetSelect.appendChild(opt);
  });
  els.chipsetSelect.selectedIndex = 0;
  handleChipsetChange();
}

function buildProfileOptions(profiles) {
  const options = [];
  profiles.forEach((profile) => {
    const baseFile = profile.base || profile.file;
    const baseName = profile.name || baseFile || "Profile";
    const variants = Array.isArray(profile.variants) ? profile.variants : [];
    variants.forEach((variant, idx) => {
      const variantName = variant.name || `Variant ${idx + 1}`;
      options.push({
        name: `${baseName} - ${variantName}`,
        baseFile,
        variantFile: variant.file || "",
        hideGroups: Array.isArray(variant.hide_groups) ? variant.hide_groups : [],
        hideItems: Array.isArray(variant.hide_items) ? variant.hide_items : [],
        profile,
        variant
      });
    });
    if (!variants.length && baseFile) {
      options.push({
        name: baseName,
        baseFile,
        variantFile: "",
        hideGroups: [],
        hideItems: [],
        profile
      });
    }
  });
  return options;
}

function populateProfileSelect(profiles) {
  els.profileSelect.innerHTML = "";
  state.profileOptions = buildProfileOptions(profiles);
  state.profileOptions.forEach((profile, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = profile.name || profile.file || `Profile ${idx + 1}`;
    els.profileSelect.appendChild(opt);
  });
  els.profileSelect.selectedIndex = 0;
  handleProfileChange({ confirm: false });
}

function handleChipsetChange() {
  const idx = parseInt(els.chipsetSelect.value, 10);
  state.currentChipset = state.registerSets[idx];
  if (!state.currentChipset) {
    return;
  }
  state.profileInitialized = false;
  state.lastProfileIndex = null;
  const profiles = state.currentChipset.profiles || [];
  populateProfileSelect(profiles);
}

async function handleProfileChange(options) {
  const opts = options && typeof options === "object" ? options : {};
  const confirm = opts.confirm !== false;
  const idx = parseInt(els.profileSelect.value, 10);
  const profileOptions = state.profileOptions || [];
  state.currentProfile = profileOptions[idx];
  if (!state.currentProfile) {
    return;
  }
  if (confirm && state.profileInitialized && state.edited.size) {
    const message = "Switching profiles will discard current settings.\nContinue?";
    const proceed = await openConfirmModal("Switch Profile?", message);
    if (!proceed) {
      const fallback = state.lastProfileIndex !== null ? state.lastProfileIndex : 0;
      els.profileSelect.value = String(fallback);
      state.currentProfile = profileOptions[fallback] || state.currentProfile;
      return;
    }
  }
  try {
    const baseFile = state.currentProfile.baseFile || state.currentProfile.file;
    const resp = await fetch(baseFile, { cache: "no-store" });
    if (!resp.ok) {
      throw new Error(`Failed to load ${baseFile}`);
    }
    const baseData = await resp.json();
    let mergedData = baseData;
    if (state.currentProfile.hideGroups && state.currentProfile.hideGroups.length) {
      mergedData = applyVariant(mergedData, null, state.currentProfile);
    }
    if (state.currentProfile.variantFile) {
      const vresp = await fetch(state.currentProfile.variantFile, { cache: "no-store" });
      if (!vresp.ok) {
        throw new Error(`Failed to load ${state.currentProfile.variantFile}`);
      }
      const variantData = await vresp.json();
      mergedData = applyVariant(mergedData, variantData, state.currentProfile);
    }
    state.openGroups.clear();
    loadRegisters(mergedData);
    logLine(`Loaded profile: ${state.currentProfile.name || baseFile}`);
    state.lastProfileIndex = idx;
    state.profileInitialized = true;
  } catch (err) {
    logLine(`Error loading profile: ${err.message}`);
  }
}

els.chipsetSelect.addEventListener("change", handleChipsetChange);
els.profileSelect.addEventListener("change", () => {
  handleProfileChange({ confirm: true });
});

els.menuFile.addEventListener("click", () => {
  els.uefiFile.click();
});
els.loadFirmwareBtn.addEventListener("click", () => {
  els.uefiFile.click();
});
els.menuBuild.addEventListener("click", () => {
  els.buildBtn.click();
});

els.loadProfileBtn.addEventListener("click", () => {
  if (!state.registers) {
    logLine("No profile loaded yet.");
    return;
  }
  els.profileFile.click();
});

els.profileFile.addEventListener("change", async () => {
  const file = els.profileFile.files[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const values = extractProfileValues(data);
    if (!values) {
      logLine("Profile load failed: no values found.");
      return;
    }
    applyProfileValues(values, file.name);
  } catch (err) {
    logLine(`Profile load failed: ${err.message}`);
  } finally {
    els.profileFile.value = "";
  }
});

els.saveProfileBtn.addEventListener("click", () => {
  if (!state.items.length) {
    logLine("No profile loaded yet.");
    return;
  }
  const payload = buildProfileExport();
  const profileName = state.currentProfile && state.currentProfile.name 
    ? state.currentProfile.name.replace(/[\s\-]+/g, "_") 
    : "profile";
  let name;
  if (state.fwInfo && state.fwInfo.fwDate && state.fwInfo.fwDate !== "UNKNOWN") {
    name = `${profileName}_${state.fwInfo.fwDate}.json`;
  } else {
    name = `${profileName}.json`;
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  triggerDownload(name, blob);
});

state.customInfo = "";
els.customInfoBtn.addEventListener("click", () => {
  openCustomModal();
});

els.resetAllBtn.addEventListener("click", () => {
  resetAllValues();
  syncVisibleInputs();
  logLine("All registers reset to default.");
});


function renderNav() {
  els.navList.innerHTML = "";
  if (!state.registers || !Array.isArray(state.registers.groups)) {
    return;
  }
  state.registers.groups.forEach((group, idx) => {
    const item = document.createElement("div");
    item.className = "nav-item" + (idx === 0 ? " active" : "");
    item.textContent = group.name || group.code;
    item.dataset.index = String(idx);
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((node) => node.classList.remove("active"));
      item.classList.add("active");
      renderGroup(group);
    });
    els.navList.appendChild(item);
    if (idx === 0) {
      renderGroup(group);
    }
  });
}

function renderGroup(group) {
  els.regionContainer.innerHTML = "";
  els.regionTitle.textContent = group.name || group.code || "Regions";
  const regions = [];
  if (group.items && group.items.length) {
    regions.push({ name: `${group.name || group.code} Registers`, items: group.items, groups: [] });
  }
  if (group.groups && group.groups.length) {
    regions.push(...group.groups);
  }
  if (!regions.length) {
    regions.push({ name: group.name || group.code || "Registers", items: [], groups: [] });
  }

  regions.forEach((region, idx) => {
    const details = document.createElement("details");
    details.className = "group";
    const keyBase = groupKey(group) || "group";
    const regionKey = region.name || region.code || `region-${idx + 1}`;
    const openKey = `${keyBase}::${regionKey}::${idx}`;
    details.dataset.openKey = openKey;
    details.open = state.openGroups.has(openKey);
    details.addEventListener("toggle", () => {
      if (details.open) {
        state.openGroups.add(openKey);
      } else {
        state.openGroups.delete(openKey);
      }
    });

    const summary = document.createElement("summary");
    summary.className = "group-summary";
    summary.innerHTML = `<span class="twisty"></span><span class="group-title">${region.name || region.code}</span>`;
    details.appendChild(summary);
    const rule = document.createElement("div");
    rule.className = "gold-rule";
    details.appendChild(rule);

    const grid = document.createElement("div");
    grid.className = "gridbox";
    const head = document.createElement("div");
    head.className = "grid-head";
    head.innerHTML = "<div>Parameter</div><div>Value</div><div>Help Text</div>";
    grid.appendChild(head);

    appendGroupRows(grid, region, "");

    details.appendChild(grid);
    els.regionContainer.appendChild(details);
  });
}

function appendGroupRows(grid, group, prefix) {
  const labelPrefix = prefix ? `${prefix} / ` : "";
  if (group.items && group.items.length) {
    group.items.forEach((item) => {
      grid.appendChild(buildItemRow(item, labelPrefix));
    });
  }
  if (group.groups && group.groups.length) {
    group.groups.forEach((child) => {
      const rule = document.createElement("div");
      rule.className = "gold-rule grid-rule";
      grid.appendChild(rule);

      const row = document.createElement("div");
      row.className = "grid-row section";
      row.innerHTML = `<div class="cell">${labelPrefix}${child.name || child.code}</div><div class="cell value"></div><div class="cell help"></div>`;
      grid.appendChild(row);
      appendGroupRows(grid, child, `${labelPrefix}${child.name || child.code}`);
    });
  }
}

function getRangeText(item) {
  if (!item.range) {
    return "";
  }
  const min = item.range.minimum || "";
  const max = item.range.maximum || "";
  if (!min && !max) {
    return "";
  }
  return `Range ${min || "?"}...${max || "?"}`;
}

function buildItemRow(item, labelPrefix) {
  const fragment = document.createDocumentFragment();
  const row = document.createElement("div");
  row.className = "grid-row";
  const subRows = [];

  const param = document.createElement("div");
  param.className = "cell";
  const nameLine = document.createElement("div");
  nameLine.textContent = `${labelPrefix}${item.name || item.code}`;
  param.appendChild(nameLine);

  const valueCell = document.createElement("div");
  valueCell.className = "cell value";
  const input = document.createElement("input");
  input.className = "value-input";
  input.type = "text";
  input.value = normalizeHex(state.values.get(item.code) || item.default || "");
  input.placeholder = "0x00";
  input.dataset.code = item.code;
  valueCell.appendChild(input);

  if (item.byte_fields && Array.isArray(item.byte_fields) && item.byte_fields.length) {
    const select = document.createElement("select");
    select.className = "preset-select";
    const entries = getByteFieldOptions(item);
    entries.forEach((entry) => {
      const o = document.createElement("option");
      o.value = String(entry.key);
      o.dataset.value = String(entry.value);
      o.textContent = entry.label ? String(entry.label) : String(entry.value);
      select.appendChild(o);
    });
    const customOption = document.createElement("option");
    customOption.value = "__custom__";
    customOption.textContent = "Custom...";
    select.appendChild(customOption);

    const storedKey = state.optionKeys.get(item.code);
    const currentHex = normalizeHex(input.value);
    const hasPreset = entries.some((entry) => normalizeHex(entry.value) === currentHex);
    if (storedKey && entries.some((entry) => entry.key === storedKey)) {
      select.value = storedKey;
      input.classList.add("hidden-input");
    } else if (hasPreset) {
      const entry = entries.find((opt) => normalizeHex(opt.value) === currentHex);
      if (entry) {
        select.value = entry.key;
        state.optionKeys.set(item.code, entry.key);
      }
      input.classList.add("hidden-input");
    } else {
      select.value = "__custom__";
    }

    select.addEventListener("change", () => {
      if (select.value === "__custom__") {
        input.classList.remove("hidden-input");
        state.optionKeys.delete(item.code);
        input.focus();
        return;
      }
      if (select.value) {
        input.classList.add("hidden-input");
        const chosen = entries.find((entry) => entry.key === select.value);
        if (chosen) {
          input.value = normalizeHex(chosen.value);
          state.optionKeys.set(item.code, chosen.key);
        }
        handleInputChange(input, item);
      }
    });
    valueCell.insertBefore(select, input);
  }

  if (item.value_type === "subfield" && Array.isArray(item.sub_fields) && item.sub_fields.length) {
    const baseVal = (parseHex(normalizeHex(input.value || item.default || "")) || 0) >>> 0;
    const controls = [];

    item.sub_fields.forEach((field) => {
      const info = parseBitRange(field.bits);
      if (!info) {
        return;
      }
      const range = getSubfieldRange(field, item, info.width);
      const subRow = document.createElement("div");
      subRow.className = "grid-row subfield-row";

      const subParam = document.createElement("div");
      subParam.className = "cell subfield-param";
      const label = document.createElement("div");
      label.className = "subfield-name";
      label.textContent = field.name || field.description || field.code || `Bits ${field.bits}`;
      subParam.appendChild(label);

      const subValue = document.createElement("div");
      subValue.className = "cell value subfield-value";
      const controlRow = document.createElement("div");
      controlRow.className = "subfield-controls";

      const current = (baseVal & info.mask) >>> info.lo;
      const options = collectOptions(field.options).filter((opt) => {
        if (!opt.label) {
          return true;
        }
        return !/reserved/i.test(String(opt.label));
      });
      let select = null;
      let customInput = null;

      if (options.length) {
        select = document.createElement("select");
        select.className = "preset-select subfield-select";
        options.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.label ? String(opt.label) : String(opt.value);
          select.appendChild(o);
        });
        const customOption = document.createElement("option");
        customOption.value = "__custom__";
        customOption.textContent = "Custom...";
        select.appendChild(customOption);
        controlRow.appendChild(select);

        customInput = document.createElement("input");
        customInput.type = "text";
        customInput.className = "subfield-input hidden-input";
        customInput.placeholder = `${range.min}...${range.max}`;
        controlRow.appendChild(customInput);

        const match = options.find((opt) => opt.num === current);
        if (match) {
          select.value = match.value;
          customInput.classList.add("hidden-input");
          customInput.value = "";
        } else {
          select.value = "__custom__";
          customInput.classList.remove("hidden-input");
          customInput.value = String(current);
        }

        select.addEventListener("change", () => {
          if (select.value === "__custom__") {
            customInput.classList.remove("hidden-input");
            customInput.focus();
            return;
          }
          customInput.classList.add("hidden-input");
          const num = parseNumeric(select.value);
          if (!Number.isFinite(num)) {
            return;
          }
          const base = parseHex(input.value);
          const safeBase = base !== null && base !== undefined ? base : baseVal;
          const next = (safeBase & ~info.mask) | ((num << info.lo) & info.mask);
          input.value = normalizeHex(next >>> 0);
          handleInputChange(input, item);
        });

        customInput.addEventListener("input", () => {
          const num = parseNumeric(customInput.value);
          if (!Number.isFinite(num) || num < range.min || num > range.max) {
            customInput.classList.add("invalid");
            return;
          }
          customInput.classList.remove("invalid");
          const base = parseHex(input.value);
          const safeBase = base !== null && base !== undefined ? base : baseVal;
          const next = (safeBase & ~info.mask) | ((num << info.lo) & info.mask);
          input.value = normalizeHex(next >>> 0);
          handleInputChange(input, item);
        });
      } else {
        customInput = document.createElement("input");
        customInput.type = "text";
        customInput.className = "subfield-input";
        customInput.placeholder = `${range.min}...${range.max}`;
        customInput.value = String(current);
        controlRow.appendChild(customInput);
        customInput.addEventListener("input", () => {
          const num = parseNumeric(customInput.value);
          if (!Number.isFinite(num) || num < range.min || num > range.max) {
            customInput.classList.add("invalid");
            return;
          }
          customInput.classList.remove("invalid");
          const base = parseHex(input.value);
          const safeBase = base !== null && base !== undefined ? base : baseVal;
          const next = (safeBase & ~info.mask) | ((num << info.lo) & info.mask);
          input.value = normalizeHex(next >>> 0);
          handleInputChange(input, item);
        });
      }

      subValue.appendChild(controlRow);

      const subHelp = document.createElement("div");
      subHelp.className = "cell help subfield-help";
      if (field.description) {
        const descLine = document.createElement("div");
        descLine.className = "description-text";
        descLine.textContent = field.description;
        subHelp.appendChild(descLine);
      }
      const rangeLine = document.createElement("div");
      rangeLine.className = "range-text";
      rangeLine.textContent = `Range ${range.min}...${range.max}`;
      subHelp.appendChild(rangeLine);

      subRow.appendChild(subParam);
      subRow.appendChild(subValue);
      subRow.appendChild(subHelp);
      subRow.classList.add("is-hidden");
      subRows.push(subRow);

      controls.push({ info, range, select, customInput, options });
    });

    if (controls.length) {
      const subfieldMenu = document.createElement("details");
      subfieldMenu.className = "bit-menu subfield-menu";
      const summary = document.createElement("summary");
      summary.textContent = "Options";
      subfieldMenu.appendChild(summary);
      subfieldMenu.addEventListener("toggle", () => {
        const isOpen = subfieldMenu.open;
        subRows.forEach((subRow) => {
          subRow.classList.toggle("is-hidden", !isOpen);
        });
      });
      valueCell.appendChild(subfieldMenu);
      input._subFields = controls;
    }
  }

  if (item.value_type === "bitfield" && Array.isArray(item.bit_fields)) {
    if (!item.size_bytes || item.size_bytes <= 4) {
      const bitMenu = document.createElement("details");
      bitMenu.className = "bit-menu";
      const summary = document.createElement("summary");
      summary.textContent = "Options";
      bitMenu.appendChild(summary);
      const list = document.createElement("div");
      list.className = "bit-list";
      const baseVal = (parseHex(normalizeHex(input.value || item.default || "")) || 0) >>> 0;
      const bitCount = item.size_bytes ? Math.min(item.size_bytes * 8, 32) : Math.min(item.bit_fields.length, 32);
      const checkboxes = [];

      const meta = getBitFieldMeta(item);

      for (let bit = 0; bit < bitCount; bit++) {
        const desc = meta[bit] || { label0: "", label1: "" };
        const label0Raw = desc.label0;
        const label1Raw = desc.label1 !== undefined ? desc.label1 : label0Raw;
        const label0Text = label0Raw !== undefined && label0Raw !== null ? String(label0Raw) : "";
        const label1Text = label1Raw !== undefined && label1Raw !== null ? String(label1Raw) : label0Text;
        if (label0Text && /reserved/i.test(label0Text) && (!label1Text || label1Text === label0Text)) {
          continue;
        }
        const label0 = label0Text || `Bit ${bit}: 0`;
        const label1 = label1Text || label0;

        const row = document.createElement("label");
        row.className = "bit-item";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.bit = String(bit);
        cb.dataset.label0 = label0;
        cb.dataset.label1 = label1;
        cb.checked = ((baseVal >> bit) & 1) === 1;
        const text = document.createElement("span");
        text.textContent = cb.checked ? label1 : label0;
        cb._labelSpan = text;
        row.appendChild(cb);
        row.appendChild(text);
        list.appendChild(row);
        checkboxes.push(cb);
      }

      const updateFromBits = () => {
        let value = Number.isFinite(input._bitBaseVal) ? input._bitBaseVal : baseVal;
        checkboxes.forEach((cb) => {
          const bit = Number(cb.dataset.bit);
          if (cb.checked) {
            value |= (1 << bit);
          } else {
            value &= ~(1 << bit);
          }
          if (cb._labelSpan) {
            cb._labelSpan.textContent = cb.checked ? cb.dataset.label1 : cb.dataset.label0;
          }
        });
        value >>>= 0;
        input.value = normalizeHex(value);
        input.dataset.fromBits = "1";
        handleInputChange(input, item);
      };
      checkboxes.forEach((cb) => cb.addEventListener("change", updateFromBits));
      input._bitCheckboxes = checkboxes;
      input._bitBaseVal = baseVal;
      bitMenu.appendChild(list);
      valueCell.appendChild(bitMenu);
    }
  }

  const help = document.createElement("div");
  help.className = "cell help";
  const desc = document.createElement("div");
  desc.textContent = item.description || "";
  help.appendChild(desc);
  const range = getRangeText(item);
  if (range) {
    const rangeLine = document.createElement("div");
    rangeLine.className = "range-text";
    rangeLine.textContent = range;
    help.appendChild(rangeLine);
  }
  if (item.required) {
    const req = document.createElement("div");
    req.className = "required-tag";
    req.textContent = "Required";
    help.appendChild(req);
  }

  input.addEventListener("input", () => handleInputChange(input, item));
  input.addEventListener("blur", () => {
    input.value = normalizeHex(input.value);
    handleInputChange(input, item);
  });
  input.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    input.value = normalizeHex(item.default || "");
    handleInputChange(input, item);
  });

  row.appendChild(param);
  row.appendChild(valueCell);
  row.appendChild(help);
  fragment.appendChild(row);
  subRows.forEach((subRow) => fragment.appendChild(subRow));
  return fragment;
}

function handleInputChange(input, item) {
  const fromBits = input.dataset.fromBits === "1";
  if (fromBits) {
    input.dataset.fromBits = "";
  }
  const code = item.code;
  const val = normalizeHex(input.value);
  input.value = val;
  if (input.classList.contains("hidden-input")) {
    // keep optionKeys as-is
  } else {
    state.optionKeys.delete(code);
  }
  if (val) {
    state.values.set(code, val);
  } else {
    state.values.delete(code);
  }
  const valNum = parseHex(val);
  if (Number.isFinite(valNum)) {
    input._bitBaseVal = valNum >>> 0;
  }
  if (hexEquals(val, item.default || "")) {
    state.edited.delete(code);
  } else if (val) {
    state.edited.add(code);
  }
  if (input._subFields) {
    const fullVal = parseHex(val);
    const safeFullVal = fullVal !== null && fullVal !== undefined ? fullVal : 0;
    input._subFields.forEach((field) => {
      const current = (safeFullVal & field.info.mask) >>> field.info.lo;
      if (field.select) {
        const match = field.options.find((opt) => opt.num === current);
        if (match) {
          field.select.value = match.value;
          if (field.customInput) {
            field.customInput.classList.add("hidden-input");
            field.customInput.value = "";
          }
        } else {
          field.select.value = "__custom__";
          if (field.customInput) {
            field.customInput.classList.remove("hidden-input");
            field.customInput.value = String(current);
          }
        }
      } else if (field.customInput) {
        field.customInput.value = String(current);
      }
    });
  }
  if (!fromBits && input._bitCheckboxes) {
    const baseVal = Number.isFinite(input._bitBaseVal) ? input._bitBaseVal : 0;
    input._bitCheckboxes.forEach((cb) => {
      const bit = Number(cb.dataset.bit);
      const source = valNum === null ? baseVal : valNum;
      cb.checked = ((source >> bit) & 1) === 1;
      if (cb._labelSpan) {
        cb._labelSpan.textContent = cb.checked ? cb.dataset.label1 : cb.dataset.label0;
      }
    });
  }
  const valid = validateInput(input, item);
  if (!valid && state.edited.has(code)) {
    logLine(`Invalid value for ${code}, will be skipped.`);
  }
}

function validateInput(input, item) {
  const val = parseHex(input.value);
  let valid = true;
  if (val === null) {
    valid = input.value.trim() === "";
  }
  const def = normalizeHex(item.default || "");
  if (hexEquals(input.value, def)) {
    input.classList.remove("invalid");
    return true;
  }
  if (valid && item.range && item.value_type !== "subfield") {
    const min = parseHex(item.range.minimum);
    const max = parseHex(item.range.maximum);
    if (min !== null && val !== null && val < min) {
      valid = false;
    }
    if (max !== null && val !== null && val > max) {
      valid = false;
    }
  }
  if (valid && item.size_bytes && val !== null) {
    const limit = Math.pow(2, item.size_bytes * 8) - 1;
    if (val > limit) {
      valid = false;
    }
  }
  input.classList.toggle("invalid", !valid);
  return valid;
}

function isValueValid(item, valStr) {
  const def = normalizeHex(item.default || "");
  if (hexEquals(valStr, def)) {
    return true;
  }
  const val = parseHex(valStr);
  if (val === null) {
    return false;
  }
  if (item.range && item.value_type !== "subfield") {
    const min = parseHex(item.range.minimum);
    const max = parseHex(item.range.maximum);
    if (min !== null && val < min) {
      return false;
    }
    if (max !== null && val > max) {
      return false;
    }
  }
  if (item.size_bytes) {
    const limit = Math.pow(2, item.size_bytes * 8) - 1;
    if (val > limit) {
      return false;
    }
  }
  return true;
}

function collectXdata() {
  const entries = [];
  state.items.forEach((item) => {
    const addr = parseHex(item.address);
    if (addr === null) {
      return;
    }
    const size = Number(item.size_bytes || 1);
    const defaultVal = normalizeHex(item.default || "");
    const required = Boolean(item.required);
    let currentVal = state.values.get(item.code) || "";
    const hasDefault = Boolean(defaultVal);
    const hasCurrent = Boolean(currentVal);
    if (!hasCurrent) {
      if (hasDefault) {
        currentVal = defaultVal;
      } else if (!required) {
        return;
      } else {
        currentVal = "0x0";
      }
    }
    if (!currentVal) {
      currentVal = defaultVal || "0x0";
    }
    let changed = !hexEquals(currentVal, defaultVal);
    if (!isValueValid(item, currentVal) && changed) {
      return;
    }
    const val = parseHex(currentVal);
    if (val === null) {
      return;
    }
    if (![1, 2, 4].includes(size)) {
      return;
    }
    // changed may be overridden for multi-write options below
    const sequenceValues = [];
    const sizeLimit = Math.pow(2, size * 8) - 1;
    let selectedOption = null;
    if (item.byte_fields && Array.isArray(item.byte_fields)) {
      const options = getByteFieldOptions(item);
      if (options.length) {
        const key = state.optionKeys.get(item.code);
        selectedOption = key ? options.find((opt) => opt.key === key) : null;
        if (selectedOption && selectedOption.writes && Array.isArray(selectedOption.writes)) {
          const defaultNum = defaultVal ? parseHex(defaultVal) : null;
          const isDefaultWrite = (() => {
            if (defaultNum === null) {
              return false;
            }
            return selectedOption.writes.some((write) => {
              const wAddr = parseHex(write.address);
              const wValue = parseHex(write.value !== undefined ? write.value : write.data);
              const wSize = Number(write.size_bytes || 1);
              return wAddr === addr && wValue === defaultNum && wSize === size;
            });
          })();
          if (!isDefaultWrite) {
            changed = true;
          }
        }
      }
    }
    const effectiveRequired = required || Boolean(selectedOption && selectedOption.required);
    if (!changed && !effectiveRequired) {
      return;
    }
    if (item.byte_fields && Array.isArray(item.byte_fields)) {
      if (selectedOption && selectedOption.writes && Array.isArray(selectedOption.writes)) {
        selectedOption.writes.forEach((write) => {
          const wAddr = parseHex(write.address);
          const wValue = parseHex(write.value !== undefined ? write.value : write.data);
          const wSize = Number(write.size_bytes || 1);
          if (wAddr !== null && wValue !== null && [1, 2, 4].includes(wSize)) {
            const wSeg = (wAddr >>> 16) & 0xF;
            const wAddr16 = wAddr & 0xFFFF;
            entries.push({
              seg: wSeg,
              addr: wAddr16,
              value: wValue,
              size_bytes: wSize,
              code: `${item.code}_write_${entries.length}`
            });
          }
        });
        return;
      }
      if (selectedOption) {
        if (selectedOption.sequence !== undefined && selectedOption.sequence !== null && selectedOption.sequence !== "") {
          const seqList = normalizeSequenceValues(selectedOption.sequence);
          if (seqList) {
            seqList.forEach((seqVal) => {
              if (seqVal >= 0 && seqVal <= sizeLimit) {
                sequenceValues.push(seqVal);
              }
            });
          }
        } else {
          const seqSource = item.sequence !== undefined ? item.sequence : item._byteFieldSequence;
          const seqList = normalizeSequenceValues(seqSource);
          if (seqList) {
            seqList.forEach((seqVal) => {
              if (seqVal >= 0 && seqVal <= sizeLimit) {
                sequenceValues.push(seqVal);
              }
            });
          }
        }
      }
    }
    if (item.value_type === "subfield" && Array.isArray(item.sub_fields) && item.sub_fields.length) {
      const baseVal = val >>> 0;
      item.sub_fields.forEach((field) => {
        const info = parseBitRange(field.bits);
        if (!info) {
          return;
        }
        const options = collectOptions(field.options);
        if (!options.length) {
          return;
        }
        const current = (baseVal & info.mask) >>> info.lo;
        const match = options.find((opt) => opt.num === current);
        if (!match || match.sequence === undefined || match.sequence === null || match.sequence === "") {
          return;
        }
        const seqList = normalizeSequenceValues(match.sequence);
        if (!seqList) {
          return;
        }
        const widthLimit = info.width >= 32 ? 0xFFFFFFFF : (1 << info.width) - 1;
        seqList.forEach((seqVal) => {
          if (seqVal < 0 || seqVal > widthLimit) {
            return;
          }
          const next = (baseVal & ~info.mask) | ((seqVal << info.lo) & info.mask);
          if (next >= 0 && next <= sizeLimit) {
            sequenceValues.push(next >>> 0);
          }
        });
      });
    }
    if (item.value_type === "bitfield" && Array.isArray(item.bit_fields)) {
      const baseVal = val >>> 0;
      const meta = getBitFieldMeta(item);
      const bitCount = item.size_bytes
        ? Math.min(item.size_bytes * 8, 32)
        : Math.min(meta.length, 32);
      for (let bit = 0; bit < bitCount; bit++) {
        const desc = meta[bit];
        if (!desc) {
          continue;
        }
        const current = (baseVal >> bit) & 1;
        const seqSource = current ? desc.sequence1 : desc.sequence0;
        if (seqSource === undefined || seqSource === null || seqSource === "") {
          continue;
        }
        const seqList = normalizeSequenceValues(seqSource);
        if (!seqList) {
          continue;
        }
        seqList.forEach((seqVal) => {
          if (seqVal !== 0 && seqVal !== 1) {
            return;
          }
          let next = baseVal;
          if (seqVal === 1) {
            next |= (1 << bit);
          } else {
            next &= ~(1 << bit);
          }
          if (next >= 0 && next <= sizeLimit) {
            sequenceValues.push(next >>> 0);
          }
        });
      }
    }
    const seg = (addr >>> 16) & 0xF;
    const addr16 = addr & 0xFFFF;
    const entry = {
      seg,
      addr: addr16,
      value: val,
      size_bytes: size,
      code: item.code
    };
    if (sequenceValues.length) {
      entry.sequence = sequenceValues;
    }
    entries.push(entry);
  });
  return entries;
}

function parseCcWriteConfig(def) {
  if (!def || typeof def !== "object") {
    return null;
  }
  const size = Number(def.size_bytes !== undefined ? def.size_bytes
    : (def.size !== undefined ? def.size : def.bytes));
  if (![1, 2, 4].includes(size)) {
    return null;
  }
  let seg = null;
  let addr = null;
  if (def.address !== undefined) {
    const full = parseHexValue(def.address);
    if (full === null) {
      return null;
    }
    seg = (full >>> 16) & 0xF;
    addr = full & 0xFFFF;
  } else if (def.addr !== undefined && def.seg !== undefined) {
    const addrVal = parseHexValue(def.addr);
    const segVal = parseHexValue(def.seg);
    if (addrVal === null || segVal === null) {
      return null;
    }
    addr = addrVal & 0xFFFF;
    seg = segVal & 0xF;
  } else {
    return null;
  }
  const value = parseHexValue(def.value !== undefined ? def.value : def.data);
  if (value === null) {
    return null;
  }
  return {
    seg,
    addr,
    value,
    size_bytes: size
  };
}

function collectPrefixEntry() {
  if (!state.registers || typeof state.registers !== "object") {
    return null;
  }
  const raw = state.registers.cc_prefix !== undefined ? state.registers.cc_prefix
    : (state.registers.ccPrefix !== undefined ? state.registers.ccPrefix : state.registers.prefix);
  return parseCcWriteConfig(raw);
}

function collectSuffixEntry() {
  if (!state.registers || typeof state.registers !== "object") {
    return null;
  }
  const raw = state.registers.cc_suffix !== undefined ? state.registers.cc_suffix
    : (state.registers.ccSuffix !== undefined ? state.registers.ccSuffix : state.registers.suffix);
  return parseCcWriteConfig(raw);
}


els.buildBtn.addEventListener("click", async () => {
  state.outputs = [];
  const file = els.uefiFile.files[0];
  if (!file || !state.hasFirmwareFile) {
    logLine("No input file selected.");
    return;
  }
  const buffer = await file.arrayBuffer();
  const xdata = collectXdata();
  const prefix = collectPrefixEntry();
  const suffix = collectSuffixEntry();
  const seqCount = xdata.reduce((acc, entry) => acc + (entry.sequence !== undefined ? 1 : 0), 0);
  const extra = [];
  if (seqCount) {
    extra.push(`${seqCount} sequenced`);
  }
  if (prefix) {
    extra.push("1 prefix");
  }
  if (suffix) {
    extra.push("1 suffix");
  }
  const extraText = extra.length ? ` (${extra.join(", ")})` : "";
  logLine(`Building with ${xdata.length} CC entries${extraText}.`);
  const profileName = state.currentProfile && state.currentProfile.name 
    ? state.currentProfile.name.replace(/[\s\-]+/g, "_") 
    : "";
  let outputs = [];
  const spiImage = parseSpiImage(buffer);
  if (spiImage && !spiImage.error) {
    if (!spiImage.footerOk) {
      logLine("SPI footer signature mismatch. Rebuilding with correct footer.");
    }
    const info = spiImage.fwInfo || { fwDate: "UNKNOWN" };
    const fwDate = info.fwDate || "UNKNOWN";
    const header = generateHeader(spiImage.chipModel, state.customInfo || "", xdata, prefix, suffix);
    const bodyChecksum = sumBytes(spiImage.body) & 0xFF;
    const bodyCrc = crc32(spiImage.body);
    let outData = concatBytes([
      header,
      packU32LE(spiImage.bodySize),
      spiImage.body,
      chipFooter(spiImage.chipModel),
      new Uint8Array([bodyChecksum]),
      packU32LE(bodyCrc)
    ]);
    const pad = (16 - (outData.length % 16)) % 16;
    if (pad) {
      outData = concatBytes([outData, new Uint8Array(pad).fill(0xFF)]);
    }
    const profileSuffix = profileName ? `${profileName}` : "";
    const name = `${profileSuffix}_${fwDate}_SPI.bin`;
    outputs = [{ name, data: outData }];
  } else {
    outputs = extractFirmware(buffer, {
      ignoreChecksum: false,
      customInfo: state.customInfo || "",
      xdata,
      prefix,
      suffix,
      profileName
    });
  }
  for (const out of outputs) {
    state.outputs.push(out);
    const blob = new Blob([out.data], { type: "application/octet-stream" });
    triggerDownload(out.name, blob);
  }
});

function triggerDownload(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  logLine(`Download started: ${name}`);
}

els.uefiFile.addEventListener("change", async () => {
  const file = els.uefiFile.files[0];
  updateTitle(file ? file.name : "");
  if (!file) {
    state.hasFirmwareFile = false;
    return;
  }
  state.hasFirmwareFile = true;
  logLine(`Loaded input image: ${file.name}`);
  try {
    const buffer = await file.arrayBuffer();
    let info = parseFirmwareInfo(buffer);
    if (!info) {
      const spiImage = parseSpiImage(buffer);
      if (spiImage && spiImage.fwInfo && spiImage.fwInfo.fwDate !== "UNKNOWN") {
        info = spiImage.fwInfo;
      }
    }
    state.fwInfo = info;
    if (info) {
      logLine(`Firmware version: ${info.fwDate} (${info.chipModel})`);
    } else {
      logLine("Firmware version: UNKNOWN");
    }

    const spiInfo = parseSpiCcEntries(buffer);
    if (spiInfo) {
      if (spiInfo.error) {
        logLine(`SPI header parse error: ${spiInfo.error}`);
      } else {
        const notes = [];
        if (!spiInfo.checksumOk) {
          notes.push("checksum mismatch");
        }
        if (!spiInfo.crcOk) {
          notes.push("CRC mismatch");
        }
        const noteText = notes.length ? ` (${notes.join(", ")})` : "";
        logLine(`SPI header detected: ${spiInfo.chipModel}, ${spiInfo.entries.length} CC entries${noteText}.`);
        if (spiInfo.entries.length) {
          const message = `This SPI image contains ${spiInfo.entries.length} settings. \n`
            + "Click \"Cancel\" to load the firmware only.\n Click \"Continue\" to load firmware and apply the settings.";
          const applyValues = await openCcModal(message);
          if (applyValues) {
            applyCcEntries(spiInfo.entries, file.name);
          } else {
            logLine("SPI CC entries not applied (user canceled).");
          }
        }
      }
    }
  } catch (err) {
    logLine(`Firmware parse error: ${err.message}`);
  }
});

function readU32LE(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readU16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readNLE(bytes, offset, size) {
  if (size === 1) {
    return bytes[offset];
  }
  if (size === 2) {
    return readU16LE(bytes, offset);
  }
  if (size === 4) {
    return readU32LE(bytes, offset);
  }
  return null;
}

function findSignature(bytes, sigBytes, start) {
  outer: for (let i = start; i <= bytes.length - sigBytes.length; i++) {
    for (let j = 0; j < sigBytes.length; j++) {
      if (bytes[i + j] !== sigBytes[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

function decodeHeader(data, dateOffset = 0) {
  const chipInfo = [
    { sig: "3306A_FW", model: "Prom", maxSize: 0x20000 },
    { sig: "3306B_FW", model: "PromLP", maxSize: 0x20000 },
    { sig: "3308A_FW", model: "Prom19", maxSize: 0x20000 },
    { sig: "3328A_FW", model: "Prom21", maxSize: 0x20000 }
  ];
  let fwDate = "UNKNOWN";
  let fwSize = "UNKNOWN";
  let chipModel = "UNKNOWN";
  for (const info of chipInfo) {
    const sigBytes = new TextEncoder().encode(info.sig);
    if (findSignature(data, sigBytes, 0) !== -1) {
      chipModel = info.model;
      fwSize = info.maxSize;
      const base = 0x8C + Number(dateOffset || 0);
      if (base >= 0 && base + 5 < data.length) {
        const year = data[base];
        const month = data[base + 1];
        const day = data[base + 2];
        const v0 = data[base + 3];
        const v1 = data[base + 4];
        const v2 = data[base + 5];
        fwDate = `${toHex2(year)}${toHex2(month)}${toHex2(day)}_${toHex2(v0)}_${toHex2(v1)}_${toHex2(v2)}`;
      }
      break;
    }
  }
  return { chipModel, fwDate, fwSize };
}

function parseFirmwareInfo(buffer) {
  const bytes = new Uint8Array(buffer);
  const sig = new TextEncoder().encode("_PT_");
  let offset = 0;
  while (offset < bytes.length) {
    const pos = findSignature(bytes, sig, offset);
    if (pos === -1) {
      return null;
    }
    if (pos + 12 > bytes.length) {
      offset = pos + 1;
      continue;
    }
    const length = readU32LE(bytes, pos + 4);
    if (length < 12 || pos + length > bytes.length) {
      offset = pos + 1;
      continue;
    }
    const fwData = bytes.slice(pos, pos + length);
    const decoded = decodeHeader(fwData);
    if (decoded.chipModel !== "UNKNOWN") {
      return decoded;
    }
    offset = pos + length;
  }
  return null;
}

function matchesAscii(bytes, offset, text) {
  if (offset < 0 || offset >= bytes.length) {
    return false;
  }
  const sigBytes = new TextEncoder().encode(text);
  if (offset + sigBytes.length > bytes.length) {
    return false;
  }
  for (let i = 0; i < sigBytes.length; i++) {
    if (bytes[offset + i] !== sigBytes[i]) {
      return false;
    }
  }
  return true;
}

function parseSpiCcEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 16) {
    return null;
  }
  const sigs = [
    { sig: "3306A_RCFG", model: "Prom" },
    { sig: "3306B_RCFG", model: "PromLP" },
    { sig: "3308A_RCFG", model: "Prom19" },
    { sig: "3328A_RCFG", model: "Prom21" }
  ];
  const sigMatch = sigs.find((entry) => matchesAscii(bytes, 6, entry.sig));
  if (!sigMatch) {
    return null;
  }
  const headerLen = readU16LE(bytes, 4);
  if (headerLen < 16 || headerLen > bytes.length) {
    return null;
  }
  if (headerLen + 5 > bytes.length) {
    return null;
  }
  const header = bytes.slice(0, headerLen);
  const storedChecksum = bytes[headerLen];
  const storedCrc = readU32LE(bytes, headerLen + 1);
  const calcChecksum = sumBytes(header) & 0xFF;
  const calcCrc = crc32(header);
  const checksumOk = storedChecksum === calcChecksum;
  const crcOk = storedCrc === calcCrc;

  let entryStart = 16;
  if (headerLen >= 48) {
    entryStart = 48;
  }

  const entries = [];
  for (let offset = entryStart; offset + 4 <= headerLen; offset += 8) {
    if (bytes[offset] !== 0xCC) {
      let nonZero = false;
      for (let i = offset; i < Math.min(offset + 8, headerLen); i++) {
        if (bytes[i] !== 0) {
          nonZero = true;
          break;
        }
      }
      if (nonZero) {
        return {
          error: `Invalid CC entry marker at 0x${offset.toString(16).toUpperCase()}`,
          chipModel: sigMatch.model,
          checksumOk,
          crcOk
        };
      }
      continue;
    }
    const segOp = bytes[offset + 1];
    const seg = (segOp >> 4) & 0xF;
    const op = segOp & 0xF;
    if (![1, 2, 4].includes(op)) {
      return {
        error: `Invalid CC op ${op} at 0x${offset.toString(16).toUpperCase()}`,
        chipModel: sigMatch.model,
        checksumOk,
        crcOk
      };
    }
    const addr = readU16LE(bytes, offset + 2);
    const value = readNLE(bytes, offset + 4, op);
    if (value === null) {
      return {
        error: `Invalid CC value at 0x${offset.toString(16).toUpperCase()}`,
        chipModel: sigMatch.model,
        checksumOk,
        crcOk
      };
    }
    entries.push({
      seg,
      addr,
      value,
      size_bytes: op
    });
  }

  return {
    chipModel: sigMatch.model,
    headerLen,
    checksumOk,
    crcOk,
    entries
  };
}

function parseSpiImage(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 32) {
    return null;
  }
  const sigs = [
    { sig: "3306A_RCFG", model: "Prom" },
    { sig: "3306B_RCFG", model: "PromLP" },
    { sig: "3308A_RCFG", model: "Prom19" },
    { sig: "3328A_RCFG", model: "Prom21" }
  ];
  const sigMatch = sigs.find((entry) => matchesAscii(bytes, 6, entry.sig));
  if (!sigMatch) {
    return null;
  }
  const headerLen = readU16LE(bytes, 4);
  if (headerLen < 16 || headerLen > bytes.length) {
    return { error: "Invalid SPI header length", chipModel: sigMatch.model };
  }
  const bodySizeOffset = headerLen + 5;
  if (bodySizeOffset + 4 > bytes.length) {
    return { error: "SPI body size missing", chipModel: sigMatch.model };
  }
  const bodySize = readU32LE(bytes, bodySizeOffset);
  const bodyOffset = bodySizeOffset + 4;
  const bodyEnd = bodyOffset + bodySize;
  if (bodyEnd > bytes.length) {
    return { error: "SPI body extends past file size", chipModel: sigMatch.model };
  }
  const footer = chipFooter(sigMatch.model);
  const footerOffset = bodyEnd;
  const footerEnd = footerOffset + footer.length;
  if (footerEnd + 5 > bytes.length) {
    return { error: "SPI footer missing", chipModel: sigMatch.model };
  }
  let footerOk = true;
  for (let i = 0; i < footer.length; i++) {
    if (bytes[footerOffset + i] !== footer[i]) {
      footerOk = false;
      break;
    }
  }
  const body = bytes.slice(bodyOffset, bodyEnd);
  const storedBodyChecksum = bytes[footerEnd];
  const storedBodyCrc = readU32LE(bytes, footerEnd + 1);
  const calcBodyChecksum = sumBytes(body) & 0xFF;
  const calcBodyCrc = crc32(body);
  const fwInfo = decodeHeader(body, -0x0C);
  return {
    chipModel: sigMatch.model,
    headerLen,
    bodySize,
    body,
    footerOk,
    checksumOk: storedBodyChecksum === calcBodyChecksum,
    crcOk: storedBodyCrc === calcBodyCrc,
    fwInfo
  };
}

function applyCcEntries(entries, sourceName) {
  if (!Array.isArray(entries) || !entries.length) {
    logLine("No CC entries found in SPI header.");
    return;
  }
  if (!state.items.length) {
    logLine("No profile loaded yet.");
    return;
  }
  const addrIndex = new Map();
  state.items.forEach((item) => {
    const addr = parseHex(item.address);
    if (addr === null) {
      return;
    }
    const size = Number(item.size_bytes || 1);
    if (![1, 2, 4].includes(size)) {
      return;
    }
    const key = `${addr >>> 0}:${size}`;
    if (!addrIndex.has(key)) {
      addrIndex.set(key, []);
    }
    addrIndex.get(key).push(item);
  });

  const values = {};
  let matched = 0;
  let skipped = 0;
  entries.forEach((entry) => {
    const fullAddr = ((entry.seg & 0xF) << 16) | (entry.addr & 0xFFFF);
    const key = `${fullAddr >>> 0}:${entry.size_bytes}`;
    const items = addrIndex.get(key);
    if (!items || !items.length) {
      skipped += 1;
      return;
    }
    const val = normalizeHex(entry.value);
    items.forEach((item) => {
      values[item.code] = val;
      matched += 1;
    });
  });

  if (!Object.keys(values).length) {
    logLine("No CC entries matched registers in the current profile.");
    return;
  }
  applyProfileValues(values, sourceName);
  const label = sourceName ? `: ${sourceName}` : "";
  logLine(`SPI CC entries applied${label} (${matched} matches, ${skipped} unmatched).`);
}

function extractFirmware(buffer, options) {
  const bytes = new Uint8Array(buffer);
  const outputs = [];
  let offset = 0;
  const sig = new TextEncoder().encode("_PT_");

  while (offset < bytes.length) {
    const pos = findSignature(bytes, sig, offset);
    if (pos === -1) {
      break;
    }
    if (pos + 12 > bytes.length) {
      offset = pos + 1;
      continue;
    }
    const length = readU32LE(bytes, pos + 4);
    if (length < 12 || pos + length > bytes.length) {
      offset = pos + 1;
      continue;
    }

    const fwData = bytes.slice(pos, pos + length);
    const fwPos = `0x${pos.toString(16).toUpperCase()}`;
    const headerChecksum = readU32LE(bytes, pos + 8);
    const end = length & 0xFFFFFF00;
    const checksum = sumBytes(fwData.slice(0x0C, end));
    const isValid = options.ignoreChecksum || headerChecksum === checksum;

    const decoded = decodeHeader(fwData);
    const size = decoded.fwSize === "UNKNOWN"
      ? fwData.length - 0x0C
      : Math.min(decoded.fwSize, fwData.length - 0x0C);

    const bodySlice = fwData.slice(0x0C, 0x0C + size);

    if (!isValid) {
      logLine(`Found ${decoded.chipModel} at ${fwPos} with bad checksum, skipped.`);
      offset = pos + length;
      continue;
    }

    try {
      const header = generateHeader(decoded.chipModel, options.customInfo, options.xdata, options.prefix, options.suffix);
      const bodySize = size - 0x13 - header.length;
      if (bodySize < 0) {
        throw new Error("Header too large for body size");
      }
      const body = fwData.slice(0x0C, 0x0C + bodySize);
      const footer = chipFooter(decoded.chipModel);
      const bodyChecksum = checksum & 0xFF;
      const bodyCrc32 = crc32(body);
      let outData = concatBytes([
        header,
        packU32LE(bodySize),
        body,
        footer,
        new Uint8Array([bodyChecksum]),
        packU32LE(bodyCrc32)
      ]);
      const pad = (16 - (outData.length % 16)) % 16;
      if (pad) {
        outData = concatBytes([outData, new Uint8Array(pad).fill(0xFF)]);
      }
      const profileSuffix = options.profileName ? `${options.profileName}` : "";
      const name = `${profileSuffix}_${decoded.fwDate}_SPI.bin`;
      outputs.push({ name, data: outData });
      logLine(`Extracted ${decoded.chipModel} firmware at ${fwPos} -> ${name}`);
      return outputs;
    } catch (err) {
      logLine(`Header generation failed at ${fwPos}: ${err.message}`);
    }

    offset = pos + length;
  }
  if (!outputs.length) {
    logLine("No valid firmware images found.");
  }
  return outputs;
}

function generateHeader(chipModel, customInfo, xdata, prefix, suffix) {
  const chipMap = {
    "Prom": "3306A_RCFG",
    "Prom LP": "3306B_RCFG",
    "Prom19": "3308A_RCFG",
    "Prom21": "3328A_RCFG"
  };
  const sig = chipMap[chipModel];
  if (!sig) {
    throw new Error("Unsupported chip model");
  }
  let header = concatBytes([
    new Uint8Array([0, 0, 1, 0, 0xFF, 0xFF]),
    new TextEncoder().encode(sig)
  ]);

  const infoText = customInfo || "utils.kolabo.dev";
  if (infoText) {
    const info = new TextEncoder().encode(infoText.slice(0, 16));
    header = concatBytes([header, info]);
    const pad = (16 - (header.length % 16)) % 16;
    if (pad) {
      header = concatBytes([header, new Uint8Array(pad)]);
    }
    header = concatBytes([header, new Uint8Array(16)]);
  }

  const opMap = { 1: 1, 2: 2, 4: 4 };
  const normalizeEntry = (entry) => {
    if (!entry) {
      return null;
    }
    const seg = Number(entry.seg);
    const addr = Number(entry.addr);
    const value = Number(entry.value);
    const size = Number(entry.size_bytes);
    if (!Number.isFinite(seg) || !Number.isFinite(addr) || !Number.isFinite(value) || !Number.isFinite(size)) {
      return null;
    }
    if (seg < 0 || seg > 0xF) {
      return null;
    }
    if (addr < 0 || addr > 0xFFFF) {
      return null;
    }
    if (value < 0 || value > 0xFFFFFFFF) {
      return null;
    }
    if (!opMap[size]) {
      return null;
    }
    const normalized = { seg, addr, value, size_bytes: size };
    if (entry.sequence !== undefined && entry.sequence !== null) {
      const seqList = normalizeSequenceValues(entry.sequence);
      if (seqList) {
        const sizeLimit = Math.pow(2, size * 8) - 1;
        const filtered = seqList.filter((seq) => Number.isFinite(seq) && seq >= 0 && seq <= sizeLimit);
        if (filtered.length) {
          normalized.sequence = filtered;
        }
      }
    }
    return normalized;
  };
  const appendCcEntry = (head, entry) => {
    const op = opMap[entry.size_bytes];
    if (!op) {
      return head;
    }
    let next = concatBytes([
      head,
      new Uint8Array([0xCC, ((entry.seg & 0xF) << 4) | (op & 0xF)]),
      packU16LE(entry.addr),
      packNLE(entry.value, entry.size_bytes)
    ]);
    const pad = (8 - (next.length % 8)) % 8;
    if (pad) {
      next = concatBytes([next, new Uint8Array(pad)]);
    }
    return next;
  };

  const cleaned = [];
  (xdata || []).forEach((entry) => {
    const normalized = normalizeEntry(entry);
    if (normalized) {
      cleaned.push(normalized);
    }
  });
  const prefixEntry = normalizeEntry(prefix);
  const suffixEntry = normalizeEntry(suffix);

  if ((cleaned.length || prefixEntry || suffixEntry) && !infoText) {
    header = concatBytes([header, new Uint8Array(32)]);
  }

  if (prefixEntry) {
    header = appendCcEntry(header, prefixEntry);
  }
  cleaned.forEach((entry) => {
    const seqList = Array.isArray(entry.sequence) ? entry.sequence : [];
    let lastSeq = null;
    if (seqList.length) {
      seqList.forEach((seqVal) => {
        if (lastSeq !== null && seqVal === lastSeq) {
          return;
        }
        header = appendCcEntry(header, {
          seg: entry.seg,
          addr: entry.addr,
          value: seqVal,
          size_bytes: entry.size_bytes
        });
        lastSeq = seqVal;
      });
    }
    if (lastSeq === null || lastSeq !== entry.value) {
      header = appendCcEntry(header, entry);
    }
  });
  if (suffixEntry) {
    header = appendCcEntry(header, suffixEntry);
  }

  const length = header.length;
  header[4] = length & 0xFF;
  header[5] = (length >> 8) & 0xFF;
  const checksum = sumBytes(header) & 0xFF;
  const crc = crc32(header);
  header = concatBytes([header, new Uint8Array([checksum]), packU32LE(crc)]);
  return header;
}

function chipFooter(model) {
  const map = {
    "Prom": "3306A_FW",
    "PromLP": "3306B_FW",
    "Prom19": "3308A_FW",
    "Prom21": "3328A_FW"
  };
  const sig = map[model];
  if (!sig) {
    return new Uint8Array([]);
  }
  return new TextEncoder().encode(sig);
}

function concatBytes(parts) {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach((p) => {
    out.set(p, offset);
    offset += p.length;
  });
  return out;
}

function packU16LE(value) {
  return new Uint8Array([value & 0xFF, (value >> 8) & 0xFF]);
}

function packU32LE(value) {
  return new Uint8Array([
    value & 0xFF,
    (value >> 8) & 0xFF,
    (value >> 16) & 0xFF,
    (value >> 24) & 0xFF
  ]);
}

function packNLE(value, size) {
  const out = new Uint8Array(size);
  let v = value >>> 0;
  for (let i = 0; i < size; i++) {
    out[i] = v & 0xFF;
    v = v >>> 8;
  }
  return out;
}

function sumBytes(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) >>> 0;
  }
  return sum >>> 0;
}

function toHex2(value) {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    const idx = (crc ^ bytes[i]) & 0xFF;
    crc = (crc >>> 8) ^ CRC_TABLE[idx];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();
logLine("Promontory Flash Image Tool. Version: Beta 1");
logLine("For engineering use only.");
logLine("Licensed under the GNU General Public License v3.0 or later.");
logLine("Not responsible for the quality or reliability of this software.");
logLine("Util: <a href=\"https://utils.kolabo.dev/promfit\">https://utils.kolabo.dev/promfit</a>", { allowHtml: true });
logLine("Issue tracking: <a href=\"https://projects.kolabo.dev/ReProm/issues\">https://projects.kolabo.dev/ReProm/issues</a>", { allowHtml: true });
logLine("");
loadRegisterSets();
logLine("Ready.");
clearFirmwareSelection();
window.addEventListener("pageshow", () => {
  clearFirmwareSelection();
});
function updateTitle(filename) {
  const base = "Prom Flash Image Tool";
  els.titleText.textContent = filename ? `${base} - ${filename}` : base;
}

function clearFirmwareSelection() {
  els.uefiFile.value = "";
  state.hasFirmwareFile = false;
  state.fwInfo = null;
  updateTitle("");
}

function openCustomModal() {
  els.modalInput.value = state.customInfo || "";
  els.modal.classList.remove("hidden");
  setTimeout(() => els.modalInput.focus(), 0);
}

function closeCustomModal() {
  els.modal.classList.add("hidden");
}

function openCcModal(message) {
  if (message && els.ccBody) {
    els.ccBody.textContent = message;
  }
  els.ccModal.classList.remove("hidden");
  setTimeout(() => {
    if (els.ccCancel) {
      els.ccCancel.focus();
    }
  }, 0);
  return new Promise((resolve) => {
    const cleanup = () => {
      els.ccModal.classList.add("hidden");
      els.ccCancel.removeEventListener("click", onCancel);
      els.ccContinue.removeEventListener("click", onContinue);
      els.ccModal.removeEventListener("click", onBackdrop);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onContinue = () => {
      cleanup();
      resolve(true);
    };
    const onBackdrop = (event) => {
      if (event.target.classList.contains("modal-backdrop")) {
        onCancel();
      }
    };
    els.ccCancel.addEventListener("click", onCancel);
    els.ccContinue.addEventListener("click", onContinue);
    els.ccModal.addEventListener("click", onBackdrop);
  });
}

function openConfirmModal(title, message) {
  if (title && els.confirmTitle) {
    els.confirmTitle.textContent = title;
  }
  if (message && els.confirmBody) {
    els.confirmBody.textContent = message;
  }
  els.confirmModal.classList.remove("hidden");
  setTimeout(() => {
    if (els.confirmCancel) {
      els.confirmCancel.focus();
    }
  }, 0);
  return new Promise((resolve) => {
    const cleanup = () => {
      els.confirmModal.classList.add("hidden");
      els.confirmCancel.removeEventListener("click", onCancel);
      els.confirmContinue.removeEventListener("click", onContinue);
      els.confirmModal.removeEventListener("click", onBackdrop);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onContinue = () => {
      cleanup();
      resolve(true);
    };
    const onBackdrop = (event) => {
      if (event.target.classList.contains("modal-backdrop")) {
        onCancel();
      }
    };
    els.confirmCancel.addEventListener("click", onCancel);
    els.confirmContinue.addEventListener("click", onContinue);
    els.confirmModal.addEventListener("click", onBackdrop);
  });
}

function openHelpModal() {
  els.helpModal.classList.remove("hidden");
  setTimeout(() => els.helpClose.focus(), 0);
}

function closeHelpModal() {
  els.helpModal.classList.add("hidden");
}

els.modalCancel.addEventListener("click", closeCustomModal);
els.modalSave.addEventListener("click", () => {
  const trimmed = els.modalInput.value.slice(0, 16);
  state.customInfo = trimmed;
  closeCustomModal();
  logLine(`Custom Info set to: ${trimmed || "None"}`);
});
els.modal.addEventListener("click", (event) => {
  if (event.target.classList.contains("modal-backdrop")) {
    closeCustomModal();
  }
});

els.menuHelp.addEventListener("click", openHelpModal);
els.menuHelp.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openHelpModal();
  }
});
els.helpClose.addEventListener("click", closeHelpModal);
els.helpModal.addEventListener("click", (event) => {
  if (event.target.classList.contains("modal-backdrop")) {
    closeHelpModal();
  }
});

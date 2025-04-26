"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toIdentifier = toIdentifier;
exports.toString = toString;
exports.remove = remove;
exports.prefix = prefix;
exports.where = where;
exports.extractCode = extractCode;
exports.extractCodeDisplay = extractCodeDisplay;
exports.extractCodeExpression = extractCodeExpression;
exports.toCode = toCode;
function toIdentifier(value) {
    if (value == null)
        return "";
    const cleaned = value
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\\["'\\bfnrtv]/g, "")
        .replace(/"/g, "");
    return `"${cleaned.trim()}"`;
}
function toString(value) {
    if (value == null)
        return "";
    return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '"') + '"';
}
function remove(value, removeStr) {
    if (value == null)
        return "";
    return value.split(removeStr).join("");
}
function prefix(value, prefixStr) {
    if (value == null)
        return "";
    return prefixStr + value;
}
function where(rules, leftArg, rightArg, value) {
    const found = rules.find((r) => r.path === leftArg && r.value === rightArg);
    return found ? value : "";
}
function extractCode(value) {
    if (value == null)
        return "";
    const match = RegExp(/\$(\w+)#(\w+)\s+".*?"/).exec(value);
    if (match) {
        return `system "${match[1]}" code "${match[2]}"`;
    }
    return value;
}
function extractCodeDisplay(value) {
    if (value == null)
        return "";
    const match = RegExp(/^.*?"(.*?)"$/).exec(value);
    if (match) {
        return `"${match[1]}"`;
    }
    return value;
}
function extractCodeExpression(value) {
    if (value == null)
        return "";
    const match = RegExp(/Code\s*{\s*system:\s*'([^']+)',\s*code:\s*'([^']+)'\s*}/).exec(value);
    if (match) {
        return `system "${match[1]}" code "${match[2]}"`;
    }
    return value;
}
function toCode(value) {
    if (value == null)
        return "``";
    const cleaned = value.replace(/"/g, "").toLowerCase().replace(/\s+/g, "-");
    return `\`${cleaned}\``;
}
//# sourceMappingURL=fshPathFunctions.js.map
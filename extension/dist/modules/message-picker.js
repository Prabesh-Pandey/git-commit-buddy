"use strict";
/**
 * 📝 MESSAGE PICKER MODULE
 * Selects contextual commit messages from predefined templates
 */

const path = require("path");
const fs = require("fs");

// Load commit messages from JSON file
let commitMessages = null;

function loadMessages() {
    if (commitMessages) return commitMessages;
    
    try {
        const messagesPath = path.join(__dirname, '..', 'commit-messages.json');
        const data = fs.readFileSync(messagesPath, 'utf8');
        commitMessages = JSON.parse(data);
        return commitMessages;
    } catch (e) {
        // Fallback messages if JSON fails to load
        commitMessages = {
            byExtension: {},
            byFilename: {},
            byPath: {},
            generic: [
                "✨ Update code",
                "🔧 Minor changes",
                "📝 Small update"
            ],
            multiFile: [
                "✨ Update multiple files",
                "🔧 Batch changes"
            ]
        };
        return commitMessages;
    }
}

/**
 * Pick a random item from an array
 * @param {Array} arr 
 * @returns {*}
 */
function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Remove emoji from the start of a string
 * @param {string} str
 * @returns {string}
 */
function stripEmoji(str) {
    if (!str) return str;
    // Remove emojis and special symbols from the start
    // This handles Unicode emojis, symbols, and pictographs
    return str
        .replace(/^[\u{1F300}-\u{1F9FF}]+ */gu, '')  // Emojis
        .replace(/^[\u{2600}-\u{26FF}]+ */gu, '')    // Misc symbols
        .replace(/^[\u{2700}-\u{27BF}]+ */gu, '')    // Dingbats
        .replace(/^[^\p{L}\p{N}]+ */gu, '')          // Any non-letter/number at start
        .trim();
}

/**
 * Generate a contextual commit message based on file info
 * @param {string} filePath - Full path to the file
 * @param {object} options - Options
 * @param {boolean} options.useEmoji - Whether to include emoji
 * @param {boolean} options.isMultiFile - Multiple files changed
 * @returns {string} Commit message
 */
function getSmartMessage(filePath, options = {}) {
    const { useEmoji = true, isMultiFile = false } = options;
    const messages = loadMessages();
    
    // For multiple files
    if (isMultiFile) {
        let msg = pickRandom(messages.multiFile) || "✨ Update multiple files";
        return useEmoji ? msg : stripEmoji(msg);
    }
    
    const fileName = path.basename(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();
    const dirPath = filePath.toLowerCase();
    
    // 1. Try exact filename match first (e.g., package.json)
    for (const [name, msgList] of Object.entries(messages.byFilename || {})) {
        if (fileName === name.toLowerCase() || fileName.includes(name.toLowerCase())) {
            let msg = pickRandom(msgList);
            if (msg) return useEmoji ? msg : stripEmoji(msg);
        }
    }
    
    // 2. Try path-based match (e.g., components/, test/, utils/)
    for (const [pathKey, msgList] of Object.entries(messages.byPath || {})) {
        if (dirPath.includes(`/${pathKey}/`) || dirPath.includes(`\\${pathKey}\\`)) {
            let msg = pickRandom(msgList);
            if (msg) return useEmoji ? msg : stripEmoji(msg);
        }
    }
    
    // 3. Try extension match
    const extMessages = messages.byExtension?.[ext];
    if (extMessages && extMessages.length > 0) {
        let msg = pickRandom(extMessages);
        if (msg) return useEmoji ? msg : stripEmoji(msg);
    }
    
    // 4. Fall back to generic messages
    let msg = pickRandom(messages.generic) || "Update code";
    return useEmoji ? msg : stripEmoji(msg);
}

/**
 * Get a message with the filename appended
 * @param {string} filePath - Full path to the file
 * @param {object} options - Options
 * @returns {string} Commit message with filename
 */
function getSmartMessageWithFile(filePath, options = {}) {
    const baseMsg = getSmartMessage(filePath, options);
    const fileName = path.basename(filePath);
    
    // Don't duplicate if message already mentions the file
    if (baseMsg.toLowerCase().includes(fileName.toLowerCase())) {
        return baseMsg;
    }
    
    return `${baseMsg}: ${fileName}`;
}

module.exports = {
    getSmartMessage,
    getSmartMessageWithFile,
    loadMessages
};

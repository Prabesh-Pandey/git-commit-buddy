"use strict";
/**
 * 📊 CHANGE ANALYZER MODULE
 * Analyzes git diffs to determine change complexity and context
 * Enables intelligent, adaptive commit message generation
 */

/**
 * Change type enum
 */
const ChangeType = {
    FEAT: 'feat',       // New feature
    FIX: 'fix',         // Bug fix
    REFACTOR: 'refactor', // Code refactoring
    DOCS: 'docs',       // Documentation
    STYLE: 'style',     // Formatting, whitespace
    TEST: 'test',       // Tests
    CHORE: 'chore',     // Maintenance
    PERF: 'perf',       // Performance
    BUILD: 'build',     // Build system
    CI: 'ci',           // CI/CD
    SECURITY: 'security' // Security fix
};

/**
 * Complexity levels
 */
const Complexity = {
    TRIVIAL: 'trivial',   // 1-5 lines, typos, minor fixes
    SIMPLE: 'simple',     // 6-20 lines, small changes
    MODERATE: 'moderate', // 21-50 lines, feature additions
    COMPLEX: 'complex',   // 51-150 lines, significant changes
    MAJOR: 'major'        // 150+ lines, large refactors
};

/**
 * Analyze a git diff and extract meaningful metrics
 * @param {string} diffText - Git diff output
 * @param {string} fileName - Name of the changed file
 * @returns {object} Analysis results
 */
function analyzeDiff(diffText, fileName) {
    const analysis = {
        linesAdded: 0,
        linesRemoved: 0,
        totalChanges: 0,
        filesChanged: 1,
        complexity: Complexity.TRIVIAL,
        changeType: ChangeType.CHORE,
        scope: null,
        isBreakingChange: false,
        hasNewFunction: false,
        hasNewClass: false,
        hasImportChanges: false,
        hasDependencyChanges: false,
        hasApiChanges: false,
        hasConfigChanges: false,
        hasTestChanges: false,
        keywords: [],
        suggestedLength: 'short' // 'short', 'medium', 'detailed'
    };

    if (!diffText) {
        return analysis;
    }

    const lines = diffText.split('\n');
    
    // Count added/removed lines
    for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
            analysis.linesAdded++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            analysis.linesRemoved++;
        }
    }
    
    analysis.totalChanges = analysis.linesAdded + analysis.linesRemoved;

    // Count files if multiple diffs
    const fileMatches = diffText.match(/^diff --git/gm);
    if (fileMatches) {
        analysis.filesChanged = fileMatches.length;
    }

    // Determine complexity based on changes
    analysis.complexity = determineComplexity(analysis.totalChanges, analysis.filesChanged);
    
    // Analyze content patterns
    analyzeContentPatterns(diffText, fileName, analysis);
    
    // Determine change type
    analysis.changeType = detectChangeType(diffText, fileName, analysis);
    
    // Extract scope from file path
    analysis.scope = extractScope(fileName);
    
    // Determine suggested message length
    analysis.suggestedLength = determineSuggestedLength(analysis);

    return analysis;
}

/**
 * Determine complexity level from metrics
 */
function determineComplexity(totalChanges, filesChanged) {
    // Multi-file changes increase complexity
    const adjustedChanges = totalChanges + (filesChanged - 1) * 10;
    
    if (adjustedChanges <= 5) return Complexity.TRIVIAL;
    if (adjustedChanges <= 20) return Complexity.SIMPLE;
    if (adjustedChanges <= 50) return Complexity.MODERATE;
    if (adjustedChanges <= 150) return Complexity.COMPLEX;
    return Complexity.MAJOR;
}

/**
 * Analyze diff content for specific patterns
 */
function analyzeContentPatterns(diffText, fileName, analysis) {
    const lowerDiff = diffText.toLowerCase();
    const lowerFile = fileName.toLowerCase();
    
    // Check for new functions/classes
    if (/^\+\s*(function|const\s+\w+\s*=\s*(?:async\s*)?\(|class\s+\w+)/m.test(diffText)) {
        analysis.hasNewFunction = true;
    }
    if (/^\+\s*class\s+\w+/m.test(diffText)) {
        analysis.hasNewClass = true;
    }
    
    // Check for import changes
    if (/^\+\s*(import|require|from\s+['"])/m.test(diffText)) {
        analysis.hasImportChanges = true;
    }
    
    // Check for dependency changes
    if (lowerFile.includes('package.json') || 
        lowerFile.includes('requirements.txt') ||
        lowerFile.includes('cargo.toml') ||
        lowerFile.includes('go.mod')) {
        analysis.hasDependencyChanges = true;
    }
    
    // Check for API changes
    if (/^\+.*(?:api|endpoint|route|handler)/mi.test(diffText) ||
        lowerFile.includes('api') || 
        lowerFile.includes('routes')) {
        analysis.hasApiChanges = true;
    }
    
    // Check for config changes
    if (lowerFile.includes('config') || 
        lowerFile.endsWith('.json') ||
        lowerFile.endsWith('.yml') ||
        lowerFile.endsWith('.yaml') ||
        lowerFile.endsWith('.env')) {
        analysis.hasConfigChanges = true;
    }
    
    // Check for test changes
    if (lowerFile.includes('test') || 
        lowerFile.includes('spec') ||
        lowerFile.includes('__tests__')) {
        analysis.hasTestChanges = true;
    }
    
    // Check for breaking changes
    if (/breaking|deprecated|removed|deleted|migration/i.test(diffText) ||
        /^-\s*export\s+/m.test(diffText)) {
        analysis.isBreakingChange = true;
    }
    
    // Extract keywords from diff context
    const keywordMatches = diffText.match(/(?:fix|add|update|remove|refactor|improve|optimize|enhance|implement)\s+\w+/gi);
    if (keywordMatches) {
        analysis.keywords = [...new Set(keywordMatches.slice(0, 5))];
    }
}

/**
 * Detect the primary type of change
 */
function detectChangeType(diffText, fileName, analysis) {
    const lowerFile = fileName.toLowerCase();
    const lowerDiff = diffText.toLowerCase();
    
    // Test files
    if (analysis.hasTestChanges) {
        return ChangeType.TEST;
    }
    
    // Documentation
    if (lowerFile.endsWith('.md') || 
        lowerFile.includes('readme') ||
        lowerFile.includes('docs/') ||
        lowerFile.includes('documentation')) {
        return ChangeType.DOCS;
    }
    
    // CI/CD
    if (lowerFile.includes('.github/') ||
        lowerFile.includes('jenkins') ||
        lowerFile.includes('gitlab-ci') ||
        lowerFile.includes('circleci')) {
        return ChangeType.CI;
    }
    
    // Build system
    if (lowerFile.includes('webpack') ||
        lowerFile.includes('vite') ||
        lowerFile.includes('rollup') ||
        lowerFile.includes('dockerfile') ||
        lowerFile.includes('makefile')) {
        return ChangeType.BUILD;
    }
    
    // Style/formatting only
    if (analysis.totalChanges < 10 && 
        !analysis.hasNewFunction &&
        /^\+\s*$|^-\s*$/m.test(diffText)) {
        return ChangeType.STYLE;
    }
    
    // Bug fixes - look for fix indicators
    if (/fix|bug|error|issue|crash|problem/i.test(lowerDiff) ||
        /fix|bug|issue|#\d+/i.test(diffText)) {
        return ChangeType.FIX;
    }
    
    // Performance
    if (/perf|performance|optimize|faster|speed|cache/i.test(lowerDiff)) {
        return ChangeType.PERF;
    }
    
    // Security
    if (/security|vuln|cve|auth|permission|sanitize/i.test(lowerDiff)) {
        return ChangeType.SECURITY;
    }
    
    // Refactoring - changes without new features
    if (analysis.linesRemoved > analysis.linesAdded * 0.5 &&
        !analysis.hasNewFunction &&
        !analysis.hasNewClass) {
        return ChangeType.REFACTOR;
    }
    
    // New features
    if (analysis.hasNewFunction || analysis.hasNewClass || analysis.linesAdded > 20) {
        return ChangeType.FEAT;
    }
    
    // Default: chore for small changes, feat for larger ones
    return analysis.totalChanges > 15 ? ChangeType.FEAT : ChangeType.CHORE;
}

/**
 * Extract scope from file path
 */
function extractScope(fileName) {
    if (!fileName) return null;
    
    const lowerPath = fileName.toLowerCase();
    
    // Common scope patterns
    const scopePatterns = [
        { pattern: /components?[/\\](\w+)/i, group: 1 },
        { pattern: /modules?[/\\](\w+)/i, group: 1 },
        { pattern: /services?[/\\](\w+)/i, group: 1 },
        { pattern: /api[/\\](\w+)/i, group: 1 },
        { pattern: /pages?[/\\](\w+)/i, group: 1 },
        { pattern: /views?[/\\](\w+)/i, group: 1 },
        { pattern: /utils?[/\\]/i, scope: 'utils' },
        { pattern: /helpers?[/\\]/i, scope: 'helpers' },
        { pattern: /hooks?[/\\]/i, scope: 'hooks' },
        { pattern: /store[/\\]/i, scope: 'store' },
        { pattern: /auth/i, scope: 'auth' },
        { pattern: /config/i, scope: 'config' },
        { pattern: /test|spec/i, scope: 'test' },
        { pattern: /docs?[/\\]/i, scope: 'docs' }
    ];
    
    for (const { pattern, group, scope } of scopePatterns) {
        const match = lowerPath.match(pattern);
        if (match) {
            return scope || (group && match[group]) || null;
        }
    }
    
    // Use file extension as fallback for certain types
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'css' || ext === 'scss' || ext === 'sass') return 'styles';
    if (ext === 'md') return 'docs';
    
    return null;
}

/**
 * Determine suggested message length based on analysis
 */
function determineSuggestedLength(analysis) {
    // Breaking changes always need detail
    if (analysis.isBreakingChange) {
        return 'detailed';
    }
    
    // Trivial changes get short messages
    if (analysis.complexity === Complexity.TRIVIAL) {
        return 'short';
    }
    
    // Simple changes get short to medium
    if (analysis.complexity === Complexity.SIMPLE) {
        return analysis.hasNewFunction ? 'medium' : 'short';
    }
    
    // Moderate complexity gets medium
    if (analysis.complexity === Complexity.MODERATE) {
        return 'medium';
    }
    
    // Complex and major changes get detailed
    return 'detailed';
}

/**
 * Generate context hints for AI based on analysis
 */
function generateContextHints(analysis) {
    const hints = [];
    
    hints.push(`Change complexity: ${analysis.complexity} (${analysis.totalChanges} lines, ${analysis.filesChanged} file(s))`);
    hints.push(`Detected type: ${analysis.changeType}`);
    
    if (analysis.scope) {
        hints.push(`Scope: ${analysis.scope}`);
    }
    
    if (analysis.isBreakingChange) {
        hints.push('⚠️ This appears to be a BREAKING CHANGE');
    }
    
    if (analysis.hasNewFunction || analysis.hasNewClass) {
        hints.push('New functions/classes detected');
    }
    
    if (analysis.hasDependencyChanges) {
        hints.push('Dependency changes detected');
    }
    
    if (analysis.hasApiChanges) {
        hints.push('API/endpoint changes detected');
    }
    
    return hints;
}

module.exports = {
    analyzeDiff,
    generateContextHints,
    ChangeType,
    Complexity
};

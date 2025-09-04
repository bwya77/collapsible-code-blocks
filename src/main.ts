import { Plugin, App, PluginSettingTab, Setting, ButtonComponent, Editor, MarkdownView as MView } from 'obsidian';
import { CollapsibleCodeBlockSettings, DEFAULT_SETTINGS, ExtendedApp } from './types';
import { setupEditView, FoldWidget, toggleFoldEffect } from './editView';
import { setupReadView, type ReadViewAPI } from './readView';

export default class CollapsibleCodeBlockPlugin extends Plugin {
    private contentObserver: MutationObserver;
    public settings: CollapsibleCodeBlockSettings;
    private readViewAPI: ReadViewAPI;

    async onload() {
        await this.loadSettings();
        this.updateScrollSetting();
        this.updateButtonAlignment();
        this.updateButtonTransparency();
        // Initialize CSS variables
        document.documentElement.style.setProperty('--collapsed-lines', this.settings.collapsedLines.toString());
        // Set up editor view with app instance
        const editorExtensions = setupEditView(this.settings, this.app);
        this.registerEditorExtension(editorExtensions);
        
        // Register command for keyboard shortcut
        this.addCommand({
            id: 'toggle-code-block-at-cursor',
            name: 'Toggle code block containing cursor',
            editorCheckCallback: (checking, editor, view) => {
                if (checking) {
                    // Check if we're in source mode
                    const editorView = (editor as any).cm;
                    return editorView != null;
                }
                this.toggleCodeBlockAtCursor(editor);
                return true;
            },
            hotkeys: [{
                modifiers: ['Mod', 'Shift'],
                key: 'K'
            }]
        });
        this.registerEvent(
    this.app.workspace.on('file-open', () => {
        FoldWidget.clearInitializedBlocks();
    })
);

        // Set up reading view
        this.readViewAPI = setupReadView(this.app as ExtendedApp, this.settings);
        this.contentObserver = this.readViewAPI.setupContentObserver(this.readViewAPI.processNewCodeBlocks);

        this.registerMarkdownPostProcessor((element) => {
            this.readViewAPI.processNewCodeBlocks(element);
            this.contentObserver.observe(element, { childList: true, subtree: true });
        });

        this.addSettingTab(new CollapsibleCodeBlockSettingTab(this.app as ExtendedApp, this));
    }

    updateScrollSetting(): void {
        document.body.setAttribute('data-ccb-horizontal-scroll', this.settings.enableHorizontalScroll.toString());
    }

    updateButtonAlignment(): void {
        document.body.setAttribute('data-button-alignment', this.settings.buttonAlignment);
    }

    updateButtonTransparency(): void {
        document.body.setAttribute('data-transparent-button', this.settings.transparentButton.toString());
    }

    toggleCodeBlockAtCursor(editor: Editor): void {
        // Get the CodeMirror 6 EditorView instance
        const editorView = (editor as any).cm;
        if (!editorView) {
            return;
        }
        
        const state = editorView.state;
        const cursorPos = state.selection.main.head;
        const doc = state.doc;
        
        // Find the line containing the cursor
        const cursorLine = doc.lineAt(cursorPos);
        
        // Find code block boundaries
        let codeBlockStart = -1;
        let codeBlockEnd = -1;
        let startLine = null;
        let endLine = null;
        
        // Check if cursor is already on a fence line
        if (cursorLine.text.trim().startsWith('```')) {
            startLine = cursorLine;
            // Search forward for the closing fence
            for (let i = cursorLine.number + 1; i <= doc.lines; i++) {
                const line = doc.line(i);
                if (line.text.trim().startsWith('```')) {
                    endLine = line;
                    break;
                }
            }
            if (endLine) {
                codeBlockStart = startLine.from;
                codeBlockEnd = endLine.to;
            }
        } else {
            // Search backwards for opening fence
            for (let i = cursorLine.number - 1; i >= 1; i--) {
                const line = doc.line(i);
                if (line.text.trim().startsWith('```')) {
                    startLine = line;
                    // Now search forward from the next line for closing fence
                    for (let j = i + 1; j <= doc.lines; j++) {
                        const searchLine = doc.line(j);
                        if (searchLine.text.trim().startsWith('```')) {
                            endLine = searchLine;
                            break;
                        }
                    }
                    // Check if cursor is between the fences
                    if (endLine && cursorPos >= startLine.from && cursorPos <= endLine.to) {
                        codeBlockStart = startLine.from;
                        codeBlockEnd = endLine.to;
                        break;
                    } else {
                        // Reset and keep searching
                        startLine = null;
                        endLine = null;
                    }
                }
            }
        }
        
        // If we found a valid code block, trigger the toggle
        if (codeBlockStart !== -1 && codeBlockEnd !== -1) {
            // Dispatch the toggle effect - the effect handler will manage the toggle state
            editorView.dispatch({
                effects: toggleFoldEffect.of({
                    from: codeBlockStart,
                    to: codeBlockEnd
                })
            });
        }
    }

    private sanitizeIcon(icon: string): string {
        const cleaned = icon.trim();
        if (cleaned.length <= 2) {
            return cleaned;
        } else {
            // Check if it's a valid Obsidian icon name
            if ((this.app as any).customIcons && (this.app as any).customIcons.exists(cleaned)) {
                return cleaned;
            }
            return DEFAULT_SETTINGS.collapseIcon;
        }
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...loadedData,
            collapseIcon: this.sanitizeIcon(loadedData?.collapseIcon ?? DEFAULT_SETTINGS.collapseIcon),
            expandIcon: this.sanitizeIcon(loadedData?.expandIcon ?? DEFAULT_SETTINGS.expandIcon)
        };
    }

    async saveSettings() {
        this.settings.collapseIcon = this.sanitizeIcon(this.settings.collapseIcon);
        this.settings.expandIcon = this.sanitizeIcon(this.settings.expandIcon);
        await this.saveData(this.settings);
    }

    onunload() {
        this.contentObserver?.disconnect();
        document.body.removeAttribute('data-ccb-horizontal-scroll');
        document.body.removeAttribute('data-button-alignment');
        document.body.removeAttribute('data-transparent-button');
    }
}

class CollapsibleCodeBlockSettingTab extends PluginSettingTab {
    plugin: CollapsibleCodeBlockPlugin;
    app: ExtendedApp;

    constructor(app: App, plugin: CollapsibleCodeBlockPlugin) {
        super(app, plugin);
        this.app = app as ExtendedApp;
        this.plugin = plugin;
    }

    display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
        .setName('Default collapsed state')
        .setDesc('Should code blocks be collapsed by default?')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.defaultCollapsed)
            .onChange(async (value) => {
                this.plugin.settings.defaultCollapsed = value;
                await this.plugin.saveSettings();
            }));

    new Setting(containerEl)
        .setName('Collapse icon')
        .setDesc('Icon to show when code block is expanded (single character or emoji only)')
        .addText(text => text
            .setValue(this.plugin.settings.collapseIcon)
            .onChange(async (value) => {
                const sanitized = value.trim();
                if (sanitized.length <= 2) {
                    this.plugin.settings.collapseIcon = sanitized || DEFAULT_SETTINGS.collapseIcon;
                    await this.plugin.saveSettings();
                }
            }));

    new Setting(containerEl)
        .setName('Expand icon')
        .setDesc('Icon to show when code block is collapsed (single character or emoji only)')
        .addText(text => text
            .setValue(this.plugin.settings.expandIcon)
            .onChange(async (value) => {
                const sanitized = value.trim();
                if (sanitized.length <= 2) {
                    this.plugin.settings.expandIcon = sanitized || DEFAULT_SETTINGS.expandIcon;
                    await this.plugin.saveSettings();
                }
            }));

    new Setting(containerEl)
        .setName('Enable horizontal scrolling')
        .setDesc('Allow code blocks to scroll horizontally instead of wrapping text.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableHorizontalScroll)
            .onChange(async (value) => {
                this.plugin.settings.enableHorizontalScroll = value;
                await this.plugin.saveSettings();
                this.plugin.updateScrollSetting();
            }));

    const collapsedLinesSetting = new Setting(containerEl)
        .setName('Collapsed lines')
        .setDesc('Number of lines visible when code block is collapsed');

    // No reload button needed as settings will apply automatically

    collapsedLinesSetting.addText(text => {
        text
            .setValue(this.plugin.settings.collapsedLines.toString())
            .onChange(async (value) => {
                const numericValue = parseInt(value, 10);
                this.plugin.settings.collapsedLines = isNaN(numericValue) || numericValue < 0 ? 0 : numericValue;
                await this.plugin.saveSettings();
                
                // Apply settings immediately
                document.documentElement.style.setProperty('--collapsed-lines', this.plugin.settings.collapsedLines.toString());
            });
    });

    new Setting(containerEl)
        .setName('Button alignment')
        .setDesc('Align the collapse/expand button to the left or right side of the code block')
        .addDropdown(dropdown => dropdown
            .addOption('left', 'Left')
            .addOption('right', 'Right')
            .setValue(this.plugin.settings.buttonAlignment)
            .onChange(async (value: 'left' | 'right') => {
                this.plugin.settings.buttonAlignment = value;
                await this.plugin.saveSettings();
                
                // Apply alignment immediately
                this.plugin.updateButtonAlignment();
            }));

    new Setting(containerEl)
        .setName('Transparent button')
        .setDesc('Make the collapse/expand button transparent until hovered over')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.transparentButton)
            .onChange(async (value) => {
                this.plugin.settings.transparentButton = value;
                await this.plugin.saveSettings();
                
                // Apply transparency immediately
                this.plugin.updateButtonTransparency();
            }));
            
    new Setting(containerEl)
        .setName('Keyboard shortcut')
        .setDesc('Toggle the code block containing the cursor. Default: Cmd/Ctrl+Shift+K. You can customize this in Settings → Hotkeys')
        .addButton(button => button
            .setButtonText('Open Hotkey Settings')
            .onClick(() => {
                // @ts-ignore
                this.app.setting.openTabById('hotkeys');
                // @ts-ignore  
                const searchEl = this.app.setting.activeTab?.searchComponent?.inputEl;
                if (searchEl) {
                    searchEl.value = 'Toggle code block containing cursor';
                    searchEl.dispatchEvent(new Event('input'));
                }
            }));
    }
}
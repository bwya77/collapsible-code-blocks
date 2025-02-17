import { Plugin, App, PluginSettingTab, Setting, ButtonComponent } from 'obsidian';
import { CollapsibleCodeBlockSettings, DEFAULT_SETTINGS, ExtendedApp } from './types';
import { setupEditView, FoldWidget } from './editView';
import { setupReadView, type ReadViewAPI } from './readView';

export default class CollapsibleCodeBlockPlugin extends Plugin {
    private contentObserver: MutationObserver;
    public settings: CollapsibleCodeBlockSettings;
    private readViewAPI: ReadViewAPI;

    async onload() {
        await this.loadSettings();
        this.updateScrollSetting();
        // Set up editor view with app instance
        const editorExtensions = setupEditView(this.settings, this.app);
        this.registerEditorExtension(editorExtensions);
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
        document.body.classList.toggle('horizontal-scroll', this.settings.enableHorizontalScroll);
    }

    private sanitizeIcon(icon: string): string {
        const cleaned = icon.trim();
        return cleaned.length <= 2 ? cleaned : DEFAULT_SETTINGS.collapseIcon;
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

    let reloadButton: ButtonComponent | null = null;

    collapsedLinesSetting.addButton(btn => {
        reloadButton = btn
            .setButtonText('Apply changes (reload plugin)')
            .setCta();
        
        reloadButton.buttonEl.classList.add('hidden');

        reloadButton.onClick(async () => {
            const pluginId = this.plugin.manifest.id;
            try {
                // Try the new API method names first
                // @ts-ignore
                await this.app.plugins.disablePlugin(pluginId);
                // @ts-ignore
                await this.app.plugins.enablePlugin(pluginId);
                
                // Re-open the settings tab
                // @ts-ignore
                this.app.setting.openTabById(pluginId);
            } catch (error) {
                console.error('Error reloading plugin:', error);
                // Fallback to alternative API if needed
                try {
                    const plugins = (this.app as any).plugins;
                    if (typeof plugins.disable === 'function') {
                        await plugins.disable(pluginId);
                        await plugins.enable(pluginId);
                        // Re-open the settings tab
                        // @ts-ignore
                        this.app.setting.openTabById(pluginId);
                    } else {
                        console.error('Unable to reload plugin: API methods not found');
                    }
                } catch (fallbackError) {
                    console.error('Error in fallback:', fallbackError);
                }
            }
        });
    });

    collapsedLinesSetting.addText(text => {
        text
            .setValue(this.plugin.settings.collapsedLines.toString())
            .onChange(async (value) => {
                const numericValue = parseInt(value, 10);
                this.plugin.settings.collapsedLines = isNaN(numericValue) || numericValue < 0 ? 0 : numericValue;
                await this.plugin.saveSettings();

                if (reloadButton) {
                    reloadButton.buttonEl.classList.remove('hidden');
                }
            });
    });
    }
}
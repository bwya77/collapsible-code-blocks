import {
    Plugin,
    MarkdownView,
    PluginSettingTab,
    App,
    Setting,
    ButtonComponent
} from 'obsidian';

interface CollapsibleCodeBlockSettings {
    defaultCollapsed: boolean;
    collapseIcon: string;
    expandIcon: string;
    enableHorizontalScroll: boolean;
    collapsedLines: number;
}

const DEFAULT_SETTINGS: CollapsibleCodeBlockSettings = {
    defaultCollapsed: false,
    collapseIcon: '▼',
    expandIcon: '▶',
    enableHorizontalScroll: true,
    collapsedLines: 0
};

export default class CollapsibleCodeBlockPlugin extends Plugin {
    private contentObserver: MutationObserver;
    private viewportObserver: IntersectionObserver;
    public settings: CollapsibleCodeBlockSettings;

    async onload() {
        await this.loadSettings();
        this.updateScrollSetting();

        // Single viewport observer for all code blocks
        this.viewportObserver = new IntersectionObserver(
            (entries) => entries.forEach(entry => {
                if (entry.isIntersecting && entry.target instanceof HTMLElement) {
                    this.updateCodeBlockVisibility(entry.target);
                }
            }),
            { rootMargin: "100px", threshold: [0, 0.5, 1.0] }
        );

        // Single content observer for the entire preview
        this.contentObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    this.processNewCodeBlocks(mutation.target as HTMLElement);
                }
            });
        });

        this.registerMarkdownPostProcessor((element) => {
            this.processNewCodeBlocks(element);
            this.contentObserver.observe(element, { childList: true, subtree: true });
        });

        this.addSettingTab(new CollapsibleCodeBlockSettingsTab(this.app, this));
    }

    private processNewCodeBlocks(element: HTMLElement) {
        element.querySelectorAll('pre:not(.has-collapse-button)').forEach(pre => {
            if (!(pre instanceof HTMLElement)) return;
            
            pre.classList.add('has-collapse-button');
            this.setupCodeBlock(pre);
            this.viewportObserver.observe(pre);
        });
    }

    private setupCodeBlock(pre: HTMLElement) {
        document.documentElement.style.setProperty('--collapsed-lines', this.settings.collapsedLines.toString());
        
        const toggleButton = this.createToggleButton();
        pre.insertBefore(toggleButton, pre.firstChild);

        if (this.settings.defaultCollapsed) {
            pre.classList.add('collapsed');
            toggleButton.textContent = this.settings.expandIcon;
            this.updateCodeBlockVisibility(pre);
        }
    }

    private createToggleButton(): HTMLElement {
        const button = document.createElement('div');
        button.className = 'code-block-toggle';
        button.textContent = this.settings.collapseIcon;
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.setAttribute('aria-label', 'Toggle code block visibility');
        
        const toggleHandler = (e: Event) => {
            e.preventDefault();
            const pre = (e.target as HTMLElement).closest('pre');
            if (!pre) return;

            pre.classList.toggle('collapsed');
            this.updateCodeBlockVisibility(pre);
            
            const isCollapsed = pre.classList.contains('collapsed');
            button.textContent = isCollapsed ? this.settings.expandIcon : this.settings.collapseIcon;
            button.setAttribute('aria-expanded', (!isCollapsed).toString());
            this.app.workspace.requestSaveLayout();
        };

        button.addEventListener('click', toggleHandler);
        button.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleHandler(e);
            }
        });

        return button;
    }

    private updateCodeBlockVisibility(pre: HTMLElement) {
        const isCollapsed = pre.classList.contains('collapsed');
        
        // Update following elements' visibility and positioning
        let elements: HTMLElement[] = [];
        let curr = pre.nextElementSibling;
        
        while (curr && !(curr instanceof HTMLPreElement)) {
            if (curr instanceof HTMLElement) {
                elements.push(curr);
                // Store original display if not already stored
                if (!curr.dataset.originalDisplay) {
                    curr.dataset.originalDisplay = getComputedStyle(curr).display;
                }
            }
            curr = curr.nextElementSibling;
        }

        // Force layout recalculation
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView?.previewMode?.containerEl) {
            const previewElement = markdownView.previewMode.containerEl;

            setTimeout(() => {
                // Update element visibility
                elements.forEach(el => {
                    if (isCollapsed) {
                        el.classList.add('element-hidden');
                        el.classList.remove('element-visible', 'element-spacing');
                    } else {
                        el.classList.remove('element-hidden');
                        el.classList.add('element-visible');
                        
                        // Check if element needs repositioning
                        const preRect = pre.getBoundingClientRect();
                        const elRect = el.getBoundingClientRect();
                        if (elRect.top < preRect.bottom) {
                            document.documentElement.style.setProperty('--element-spacing', `${preRect.bottom - elRect.top + 10}px`);
                            el.classList.add('element-spacing');
                        }
                    }
                });

                // Force multiple viewport recalculations
                void previewElement.offsetHeight;
                
                // Trigger scroll events to force Obsidian to update
                previewElement.dispatchEvent(new Event('scroll', { bubbles: true }));
                window.dispatchEvent(new Event('resize'));

                // Additional scroll juggling to force refresh
                const currentScroll = previewElement.scrollTop;
                if (currentScroll > 0) {
                    previewElement.scrollTop = currentScroll - 1;
                    requestAnimationFrame(() => {
                        previewElement.scrollTop = currentScroll;
                        // One final scroll event after everything else
                        setTimeout(() => {
                            previewElement.dispatchEvent(new Event('scroll', { bubbles: true }));
                        }, 50);
                    });
                } else {
                    previewElement.scrollTop = 1;
                    requestAnimationFrame(() => {
                        previewElement.scrollTop = 0;
                        setTimeout(() => {
                            previewElement.dispatchEvent(new Event('scroll', { bubbles: true }));
                        }, 50);
                    });
                }
            }, 50);
        }
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
            // Sanitize icons when loading
            collapseIcon: this.sanitizeIcon(loadedData?.collapseIcon ?? DEFAULT_SETTINGS.collapseIcon),
            expandIcon: this.sanitizeIcon(loadedData?.expandIcon ?? DEFAULT_SETTINGS.expandIcon)
        };
    }

    async saveSettings() {
        // Sanitize before saving
        this.settings.collapseIcon = this.sanitizeIcon(this.settings.collapseIcon);
        this.settings.expandIcon = this.sanitizeIcon(this.settings.expandIcon);
        await this.saveData(this.settings);
    }

    onunload() {
        this.contentObserver?.disconnect();
        this.viewportObserver?.disconnect();
    }
}

class CollapsibleCodeBlockSettingsTab extends PluginSettingTab {
    plugin: CollapsibleCodeBlockPlugin;

    constructor(app: App, plugin: CollapsibleCodeBlockPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Collapsible Code Block Settings' });

        new Setting(containerEl)
            .setName('Default Collapsed State')
            .setDesc('Should code blocks be collapsed by default?')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.defaultCollapsed)
                .onChange(async (value) => {
                    this.plugin.settings.defaultCollapsed = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Collapse Icon')
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
            .setName('Expand Icon')
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
            .setName('Enable Horizontal Scrolling')
            .setDesc('Allow code blocks to scroll horizontally instead of wrapping text.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableHorizontalScroll)
                .onChange(async (value) => {
                    this.plugin.settings.enableHorizontalScroll = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateScrollSetting();
                }));

        const collapsedLinesSetting = new Setting(containerEl)
            .setName('Collapsed Lines')
            .setDesc('Number of lines visible when code block is collapsed');

        let reloadButton: ButtonComponent | null = null;

        collapsedLinesSetting.addButton(btn => {
            reloadButton = btn
                .setButtonText('Apply changes (reload plugin)')
                .setCta();
            
            reloadButton.buttonEl.classList.add('hidden');

            reloadButton.onClick(async () => {
                const pluginId = this.plugin.manifest.id;
                // @ts-ignore
                await this.app.plugins.disablePlugin(pluginId);
                // @ts-ignore
                await this.app.plugins.enablePlugin(pluginId);
                
                // Re-open the settings
                // @ts-ignore
                this.app.setting.openTabById(pluginId);
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
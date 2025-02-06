import {
    Plugin,
    MarkdownView,
    PluginSettingTab,
    App,
    Setting,
    ButtonComponent,
    Editor,
    EditorPosition
} from 'obsidian';
import { StateField, StateEffect, Extension, EditorState, Transaction } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

const createFoldField = (settings: CollapsibleCodeBlockSettings) => StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(folds: DecorationSet, tr: Transaction) {
        folds = folds.map(tr.changes);
        
        for (let effect of tr.effects) {
            if (effect.is(toggleFoldEffect)) {
                const { from, to, defaultState } = effect.value;
                let hasFold = false;
                
                folds.between(from, to, () => { hasFold = true });
                
                if ((hasFold && !defaultState) || (defaultState === false)) {
                    folds = folds.update({
                        filter: (fromPos, toPos) => fromPos !== from || toPos !== to
                    });
                } else {
                    const deco = Decoration.replace({
                        block: true,
                        inclusive: true,
                        widget: new class extends WidgetType {
                            toDOM(view: EditorView) {
                                const container = document.createElement('div');
                                container.className = 'code-block-folded';
                                container.style.setProperty('--collapsed-lines', settings.collapsedLines.toString());
                                
                                const contentDiv = document.createElement('div');
                                contentDiv.className = 'folded-content';
                                const lines = view.state.doc.sliceString(from, to).split('\n')
                                                .slice(0, settings.collapsedLines)
                                                .join('\n');
                                contentDiv.textContent = lines;
                                
                                const button = document.createElement('div');
                                button.className = 'code-block-toggle';
                                button.textContent = settings.expandIcon;
                                button.onclick = (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    view.dispatch({
                                        effects: toggleFoldEffect.of({from, to, defaultState: false})
                                    });
                                };
                                
                                container.appendChild(button);
                                container.appendChild(contentDiv);
                                return container;
                            }
                        }
                    });
                    
                    folds = folds.update({
                        add: [deco.range(from, to)]
                    });
                }
            }
        }
        return folds;
    },
    provide: f => EditorView.decorations.from(f)
});

const toggleFoldEffect = StateEffect.define<{from: number, to: number, defaultState?: boolean}>();




interface CollapsibleCodeBlockSettings {
    defaultCollapsed: boolean;
    collapseIcon: string;
    expandIcon: string;
    enableHorizontalScroll: boolean;
    collapsedLines: number;
}

interface CodeBlockPosition {
    startPos: number;
    endPos: number;
}

const DEFAULT_SETTINGS: CollapsibleCodeBlockSettings = {
    defaultCollapsed: false,
    collapseIcon: '▼',
    expandIcon: '▶',
    enableHorizontalScroll: true,
    collapsedLines: 0
};

//const toggleFoldEffect = StateEffect.define<{from: number, to: number}>();


class FoldWidget extends WidgetType {
    private static initializedBlocks = new Set<string>();
    
    constructor(
        readonly startPos: number,
        readonly endPos: number,
        readonly settings: CollapsibleCodeBlockSettings,
        readonly foldField: StateField<DecorationSet>
    ) {
        super();
    }
    
    toDOM(view: EditorView) {
        const button = document.createElement('div');
        button.className = 'code-block-toggle';
        
        let isFolded = false;
        view.state.field(this.foldField).between(this.startPos, this.endPos, () => {
            isFolded = true;
        });
        
        button.innerHTML = isFolded ? this.settings.expandIcon : this.settings.collapseIcon;
        button.setAttribute('aria-label', isFolded ? 'Expand code block' : 'Collapse code block');
        
        const blockId = `${this.startPos}-${this.endPos}`;
        if (this.settings.defaultCollapsed && !isFolded && !FoldWidget.initializedBlocks.has(blockId)) {
            FoldWidget.initializedBlocks.add(blockId);
            requestAnimationFrame(() => {
                view.dispatch({
                    effects: toggleFoldEffect.of({
                        from: this.startPos,
                        to: this.endPos
                    })
                });
            });
        }
        
        button.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            view.dispatch({
                effects: toggleFoldEffect.of({
                    from: this.startPos,
                    to: this.endPos
                })
            });
        };
        
        return button;
    }

    eq(other: FoldWidget) {
        return other.startPos === this.startPos && other.endPos === this.endPos;
    }
}

const codeBlockPositions = StateField.define<CodeBlockPosition[]>({
    create(state: EditorState): CodeBlockPosition[] {
        return findCodeBlockPositions(state);
    },
    update(value: CodeBlockPosition[], tr) {
        return findCodeBlockPositions(tr.state);
    }
});

function buildDecorations(
    state: EditorState, 
    settings: CollapsibleCodeBlockSettings,
    foldField: StateField<DecorationSet>
): DecorationSet {
    const widgets: any[] = [];
    const positions = state.field(codeBlockPositions);
    
    positions.forEach(pos => {
        const widget = Decoration.widget({
            widget: new FoldWidget(pos.startPos, pos.endPos, settings, foldField),
            side: -1
        });
        widgets.push(widget.range(pos.startPos));
    });
    
    return Decoration.set(widgets, true);
}

function findCodeBlockPositions(state: EditorState): CodeBlockPosition[] {
    const positions: CodeBlockPosition[] = [];
    
    syntaxTree(state).iterate({
        enter: (node) => {
            const nodeName = node.type.name;
            if (nodeName.includes("HyperMD-codeblock-begin")) {
                const line = state.doc.lineAt(node.from);
                if (line.text.trim().startsWith('```')) {
                    let endFound = false;
                    
                    for (let i = line.number; i <= state.doc.lines; i++) {
                        const currentLine = state.doc.line(i);
                        if (i !== line.number && currentLine.text.trim().startsWith('```')) {
                            positions.push({
                                startPos: line.from,
                                endPos: currentLine.to
                            });
                            endFound = true;
                            break;
                        }
                    }
                    
                    if (!endFound) {
                        positions.push({
                            startPos: line.from,
                            endPos: state.doc.line(state.doc.lines).to
                        });
                    }
                }
            }
        }
    });
    
    return positions;
}

const decorations = (settings: CollapsibleCodeBlockSettings, foldField: StateField<DecorationSet>) => StateField.define<DecorationSet>({
    create(state: EditorState): DecorationSet {
        return buildDecorations(state, settings, foldField);
    },
    update(value: DecorationSet, transaction): DecorationSet {
        return buildDecorations(transaction.state, settings, foldField);
    },
    provide(field: StateField<DecorationSet>): Extension {
        return EditorView.decorations.from(field);
    }
});
export default class CollapsibleCodeBlockPlugin extends Plugin {
    private contentObserver: MutationObserver;
    public settings: CollapsibleCodeBlockSettings;
    private foldField: StateField<DecorationSet>;

   async onload() {
    await this.loadSettings();
    this.updateScrollSetting();

    this.foldField = createFoldField(this.settings);
    const currentDecorations = decorations(this.settings, this.foldField);

    this.registerEditorExtension([
        codeBlockPositions,
        this.foldField,
        currentDecorations
    ]);

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
        });
    }

    private setupCodeBlock(pre: HTMLElement) {
        document.documentElement.style.setProperty('--collapsed-lines', this.settings.collapsedLines.toString());
        
        const toggleButton = this.createToggleButton();
        pre.insertBefore(toggleButton, pre.firstChild);

        if (this.settings.defaultCollapsed) {
            pre.classList.add('collapsed');
            toggleButton.textContent = this.settings.expandIcon;
            this.updateCodeBlockVisibility(pre, true);
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
            this.updateCodeBlockVisibility(pre, true);
            
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

    private updateCodeBlockVisibility(pre: HTMLElement, forceRefresh: boolean = false) {
        const isCollapsed = pre.classList.contains('collapsed');
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView?.previewMode?.containerEl) return;

        const previewElement = markdownView.previewMode.containerEl;
        const rect = pre.getBoundingClientRect();
        const scrollTop = previewElement.scrollTop;
        const elementTop = rect.top + scrollTop;

        let curr = pre.nextElementSibling;
        while (curr && !(curr instanceof HTMLPreElement)) {
            if (curr instanceof HTMLElement) {
                if (isCollapsed) {
                    curr.classList.add('element-hidden');
                    curr.classList.remove('element-visible', 'element-spacing');
                } else {
                    curr.classList.remove('element-hidden');
                    curr.classList.add('element-visible');
                }
            }
            curr = curr.nextElementSibling;
        }

        void pre.offsetHeight;

        const triggerReflow = async () => {
            window.dispatchEvent(new Event('resize'));
            await new Promise(resolve => requestAnimationFrame(resolve));

            const originalScroll = previewElement.scrollTop;
            previewElement.scrollTop = Math.max(0, previewElement.scrollHeight - previewElement.clientHeight);
            await new Promise(resolve => requestAnimationFrame(resolve));
            
            previewElement.scrollTop = originalScroll;
            
            window.dispatchEvent(new Event('resize'));
            await new Promise(resolve => setTimeout(resolve, 50));
            window.dispatchEvent(new Event('resize'));
        };

        triggerReflow();
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
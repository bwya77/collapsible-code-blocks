import { Extension } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { StateField, StateEffect, EditorState } from '@codemirror/state';
import { CollapsibleCodeBlockSettings } from './types';
import { App, MarkdownView } from 'obsidian';

interface CodeBlockPosition {
    startPos: number;
    endPos: number;
}

export const toggleFoldEffect = StateEffect.define<{from: number, to: number, defaultState?: boolean}>();

export class FoldWidget extends WidgetType {
    private static initializedBlocks = new Set<string>();

    private static getFrontmatterCodeBlockState(app: App): boolean | null {
        const activeView = app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView?.file) return null;
        const cache = app.metadataCache.getFileCache(activeView.file);
        if (!cache?.frontmatter?.['code-blocks']) return null;
        const value = cache.frontmatter['code-blocks'].toLowerCase();
        return value === 'collapsed' ? true : value === 'expanded' ? false : null;
    }
    
    constructor(
        readonly startPos: number,
        readonly endPos: number,
        readonly settings: CollapsibleCodeBlockSettings,
        readonly foldField: StateField<DecorationSet>,
        readonly app: App
    ) {
        super();
    }

    private getBlockId(): string {
        const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        return `${file?.path || ''}-${this.startPos}-${this.endPos}`;
    }

    private initializeCodeBlock(view: EditorView) {
        const blockId = this.getBlockId();
        if (FoldWidget.initializedBlocks.has(blockId)) {
            return;
        }

        FoldWidget.initializedBlocks.add(blockId);
        const frontmatterState = FoldWidget.getFrontmatterCodeBlockState(this.app);
        const shouldCollapse = frontmatterState !== null ? frontmatterState : this.settings.defaultCollapsed;
        
        if (shouldCollapse) {
            let isAlreadyFolded = false;
            view.state.field(this.foldField).between(this.startPos, this.endPos, () => {
                isAlreadyFolded = true;
            });
            
            if (!isAlreadyFolded) {
                requestAnimationFrame(() => {
                    view.dispatch({
                        effects: toggleFoldEffect.of({
                            from: this.startPos,
                            to: this.endPos,
                            defaultState: true
                        })
                    });
                });
            }
        }
    }
    
    toDOM(view: EditorView) {
        const button = document.createElement('div');
        button.className = 'code-block-toggle';
        
        let isFolded = false;
        view.state.field(this.foldField).between(this.startPos, this.endPos, () => {
            isFolded = true;
        });
        
        this.initializeCodeBlock(view);
        
        button.innerHTML = isFolded ? this.settings.expandIcon : this.settings.collapseIcon;
        button.setAttribute('aria-label', isFolded ? 'Expand code block' : 'Collapse code block');
        
        button.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            view.dispatch({
                effects: toggleFoldEffect.of({
                    from: this.startPos,
                    to: this.endPos,
                    defaultState: isFolded ? false : true
                })
            });
        };
        
        return button;
    }

    // Add method to clear initialization state when switching files
    public static clearInitializedBlocks() {
        FoldWidget.initializedBlocks.clear();
    }
}

const createFoldField = (settings: CollapsibleCodeBlockSettings) => StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(folds: DecorationSet, tr) {
        folds = folds.map(tr.changes);
        
        for (let effect of tr.effects) {
            if (effect.is(toggleFoldEffect)) {
                const { from, to, defaultState } = effect.value;
                let hasFold = false;
                
                folds.between(from, to, () => { hasFold = true });
                
                if (defaultState === false) {
                    folds = folds.update({
                        filter: (fromPos, toPos) => fromPos !== from || toPos !== to
                    });
                } else {
                    const capturedFrom = from;
                    const capturedTo = to;
                    
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
                                const lines = view.state.doc.sliceString(capturedFrom, capturedTo).split('\n')
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
                                        effects: toggleFoldEffect.of({
                                            from: capturedFrom,
                                            to: capturedTo,
                                            defaultState: false
                                        })
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

const codeBlockPositions = StateField.define<CodeBlockPosition[]>({
    create(state: EditorState): CodeBlockPosition[] {
        return findCodeBlockPositions(state);
    },
    update(value: CodeBlockPosition[], tr) {
        return findCodeBlockPositions(tr.state);
    }
});

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

function buildDecorations(
    state: EditorState, 
    settings: CollapsibleCodeBlockSettings,
    foldField: StateField<DecorationSet>,
    app: App  // Add app parameter
): DecorationSet {
    const widgets: any[] = [];
    const positions = state.field(codeBlockPositions);
    
    positions.forEach(pos => {
        const widget = Decoration.widget({
            widget: new FoldWidget(pos.startPos, pos.endPos, settings, foldField, app), // Pass app as the fifth argument
            side: -1
        });
        widgets.push(widget.range(pos.startPos));
    });
    
    return Decoration.set(widgets, true);
}


export function setupEditView(settings: CollapsibleCodeBlockSettings, app: App): Extension[] {
    const foldField = createFoldField(settings);
    const currentDecorations = StateField.define<DecorationSet>({
        create(state: EditorState): DecorationSet {
            return buildDecorations(state, settings, foldField, app);
        },
        update(value: DecorationSet, transaction): DecorationSet {
            return buildDecorations(transaction.state, settings, foldField, app);
        },
        provide(field: StateField<DecorationSet>): Extension {
            return EditorView.decorations.from(field);
        }
    });

    return [
        codeBlockPositions,
        foldField,
        currentDecorations
    ];
}

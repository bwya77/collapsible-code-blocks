import { Extension } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { StateField, StateEffect, EditorState } from '@codemirror/state';
import { CollapsibleCodeBlockSettings } from './types';
import { App, MarkdownView, MarkdownRenderer } from 'obsidian';

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
                
                // If defaultState is undefined, toggle based on current state
                const shouldFold = defaultState !== undefined ? defaultState : !hasFold;
                
                if (!shouldFold) {
                    folds = folds.update({
                        filter: (fromPos, toPos) => fromPos !== from || toPos !== to
                    });
                } else if (!hasFold) {
                    const capturedFrom = from;
                    const capturedTo = to;
                    
                    const deco = Decoration.replace({
                        block: true,
                        inclusiveStart: true,
                        inclusiveEnd: false,
                        widget: new class extends WidgetType {
                            toDOM(view: EditorView) {
                                const container = document.createElement('div');
                                container.className = 'code-block-folded';
                                container.style.setProperty('--collapsed-lines', settings.collapsedLines.toString());
                                
                                const contentDiv = document.createElement('div');
                                contentDiv.className = 'folded-content';
                                
                                // Get the entire content first
                                const fullContent = view.state.doc.sliceString(capturedFrom, capturedTo);
                                const allLines = fullContent.split('\n');
                                
                                // Get the language from the first line
                                const languageLine = allLines[0];
                                const languageMatch = languageLine.match(/^```(\w+)?/);
                                const language = languageMatch && languageMatch[1] ? languageMatch[1] : '';
                                
                                // Skip the first line (which contains ```language) and last line if it's closing backticks
                                let codeLines = allLines.slice(1); // Skip first line with backticks
                                
                                // Remove the last line if it's closing backticks
                                if (codeLines.length > 0 && codeLines[codeLines.length - 1].trim().startsWith('```')) {
                                    codeLines = codeLines.slice(0, -1);
                                }
                                
                                // Get the requested number of lines
                                const lines = codeLines.slice(0, settings.collapsedLines).join('\n');
                                
                                // Create a pre and code element to maintain code structure
                                const preElement = document.createElement('pre');
                                const codeElement = document.createElement('code');
                                
                                // Add language class for syntax highlighting
                                if (language) {
                                    codeElement.className = `language-${language}`;
                                    preElement.className = `language-${language}`;
                                }
                                
                                codeElement.textContent = lines;
                                preElement.appendChild(codeElement);
                                contentDiv.appendChild(preElement);
                                
                                // Apply Obsidian's syntax highlighting if available
                                requestAnimationFrame(() => {
                                    // @ts-ignore - Prism is available globally in Obsidian
                                    if (typeof Prism !== 'undefined' && language) {
                                        // @ts-ignore
                                        Prism.highlightElement(codeElement);
                                    }
                                });
                                
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
                // Add our custom class to code blocks in editor
                const lineEl = document.querySelector(`.${nodeName}`);
                if (lineEl && lineEl.parentElement) {
                    lineEl.parentElement.classList.add('ccb-editor-codeblock');
                }
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

    // Transaction filter to auto-expand folds when edits would affect them
    const autoExpandFilter = EditorState.transactionFilter.of(tr => {
        // Skip if no document changes
        if (!tr.docChanged) return tr;

        const folds = tr.startState.field(foldField);
        const unfoldEffects: StateEffect<{from: number, to: number, defaultState?: boolean}>[] = [];

        // Check each change to see if it affects a folded region
        tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
            folds.between(0, tr.startState.doc.length, (foldFrom, foldTo) => {
                // If the change position is inside or at the boundary of a fold, unfold it
                if (fromA <= foldTo && toA >= foldFrom) {
                    unfoldEffects.push(toggleFoldEffect.of({
                        from: foldFrom,
                        to: foldTo,
                        defaultState: false
                    }));
                }
            });
        });

        // If we need to unfold, add the unfold effects to the transaction
        if (unfoldEffects.length > 0) {
            return [tr, { effects: unfoldEffects }];
        }

        return tr;
    });

    return [
        codeBlockPositions,
        foldField,
        currentDecorations,
        autoExpandFilter
    ];
}

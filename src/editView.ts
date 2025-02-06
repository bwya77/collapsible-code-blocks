import { Extension } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { StateField, StateEffect, EditorState } from '@codemirror/state';
import { CollapsibleCodeBlockSettings } from './types';

interface CodeBlockPosition {
    startPos: number;
    endPos: number;
}

export const toggleFoldEffect = StateEffect.define<{from: number, to: number, defaultState?: boolean}>();

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
                        to: this.endPos,
                        defaultState: true
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

export function setupEditView(settings: CollapsibleCodeBlockSettings): Extension[] {
    const foldField = createFoldField(settings);
    const currentDecorations = decorations(settings, foldField);

    return [
        codeBlockPositions,
        foldField,
        currentDecorations
    ];
}
import { MarkdownView } from 'obsidian';
import { CollapsibleCodeBlockSettings, ExtendedApp } from './types';

export interface ReadViewAPI {
    processNewCodeBlocks: (element: HTMLElement) => void;
    setupContentObserver: (processNewCodeBlocks: (element: HTMLElement) => void) => MutationObserver;
}

export function setupReadView(app: ExtendedApp, settings: CollapsibleCodeBlockSettings): ReadViewAPI {
   function getFrontmatterCodeBlockState(): boolean | null {
        const activeView = app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView?.file) return null;

        const cache = app.metadataCache.getFileCache(activeView.file);
        if (!cache?.frontmatter?.['code-blocks']) return null;

        const value = cache.frontmatter['code-blocks'].toLowerCase();
        if (value === 'collapsed') return true;
        if (value === 'expanded') return false;
        return null;
    }

    function createToggleButton(): HTMLElement {
        const button = document.createElement('div');
        button.className = 'code-block-toggle';
        button.textContent = settings.collapseIcon;
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.setAttribute('aria-label', 'Toggle code block visibility');
        
        const toggleHandler = (e: Event) => {
            e.preventDefault();
            const pre = (e.target as HTMLElement).closest('pre');
            if (!pre) return;

            pre.classList.toggle('collapsed');
            updateCodeBlockVisibility(pre, true);
            
            const isCollapsed = pre.classList.contains('collapsed');
            button.textContent = isCollapsed ? settings.expandIcon : settings.collapseIcon;
            button.setAttribute('aria-expanded', (!isCollapsed).toString());
            app.workspace.requestSaveLayout();
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

    function updateCodeBlockVisibility(pre: HTMLElement, forceRefresh: boolean = false) {
        const isCollapsed = pre.classList.contains('collapsed');
        const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
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

     function setupCodeBlock(pre: HTMLElement) {
        document.documentElement.style.setProperty('--collapsed-lines', settings.collapsedLines.toString());
        
        const toggleButton = createToggleButton();
        pre.insertBefore(toggleButton, pre.firstChild);

        const frontmatterState = getFrontmatterCodeBlockState();
        const shouldCollapse = frontmatterState !== null ? frontmatterState : settings.defaultCollapsed;

        if (shouldCollapse) {
            pre.classList.add('collapsed');
            toggleButton.textContent = settings.expandIcon;
            updateCodeBlockVisibility(pre, true);
        }
    }

    function processNewCodeBlocks(element: HTMLElement) {
        element.querySelectorAll('pre:not(.has-collapse-button)').forEach(pre => {
            if (!(pre instanceof HTMLElement)) return;
            
            pre.classList.add('has-collapse-button', 'ccb-code-block');
            
            // Add our class to the code element to target styling
            const codeElement = pre.querySelector('code');
            if (codeElement) {
                codeElement.classList.add('ccb-hide-vertical-scrollbar');
            }
            
            setupCodeBlock(pre);
        });
    }

    function setupContentObserver(processNewCodeBlocks: (element: HTMLElement) => void): MutationObserver {
        return new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    processNewCodeBlocks(mutation.target as HTMLElement);
                }
            });
        });
    }

    return {
        processNewCodeBlocks,
        setupContentObserver
    };
}
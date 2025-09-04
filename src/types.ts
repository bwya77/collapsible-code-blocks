import { App } from 'obsidian';

export interface CollapsibleCodeBlockSettings {
    defaultCollapsed: boolean;
    collapseIcon: string;
    expandIcon: string;
    enableHorizontalScroll: boolean;
    collapsedLines: number;
    buttonAlignment: 'left' | 'right';
    transparentButton: boolean;
}

export const DEFAULT_SETTINGS: CollapsibleCodeBlockSettings = {
    defaultCollapsed: false,
    collapseIcon: '▼',
    expandIcon: '▶',
    enableHorizontalScroll: true,
    collapsedLines: 0,
    buttonAlignment: 'left',
    transparentButton: false
};

export interface ExtendedPluginAPI {
    disablePlugin(id: string): Promise<void>;
    enablePlugin(id: string): Promise<void>;
}

export interface ExtendedApp extends App {
    plugins: ExtendedPluginAPI;
}
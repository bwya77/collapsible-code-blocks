import { App } from 'obsidian';

export interface CollapsibleCodeBlockSettings {
    defaultCollapsed: boolean;
    collapseIcon: string;
    expandIcon: string;
    enableHorizontalScroll: boolean;
    collapsedLines: number;
}

export const DEFAULT_SETTINGS: CollapsibleCodeBlockSettings = {
    defaultCollapsed: false,
    collapseIcon: '▼',
    expandIcon: '▶',
    enableHorizontalScroll: true,
    collapsedLines: 0
};

export interface ExtendedPluginAPI {
    disablePlugin(id: string): Promise<void>;
    enablePlugin(id: string): Promise<void>;
}

export interface ExtendedApp extends App {
    plugins: ExtendedPluginAPI;
}
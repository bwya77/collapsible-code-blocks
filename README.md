# Collapsible Code Blocks

Make code blocks collapsible in preview mode with customizable collapse/expand behavior and horizontal scrolling options. This plugin enhances the readability of your notes by allowing you to collapse long code blocks when you don't need to see their full content.

[Code Collapsed](/images/code_collapsed.png) 

## Features

- Toggle code blocks between collapsed and expanded states
- Customizable collapse/expand icons
- Optional horizontal scrolling for code blocks
- Configure number of visible lines when collapsed
- Keyboard navigation support
- Default collapse state setting
- Smooth animations for collapse/expand transitions
- Maintains proper layout with surrounding content

## Installation

1. Open Obsidian Settings
2. Navigate to Community Plugins and disable Safe Mode
3. Click Browse and search for "Collapsible Code Blocks"
4. Install the plugin
5. Enable the plugin in your Community Plugins list

## Usage

Once installed, code blocks in preview mode will automatically have a toggle button in their top-left corner. You can:

- Click the toggle button to collapse/expand the code block
- Use the keyboard (Enter or Space) when the toggle button is focused
- Configure default behavior in plugin settings

### Code Block Interaction

- Click the toggle button (▼/▶) to collapse or expand the code block
- When collapsed, only the specified number of lines will be visible
- Horizontal scrolling can be enabled/disabled globally
- Code blocks maintain their collapsed/expanded state when switching between notes

## Settings

The plugin offers several customization options:

- **Default Collapsed State**: Choose whether code blocks should start collapsed
- **Collapse/Expand Icons**: Customize the icons shown for collapse/expand states
- **Horizontal Scrolling**: Toggle horizontal scrolling for code blocks
- **Collapsed Lines**: Set how many lines remain visible when collapsed

## Examples

Here's how a code block appears with the plugin enabled and the code block expanded:
[Code Expanded](/images/code_expanded.png) 


Here's how a code block appears with the code collapsed and set to show 0 lines.
[Code Collapsed](/images/code_collapsed.png) 

## Support

If you encounter any issues or have suggestions:

- Create an issue on [GitHub](https://github.com/bwya77/collapsible-code-blocks/issues)
- Support the development:
  - [Buy Me a Coffee](https://buymeacoffee.com/bwya77)
  - [GitHub Sponsor](https://github.com/sponsors/bwya77)

## Development

Want to contribute? Here's how to get started:

1. Clone the repository:
   ```bash
   git clone https://github.com/bwya77/collapsible-code-blocks.git
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development build:
   ```bash
   npm run dev
   ```

### Testing Your Changes

1. Create a symbolic link to your vault's `.obsidian/plugins/` directory
2. Enable the plugin in Obsidian's community plugins settings
3. Use the developer console (Ctrl+Shift+I) to debug

## License

[MIT License](https://github.com/bwya77/collapsible-code-blocks?tab=MIT-1-ov-file)
import { App, Plugin, PluginSettingTab, Setting, MarkdownRenderer, Component, Editor } from 'obsidian';
import { RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { 
    EditorView, 
    Decoration, 
    DecorationSet, 
    ViewPlugin, 
    ViewUpdate, 
    WidgetType
} from '@codemirror/view';

// --- CONFIGURACIÓN ---
interface CornellSettings {
    ignoredFolders: string;
    alignment: 'left' | 'right'; 
    marginWidth: number;
    fontSize: string;      // NUEVO
    fontFamily: string;    // NUEVO
}

const DEFAULT_SETTINGS: CornellSettings = {
    ignoredFolders: 'Templates, Archivos/Excluidos',
    alignment: 'left', 
    marginWidth: 25,
    fontSize: '0.85em',    // Valor por defecto (original)
    fontFamily: 'inherit'  // Valor por defecto (usa la fuente de Obsidian)
}

// --- WIDGET ---
class MarginNoteWidget extends WidgetType {
    constructor(readonly text: string, readonly app: App) { super(); }

    toDOM(view: EditorView): HTMLElement {
        const div = document.createElement("div");
        div.className = "cm-cornell-margin";
        MarkdownRenderer.render(this.app, this.text, div, "", new Component());
        div.onclick = (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName !== 'A') e.preventDefault();
        };
        return div;
    }
    ignoreEvent() { return false; } 
}

// --- EXTENSIÓN ---
const createCornellExtension = (app: App, settings: CornellSettings) => ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();
        const file = app.workspace.getActiveFile();
        if (file) {
            const ignoredPaths = settings.ignoredFolders.split(',').map(s => s.trim()).filter(s => s.length > 0);
            for (const path of ignoredPaths) {
                if (file.path.startsWith(path)) return builder.finish();
            }
        }

        const { state } = view;
        const cursorRanges = state.selection.ranges;

        for (const { from, to } of view.visibleRanges) {
            const text = state.doc.sliceString(from, to);
            const regex = /%%>(.*?)%%/g;
            let match;

            while ((match = regex.exec(text))) {
                const start = from + match.index;
                const end = start + match[0].length;
                const tree = syntaxTree(state);
                const node = tree.resolve(start, 1);
                const isCode = node.name.includes("code") || node.name.includes("Code") || node.name.includes("math");
                
                if (isCode) continue;

                let isCursorInside = false;
                for (const range of cursorRanges) {
                    if (range.from >= start && range.to <= end) {
                        isCursorInside = true;
                        break;
                    }
                }

                if (isCursorInside) continue;

                builder.add(start, end, Decoration.replace({
                    widget: new MarginNoteWidget(match[1], app)
                }));
            }
        }
        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

// --- SETTINGS TAB ---
class CornellSettingTab extends PluginSettingTab {
    plugin: CornellMarginalia;

    constructor(app: App, plugin: CornellMarginalia) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Cornell Marginalia Settings' });

        // 1. Alineación
        new Setting(containerEl)
            .setName('Margin Alignment')
            .setDesc('Left (Classic Cornell) or Right (Modern Textbook).')
            .addDropdown(dropdown => dropdown
                .addOption('left', 'Left Side (Classic)')
                .addOption('right', 'Right Side')
                .setValue(this.plugin.settings.alignment)
                .onChange(async (value) => {
                    this.plugin.settings.alignment = value as 'left' | 'right';
                    await this.plugin.saveSettings();
                    this.plugin.updateStyles();
                }));

        // 2. Ancho
        new Setting(containerEl)
            .setName('Margin Width (%)')
            .setDesc('Slide to adjust width.')
            .addSlider(slider => slider
                .setLimits(15, 60, 1)
                .setValue(this.plugin.settings.marginWidth)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.marginWidth = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateStyles();
                }));

        // 3. Tamaño de Fuente (NUEVO)
        new Setting(containerEl)
            .setName('Font Size')
            .setDesc('CSS value for font size (e.g. "0.85em", "14px", "0.9rem"). Default: 0.85em')
            .addText(text => text
                .setPlaceholder('0.85em')
                .setValue(this.plugin.settings.fontSize)
                .onChange(async (value) => {
                    this.plugin.settings.fontSize = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateStyles();
                }));

        // 4. Familia de Fuente (NUEVO)
        new Setting(containerEl)
            .setName('Font Family')
            .setDesc('Custom font family (e.g. "Arial", "Consolas", or "var(--font-monospace)"). Default: inherit')
            .addText(text => text
                .setPlaceholder('inherit')
                .setValue(this.plugin.settings.fontFamily)
                .onChange(async (value) => {
                    this.plugin.settings.fontFamily = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateStyles();
                }));

        // 5. Ignorar Carpetas
        new Setting(containerEl)
            .setName('Ignored Folders')
            .addTextArea(text => text
                .setPlaceholder('Templates')
                .setValue(this.plugin.settings.ignoredFolders)
                .onChange(async (value) => {
                    this.plugin.settings.ignoredFolders = value;
                    await this.plugin.saveSettings();
                    this.plugin.app.workspace.updateOptions();
                }));
    }
}

// --- PLUGIN PRINCIPAL ---
export default class CornellMarginalia extends Plugin {
    settings: CornellSettings;

    async onload() {
        await this.loadSettings();
        this.updateStyles(); 
        this.addSettingTab(new CornellSettingTab(this.app, this));
        this.registerEditorExtension(createCornellExtension(this.app, this.settings));

        this.addCommand({
            id: 'insert-cornell-note',
            name: 'Insert Margin Note',
            editorCallback: (editor: Editor) => {
                const selection = editor.getSelection();
                if (selection) {
                    editor.replaceSelection(`%%> ${selection} %%`);
                } else {
                    editor.replaceSelection(`%%>  %%`);
                    const cursor = editor.getCursor();
                    editor.setCursor({ line: cursor.line, ch: cursor.ch - 3 });
                }
            }
        });
    }

    // --- ACTUALIZADOR DE ESTILOS ---
    updateStyles() {
        // Variables Base
        document.body.style.setProperty('--cornell-width', `${this.settings.marginWidth}%`);
        document.body.style.setProperty('--cornell-font-size', this.settings.fontSize);
        document.body.style.setProperty('--cornell-font-family', this.settings.fontFamily);
        
        // Lógica de Lado
        if (this.settings.alignment === 'left') {
            document.body.style.setProperty('--cornell-left', 'auto');
            document.body.style.setProperty('--cornell-right', '100%');
            document.body.style.setProperty('--cornell-margin-right', '15px');
            document.body.style.setProperty('--cornell-margin-left', '0');
            document.body.style.setProperty('--cornell-border-r', '2px solid var(--text-accent)');
            document.body.style.setProperty('--cornell-border-l', 'none');
            document.body.style.setProperty('--cornell-text-align', 'right');
        } else {
            document.body.style.setProperty('--cornell-left', '100%');
            document.body.style.setProperty('--cornell-right', 'auto');
            document.body.style.setProperty('--cornell-margin-left', '15px');
            document.body.style.setProperty('--cornell-margin-right', '0');
            document.body.style.setProperty('--cornell-border-l', '2px solid var(--text-accent)');
            document.body.style.setProperty('--cornell-border-r', 'none');
            document.body.style.setProperty('--cornell-text-align', 'left');
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

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

// --- ESTRUCTURAS DE DATOS ---

// Definimos qué es una "Etiqueta Cornell"
interface CornellTag {
    prefix: string; // Ej: "?"
    color: string;  // Ej: "#ff9900"
}

interface CornellSettings {
    ignoredFolders: string;
    alignment: 'left' | 'right'; 
    marginWidth: number;
    fontSize: string;
    fontFamily: string;
    tags: CornellTag[]; // NUEVO: Lista de etiquetas personalizables
}

// Defaults en Inglés como pediste
const DEFAULT_SETTINGS: CornellSettings = {
    ignoredFolders: 'Templates, Archivos/Excluidos',
    alignment: 'left', 
    marginWidth: 25,
    fontSize: '0.85em',
    fontFamily: 'inherit',
    tags: [
        { prefix: '!', color: '#ffea00' }, // Important (Yellow)
        { prefix: '?', color: '#ff9900' }, // Question (Orange)
        { prefix: 'X-', color: '#ff4d4d' }, // Correction (Red)
        { prefix: 'V-', color: '#00cc66' }  // Reviewed (Green)
    ]
}

// --- WIDGET ---
class MarginNoteWidget extends WidgetType {
    // Ahora aceptamos un color opcional
    constructor(
        readonly text: string, 
        readonly app: App, 
        readonly customColor: string | null 
    ) { super(); }

    toDOM(view: EditorView): HTMLElement {
        const div = document.createElement("div");
        div.className = "cm-cornell-margin";
        
        // Si hay un color personalizado (detectado por prefijo), lo aplicamos inline
        // Esto sobreescribe las variables CSS por defecto para ESTA nota específica
        if (this.customColor) {
            div.style.borderColor = this.customColor; // Cambia el borde
            div.style.color = this.customColor;       // Cambia el texto
            
            // Opcional: Si prefieres que el texto siga siendo del color normal y solo cambie el borde,
            // comenta la linea de 'div.style.color'.
        }

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
                const noteContent = match[1];

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

                // --- LÓGICA DE DETECCIÓN DE COLOR ---
                let matchedColor = null;
                const trimmedContent = noteContent.trim(); // Ignoramos espacios al principio

                // Buscamos si el texto empieza con alguno de los prefijos configurados
                for (const tag of settings.tags) {
                    if (trimmedContent.startsWith(tag.prefix)) {
                        matchedColor = tag.color;
                        break; // Encontramos coincidencia, dejamos de buscar
                    }
                }

                builder.add(start, end, Decoration.replace({
                    widget: new MarginNoteWidget(noteContent, app, matchedColor)
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

        // --- SECCIÓN GENERAL ---
        containerEl.createEl('h3', { text: 'General Appearance' });

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

        new Setting(containerEl)
            .setName('Margin Width (%)')
            .addSlider(slider => slider
                .setLimits(15, 60, 1)
                .setValue(this.plugin.settings.marginWidth)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.marginWidth = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateStyles();
                }));

        new Setting(containerEl)
            .setName('Font Size')
            .addText(text => text
                .setPlaceholder('0.85em')
                .setValue(this.plugin.settings.fontSize)
                .onChange(async (value) => {
                    this.plugin.settings.fontSize = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateStyles();
                }));

        new Setting(containerEl)
            .setName('Font Family')
            .addText(text => text
                .setPlaceholder('inherit')
                .setValue(this.plugin.settings.fontFamily)
                .onChange(async (value) => {
                    this.plugin.settings.fontFamily = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateStyles();
                }));

        // --- SECCIÓN DE ETIQUETAS DE COLOR (NUEVO) ---
        containerEl.createEl('h3', { text: 'Color Tags & Categories' });
        containerEl.createEl('p', { text: 'Define prefixes to automatically color-code your notes. E.g., start a note with "?" to make it orange.', cls: 'setting-item-description' });

        // 1. Listar etiquetas existentes
        this.plugin.settings.tags.forEach((tag, index) => {
            const setting = new Setting(containerEl)
                .setName(`Tag ${index + 1}`)
                .setDesc('Prefix & Color')
                
                // Input para el Prefijo (Ej: "?")
                .addText(text => text
                    .setPlaceholder('Prefix (e.g. ?)')
                    .setValue(tag.prefix)
                    .onChange(async (value) => {
                        this.plugin.settings.tags[index].prefix = value;
                        await this.plugin.saveSettings();
                        // No necesitamos updateStyles(), pero sí refrescar el editor
                        this.plugin.app.workspace.updateOptions();
                    }))
                
                // Picker para el Color
                .addColorPicker(color => color
                    .setValue(tag.color)
                    .onChange(async (value) => {
                        this.plugin.settings.tags[index].color = value;
                        await this.plugin.saveSettings();
                        this.plugin.app.workspace.updateOptions();
                    }))
                
                // Botón de borrar
                .addButton(btn => btn
                    .setIcon('trash')
                    .setTooltip('Delete Tag')
                    .onClick(async () => {
                        this.plugin.settings.tags.splice(index, 1);
                        await this.plugin.saveSettings();
                        // Refrescamos la pestaña de settings para que desaparezca la fila
                        this.display();
                        this.plugin.app.workspace.updateOptions();
                    }));
        });

        // 2. Botón para añadir nueva etiqueta
        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText('Add New Tag')
                .setCta()
                .onClick(async () => {
                    this.plugin.settings.tags.push({ prefix: 'New', color: '#888888' });
                    await this.plugin.saveSettings();
                    this.display();
                }));

        // --- SECCIÓN AVANZADA ---
        containerEl.createEl('h3', { text: 'Advanced' });
        
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

    updateStyles() {
        document.body.style.setProperty('--cornell-width', `${this.settings.marginWidth}%`);
        document.body.style.setProperty('--cornell-font-size', this.settings.fontSize);
        document.body.style.setProperty('--cornell-font-family', this.settings.fontFamily);
        
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

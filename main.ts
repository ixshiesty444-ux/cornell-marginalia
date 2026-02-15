import { App, Plugin, PluginSettingTab, Setting, MarkdownRenderer, Component } from 'obsidian';
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
}

const DEFAULT_SETTINGS: CornellSettings = {
    ignoredFolders: 'Templates, Archivos/Excluidos'
}

// --- WIDGET (Lo que se ve al margen) ---
class MarginNoteWidget extends WidgetType {
    constructor(readonly text: string, readonly app: App) { super(); }

    toDOM(view: EditorView): HTMLElement {
        const div = document.createElement("div");
        div.className = "cm-cornell-margin";
        
        MarkdownRenderer.render(
            this.app,
            this.text,
            div,
            "", 
            new Component() 
        );

        div.onclick = (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName !== 'A') e.preventDefault();
        };
        
        return div;
    }

    ignoreEvent() { return false; } 
}

// --- EXTENSIÓN DE VISTA (El cerebro) ---
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
        
        // 1. CHECK DE CARPETA: Usamos el método seguro de la App
        const file = app.workspace.getActiveFile();
        if (file) {
            const ignoredPaths = settings.ignoredFolders.split(',').map(s => s.trim()).filter(s => s.length > 0);
            for (const path of ignoredPaths) {
                // Si la ruta del archivo empieza con alguna carpeta ignorada...
                if (file.path.startsWith(path)) {
                    return builder.finish(); // ...no hacemos nada (return vacío).
                }
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

                // 2. CHECK DE CÓDIGO: ¿Está esto dentro de un bloque de código?
                const tree = syntaxTree(state);
                const node = tree.resolve(start, 1);
                // Tipos de nodos comunes de código en Markdown
                const isCode = node.name.includes("code") || node.name.includes("Code") || node.name.includes("math");
                
                if (isCode) {
                    continue; // Si es código, ignoramos y mostramos el texto raw
                }

                // 3. Lógica del cursor (para editar)
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

// --- PESTAÑA DE CONFIGURACIÓN ---
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

        new Setting(containerEl)
            .setName('Ignored Folders')
            .setDesc('Enter folder paths to ignore, separated by commas (e.g. "Templates, Archives"). The plugin will not render marginalia in these files.')
            .addTextArea(text => text
                .setPlaceholder('Templates, Scripts')
                .setValue(this.plugin.settings.ignoredFolders)
                .onChange(async (value) => {
                    this.plugin.settings.ignoredFolders = value;
                    await this.plugin.saveSettings();
                    // Forzamos un refresh
                    this.plugin.app.workspace.updateOptions();
                }));
    }
}

// --- PLUGIN PRINCIPAL ---
export default class CornellMarginalia extends Plugin {
    settings: CornellSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new CornellSettingTab(this.app, this));
        this.registerEditorExtension(createCornellExtension(this.app, this.settings));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

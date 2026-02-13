import { Plugin } from 'obsidian';
import { RangeSetBuilder } from '@codemirror/state';
import { 
    EditorView, 
    Decoration, 
    DecorationSet, 
    ViewPlugin, 
    ViewUpdate, 
    WidgetType
} from '@codemirror/view';

// WIDGET (Lo que se ve al margen)
class MarginNoteWidget extends WidgetType {
    constructor(readonly text: string) { super(); }

    toDOM(view: EditorView): HTMLElement {
        const div = document.createElement("div");
        div.className = "cm-cornell-margin";
        div.textContent = this.text;
        // Truco: Si le das click a la nota al margen, no hace nada raro
        div.onclick = (e) => e.preventDefault();
        return div;
    }

    ignoreEvent() { return false; }
}

// PLUGIN DE VISTA (Detecta %%> texto %%)
const cornellPlugin = ViewPlugin.fromClass(class {
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
        const { state } = view;
        const cursorRanges = state.selection.ranges;

        for (const { from, to } of view.visibleRanges) {
            const text = state.doc.sliceString(from, to);
            // NUEVA REGEX: Busca %%> ... %%
            const regex = /%%>(.*?)%%/g;
            let match;

            while ((match = regex.exec(text))) {
                const start = from + match.index;
                const end = start + match[0].length;

                // Lógica "Smart": Si el cursor toca el comentario, muéstralo para editar
                let isCursorInside = false;
                for (const range of cursorRanges) {
                    if (range.from >= start && range.to <= end) {
                        isCursorInside = true;
                        break;
                    }
                }

                if (isCursorInside) {
                    continue; // No ocultar si estamos editando
                }

                builder.add(start, end, Decoration.replace({
                    widget: new MarginNoteWidget(match[1])
                }));
            }
        }
        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

export default class CornellMarginalia extends Plugin {
    async onload() {
        console.log("Cornell Marginalia (Modo Comentarios) cargado 🩺");
        this.registerEditorExtension(cornellPlugin);
    }
}

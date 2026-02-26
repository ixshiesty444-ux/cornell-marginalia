import { CornellAddon } from "./CornellAddon";
import { Notice, WorkspaceLeaf } from "obsidian";

// ID único para la nueva ventana central
export const RHIZOME_VIEW_TYPE = "rhizome-time-machine-view";

export class RhizomeAddon extends CornellAddon {
    id = "rhizome-time-machine";
    name = "Time Machine & Rhizome";
    description = "A full-screen chronological graph to explore and review your marginaliae.";

    private ribbonIconEl: HTMLElement | null = null;

    load() {
        console.log("🕰️ Time Machine Addon Loaded");
        
        // 1. Registramos el botón en el menú lateral izquierdo de Obsidian
        this.ribbonIconEl = this.plugin.addRibbonIcon('git-commit-vertical', 'Open Rhizome Time Machine', (evt: MouseEvent) => {
            this.activateView();
        });
        this.ribbonIconEl.addClass('cornell-rhizome-ribbon-class');
    }

    unload() {
        console.log("🕰️ Time Machine Addon Unloaded");
        if (this.ribbonIconEl) {
            this.ribbonIconEl.remove();
            this.ribbonIconEl = null;
        }
        // Cerrar la vista si está abierta
        this.plugin.app.workspace.detachLeavesOfType(RHIZOME_VIEW_TYPE);
    }

    // Función para abrir la vista en el centro de Obsidian
    async activateView() {
        const { workspace } = this.plugin.app;
        
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(RHIZOME_VIEW_TYPE);

        if (leaves.length > 0) {
            // Si ya está abierta, la traemos al frente
            leaf = leaves[0];
        } else {
            // Si no está abierta, creamos una nueva pestaña en el ESPACIO CENTRAL (root)
            leaf = workspace.getLeaf('tab'); 
            await leaf.setViewState({ type: RHIZOME_VIEW_TYPE, active: true });
        }

        if (leaf) workspace.revealLeaf(leaf);
    }
}

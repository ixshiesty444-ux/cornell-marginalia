import { CornellAddon } from "./CornellAddon";

export class CustomBackgroundAddon extends CornellAddon {
    id = "custom-background";
    name = "Explorer Background";
    description = "Añade un fondo personalizado al explorador con efectos de blur.";

    load() {
        this.applyStyles();
    }

    unload() {
        this.removeStyles();
    }

    public applyStyles() {
        const stats = this.plugin.settings.userStats;
        if (!stats.customBackground) return;

        // Inyectamos variables CSS en el cuerpo de Obsidian
        document.body.style.setProperty('--cornell-sidebar-bg', `url("${stats.customBackground}")`);
        document.body.style.setProperty('--cornell-sidebar-blur', `${stats.bgBlur}px`);
        document.body.style.setProperty('--cornell-sidebar-opacity', `${stats.bgOpacity}`);
    }

    public removeStyles() {
        document.body.style.removeProperty('--cornell-sidebar-bg');
        document.body.style.removeProperty('--cornell-sidebar-blur');
        document.body.style.removeProperty('--cornell-sidebar-opacity');
    }
}

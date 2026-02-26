import { CornellAddon } from "./CornellAddon";
import { Notice } from "obsidian";

export class GamificationAddon extends CornellAddon {
    id = "gamification-profile";
    name = "User Profile & Stats";
    description = "Añade un perfil, experiencia y estadísticas al explorador.";

    load() {
        console.log("🎮 Addon de Gamificación Encendido!");
        // Aquí luego le diremos a Obsidian que escuche cada vez que se crea una nota
    }

    unload() {
        console.log("🎮 Addon de Gamificación Apagado!");
    }

    // Esta función la usaremos más adelante para darle puntos al usuario
    public addXp() {
        const stats = this.plugin.settings.userStats;
        
        stats.marginaliasCreated += 1;
        stats.xp += 10; // Ganas 10 XP por cada marginalia

        // Lógica simple para subir de nivel (cada 100 puntos = 1 nivel)
        const nextLevelThreshold = stats.level * 100;
        
        if (stats.xp >= nextLevelThreshold) {
            stats.level += 1;
            new Notice(`🎉 ¡Felicidades! Has alcanzado el Nivel ${stats.level} en Cornell Marginalia`);
        }
        
        // Guardamos los cambios en la mochila (settings)
        this.plugin.saveSettings();
    }
}

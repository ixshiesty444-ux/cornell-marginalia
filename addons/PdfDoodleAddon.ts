import { Notice, App, TFile } from 'obsidian';
import { CornellAddon } from './CornellAddon';
import CornellMarginalia from '../main';

export class PdfDoodleAddon extends CornellAddon {
    id = 'pdf-doodle';
    name = 'Doodle y Cosecha en PDF';
    description = 'Draw temporarily on PDFs and harvest marginalia with one click.';
    
    private activeBox: any = null;

    load(): void {
        this.plugin.addCommand({
            id: 'activate-pdf-doodle',
            name: 'Cornell: Start Drawing in PDF',
            checkCallback: (checking: boolean) => {
                const pdfLeaf = this.plugin.app.workspace.getLeavesOfType('pdf')[0];
                if (pdfLeaf) {
                    if (!checking) this.activateDoodleMode(pdfLeaf);
                    return true;
                }
                return false;
            }
        });
    }

    unload(): void {
        if (this.activeBox) this.activeBox.destroy();
    }

    private activateDoodleMode(leaf: any) {
        const container = leaf.view.containerEl;
        const pages = Array.from(container.querySelectorAll('.page, .pdf-page')) as HTMLElement[];
        
        const visiblePage = pages.find(p => {
            const rect = p.getBoundingClientRect();
            return rect.top < window.innerHeight && rect.bottom > 0;
        });

        if (!visiblePage) {
            new Notice("❌ I don't see any pages loaded. Scroll down a bit.");
            return;
        }

        if (this.activeBox) this.activeBox.destroy();

        // Le pasamos el plugin completo para que el Addon pueda guardar por su cuenta
        // @ts-ignore
        this.activeBox = new PdfDoodleCanvas(visiblePage, this.plugin);
    }
}

class PdfDoodleCanvas {
    private container: HTMLElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D | null;
    private button: HTMLElement;
    private isDrawing = false;
    
    private boundMouseDown!: (e: MouseEvent) => void;
    private boundMouseMove!: (e: MouseEvent) => void;
    private boundMouseUp!: (e: MouseEvent) => void;
    private boundDblClick!: (e: MouseEvent) => void;

    constructor(private parent: HTMLElement, private plugin: any) {
        this.container = document.createElement('div');
        this.container.addClass('cornell-pdf-overlay');
        
        this.canvas = document.createElement('canvas');
        const rect = parent.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        
        this.ctx = this.canvas.getContext('2d');
        if (this.ctx) {
            this.ctx.strokeStyle = '#000000'; 
            this.ctx.lineWidth = 4;
            this.ctx.lineCap = 'round';
        }

        this.button = document.createElement('div');
        this.button.innerHTML = '⚡';
        this.button.addClass('cornell-harvest-btn');
        this.button.style.display = 'none';

        this.container.appendChild(this.canvas);
        this.container.appendChild(this.button);
        this.parent.appendChild(this.container);

        this.initEvents();
        new Notice("✏️ Draw. Double-click to freeze and select text");
    }

    private initEvents() {
        this.boundMouseDown = (e: MouseEvent) => {
            this.isDrawing = true;
            const r = this.canvas.getBoundingClientRect();
            this.ctx?.beginPath();
            this.ctx?.moveTo(e.clientX - r.left, e.clientY - r.top);
        };

        this.boundMouseMove = (e: MouseEvent) => {
            if (!this.isDrawing) return;
            const r = this.canvas.getBoundingClientRect();
            this.ctx?.lineTo(e.clientX - r.left, e.clientY - r.top);
            this.ctx?.stroke();
        };

        this.boundMouseUp = () => {
            this.isDrawing = false;
        };

        this.boundDblClick = () => {
            this.enterRestMode();
        };

        this.canvas.addEventListener('mousedown', this.boundMouseDown);
        this.canvas.addEventListener('mousemove', this.boundMouseMove);
        window.addEventListener('mouseup', this.boundMouseUp);
        this.canvas.addEventListener('dblclick', this.boundDblClick);

        this.button.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.harvest();
        });
    }

    private enterRestMode() {
        this.canvas.removeEventListener('mousedown', this.boundMouseDown);
        this.canvas.removeEventListener('mousemove', this.boundMouseMove);
        this.canvas.removeEventListener('dblclick', this.boundDblClick);

        this.container.addClass('is-resting');
        this.canvas.style.cursor = 'default';
        this.button.style.display = 'flex';
        new Notice("⏸️ Select (and copy) the text, then press ⚡");
    }

    private async harvest() {
        // 1. LECTURA DEL PORTAPAPELES
        let clipboardText = "";
        try {
            clipboardText = await navigator.clipboard.readText() || "";
        } catch (e) {
            console.error("The clipboard could not be read.");
        }

        // 2. CREACIÓN DE LA IMAGEN
        const blob = await new Promise<Blob | null>(resolve => this.canvas.toBlob(resolve, 'image/png'));
        if (!blob) {
            this.destroy();
            return;
        }
        const arrayBuffer = await blob.arrayBuffer();
        
        // @ts-ignore
        const dateStr = window.moment().format('YYYYMMDD_HHmmss');
        const fileName = `doodle_${dateStr}.png`;
        const folder = this.plugin.settings.doodleFolder?.trim() || "";
        let attachmentPath = folder ? `${folder}/${fileName}` : fileName;
        
        await this.plugin.app.vault.createBinary(attachmentPath, arrayBuffer);
        const actualFileName = attachmentPath.split('/').pop();

        // 3. SINTAXIS EXACTA REQUERIDA POR EL USUARIO
        const textToInject = clipboardText.trim() ? clipboardText.trim() : "";
        const finalSyntax = `${textToInject}%%> img:[[${actualFileName}]]%%`;
        const finalMd = `\n${finalSyntax}\n\n---\n`;

        // 4. LÓGICA DE GUARDADO (Zettelkasten / Destino)
        const destInput = document.querySelector('.cornell-qc-dest') as HTMLInputElement;
        let cleanDestName = (destInput ? destInput.value : this.plugin.settings.lastOmniDestination) || "Marginalia Inbox";
        cleanDestName = cleanDestName.replace(/^\d{12,14}\s*-\s*/, '').trim();
        
        let finalDestName = cleanDestName;
        if (this.plugin.settings.zkMode) {
            // @ts-ignore
            const zkId = window.moment().format('YYYYMMDDHHmmss');
            finalDestName = (cleanDestName !== "Marginalia Inbox") ? `${zkId} - ${cleanDestName}` : zkId;
        }

        // 5. INYECCIÓN DIRECTA A LA NOTA
        let file = this.plugin.app.metadataCache.getFirstLinkpathDest(finalDestName, "");
        if (file instanceof TFile) {
            await this.plugin.app.vault.append(file, finalMd);
        } else {
            let newFileName = finalDestName.endsWith(".md") ? finalDestName : `${finalDestName}.md`;
            let folderPath = this.plugin.settings.zkMode ? this.plugin.settings.zkFolder?.trim() : this.plugin.settings.omniCaptureFolder?.trim(); 
            if (folderPath) {
                newFileName = `${folderPath}/${newFileName}`; 
            }
            const header = this.plugin.settings.zkMode ? `# 🗃️ ${finalDestName}\n` : `# 📥 ${finalDestName}\n`; 
            await this.plugin.app.vault.create(newFileName, header + finalMd); 
        }

        new Notice(`⚡ Harvest stored correctly.`);
        this.destroy();
    }

    destroy() { 
        window.removeEventListener('mouseup', this.boundMouseUp);
        this.container.remove(); 
    }
}
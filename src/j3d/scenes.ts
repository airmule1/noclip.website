
import ArrayBufferSlice from 'ArrayBufferSlice';
import Progressable from 'Progressable';
import { RenderState } from '../render';
import { assert, fetch, readString } from '../util';

import * as GX_Material from 'gx/gx_material';
import * as Viewer from '../viewer';
import * as Yaz0 from '../yaz0';

import { BMD, BMT, BTK, BRK, BCK } from './j3d';
import * as RARC from './rarc';
import { Scene, SceneLoader } from './render';

export class MultiScene implements Viewer.MainScene {
    public scenes: Scene[];
    public textures: Viewer.Texture[];

    constructor(scenes: Scene[]) {
        this.setScenes(scenes);
    }

    public render(renderState: RenderState) {
        this.scenes.forEach((scene) => {
            scene.render(renderState);
        });
    }

    public destroy(gl: WebGL2RenderingContext) {
        this.scenes.forEach((scene) => scene.destroy(gl));
    }

    protected setScenes(scenes: Scene[]) {
        this.scenes = scenes;
        this.textures = [];
        for (const scene of this.scenes)
            this.textures = this.textures.concat(scene.textures);
    }
}

export function createScene(gl: WebGL2RenderingContext, bmdFile: RARC.RARCFile, btkFile: RARC.RARCFile, brkFile: RARC.RARCFile, bckFile: RARC.RARCFile, bmtFile: RARC.RARCFile) {
    const bmd = BMD.parse(bmdFile.buffer);
    const bmt = bmtFile ? BMT.parse(bmtFile.buffer) : null;
    const sceneLoader: SceneLoader = new SceneLoader(bmd, bmt);
    const scene = sceneLoader.createScene(gl);
    scene.setBTK(btkFile ? BTK.parse(btkFile.buffer) : null);
    scene.setBRK(brkFile ? BRK.parse(brkFile.buffer) : null);
    scene.setBCK(bckFile ? BCK.parse(bckFile.buffer) : null);
    return scene;
}

function boolSort(a: boolean, b: boolean): number {
    if (a && !b)
        return -1;
    else if (b && !a)
        return 1;
    else
        return 0;
}

export function createScenesFromBuffer(gl: WebGL2RenderingContext, buffer: ArrayBufferSlice): Promise<Scene[]> {
    return Promise.resolve(buffer).then((buffer: ArrayBufferSlice) => {
        if (readString(buffer, 0, 4) === 'Yaz0')
            return Yaz0.decompress(buffer);
        else
            return buffer;
    }).then((buffer: ArrayBufferSlice) => {
        if (readString(buffer, 0, 4) === 'RARC') {
            const rarc = RARC.parse(buffer);
            const bmdFiles = rarc.files.filter((f) => f.name.endsWith('.bmd') || f.name.endsWith('.bdl'));
            let scenes = bmdFiles.map((bmdFile) => {
                // Find the corresponding btk.
                const basename = bmdFile.name.split('.')[0];
                const btkFile = rarc.files.find((f) => f.name === `${basename}.btk`);
                const brkFile = rarc.files.find((f) => f.name === `${basename}.brk`);
                const bckFile = rarc.files.find((f) => f.name === `${basename}.bck`);
                const bmtFile = rarc.files.find((f) => f.name === `${basename}.bmt`);
                const scene = createScene(gl, bmdFile, btkFile, brkFile, bckFile, bmtFile);
                scene.name = basename;
                if (basename.includes('_sky'))
                    scene.setIsSkybox(true);
                return scene;
            });
    
            // Sort skyboxen before non-skyboxen.
            scenes = scenes.sort((a, b) => {
                return boolSort(a.isSkybox, b.isSkybox);
            });
    
            return scenes;
        }
    
        if (['J3D2bmd3', 'J3D2bdl4'].includes(readString(buffer, 0, 8))) {
            const bmd = BMD.parse(buffer);
            const sceneLoader = new SceneLoader(bmd);
            const scene = sceneLoader.createScene(gl);
            return [scene];
        }
    
        return null;
    });
}

export function createMultiSceneFromBuffer(gl: WebGL2RenderingContext, buffer: ArrayBufferSlice): Promise<MultiScene> {
    return createScenesFromBuffer(gl, buffer).then((scenes) => {
        return new MultiScene(scenes);
    });
}

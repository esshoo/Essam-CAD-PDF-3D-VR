// EssamEngine.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Import our new modules
import { SceneBuilder } from './SceneBuilder.js';
import { InteractionManager } from './InteractionManager.js';
import { StorageManager } from './StorageManager.js';
import { ExportManager } from './ExportManager.js';

export class EssamEngine {
    constructor(containerSelector) {
        this.container = typeof containerSelector === 'string' ? document.querySelector(containerSelector) : document.body;
        if (!this.container) return;

        // Core Components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.composer = null; 
        this.dolly = new THREE.Group();

        // Default Settings
        this.settings = { height: 3.0, thickness: 0.20 };

        // Modules
        this.sceneBuilder = null;
        this.interactionManager = null;
        this.storageManager = null;

		// لتخزين البيانات للتصدير
        this.cachedDXF = null;
        this.cachedConfig = null;
        this.currentRoomGroup = null; // <--- هذا هو المتغير المهم

        this.init();
    }

    init() {
        // 1. المشهد
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111111);

		// 2. الكاميرا والـ Dolly
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50000);
        this.camera.position.set(0, 50, 50);
        this.dolly.add(this.camera);
        this.scene.add(this.dolly);

        // 3. الريندر
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        this.renderer.toneMappingExposure = 1.0; 
        this.renderer.xr.enabled = true;
        this.renderer.xr.setReferenceSpaceType('local-floor');
        
        while (this.container.firstChild) this.container.removeChild(this.container.firstChild);
        this.container.appendChild(this.renderer.domElement);
        this.container.appendChild(VRButton.createButton(this.renderer));

		// 4. الإضاءة والأرضية (هذه لن يتم تصديرها الآن)
        this.ambientLight = new THREE.HemisphereLight(0xffffff, 0x222222, 0.5);
        this.scene.add(this.ambientLight);
        
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        this.sunLight.position.set(-10, 50, 50);
        this.scene.add(this.sunLight);
        
        const floorGeo = new THREE.PlaneGeometry(5000, 5000);
        const floorMat = new THREE.MeshBasicMaterial({ visible: false });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.name = "floor";
        this.scene.add(floor);

        // 5. التحكم والمؤثرات
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };

        this.setupPostProcessing();

		this.createSunControl();

		// 6. تهيئة المديرين
        this.sceneBuilder = new SceneBuilder(this.scene);
        
        // ب. مدير التفاعل يحتاج كل شيء تقريباً
        this.interactionManager = new InteractionManager(
            this.scene, 
            this.camera, 
            this.renderer, 
            this.container, 
            this.controls, 
            this.dolly
        );

        // ج. مدير التخزين يحتاج مدير التفاعل (لحفظ القياسات)
        this.storageManager = new StorageManager(this.interactionManager);

// تهيئة مدير التصدير
        this.exportManager = new ExportManager();
        
        // إنشاء أزرار التصدير (إضافة للأزرار الموجودة)
        this.createExportButtons();

        // 7. Event Listeners for Resize
        window.addEventListener('resize', () => this.onResize());
        
        // 8. Start Loop
        this.renderer.setAnimationLoop(() => this.render());
        this.onResize();
    }

createSunControl() {
        const div = document.createElement('div');
        Object.assign(div.style, {
            position: 'absolute', top: '20px', right: '20px', zIndex: '10000',
            background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '8px',
            color: 'white', fontFamily: 'sans-serif', fontSize: '12px',
            border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)'
        });
        div.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:5px;">
                <label style="font-weight:bold;">☀ Sun Power</label>
                <input type="range" min="0" max="2" step="0.1" value="1.0" style="cursor:pointer;">
            </div>
        `;
        div.querySelector('input').oninput = (e) => this.updateSun(parseFloat(e.target.value));
        this.container.appendChild(div);
    }

    updateSun(intensity) {
        if(this.sunLight) this.sunLight.intensity = intensity;
        if(this.ambientLight) this.ambientLight.intensity = intensity * 0.5;
        
        // تعتيم الخلفية مع خفض الإضاءة لواقعية الليل
        const val = Math.min(0.1, intensity * 0.1);
        this.scene.background.setRGB(val, val, val);
    }

createExportButtons() {
        const div = document.createElement('div');
        Object.assign(div.style, {
            position: 'absolute', bottom: '20px', right: '20px', zIndex: '10000',
            display: 'flex', gap: '10px'
        });

        // زر تصدير المجسم GLB
        const btnGLB = document.createElement('button');
        btnGLB.textContent = "📥 Export GLB";
        Object.assign(btnGLB.style, {
            padding: '8px 12px', background: '#28a745', color: 'white', border: 'none', 
            borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'sans-serif'
        });
        btnGLB.onclick = () => {
            // هنا الحل: نرسل currentRoomGroup فقط، وليس this.scene
            if (this.currentRoomGroup) {
                this.exportManager.exportGLB(this.currentRoomGroup);
            } else {
                alert("لا يوجد مجسم لتصديره حالياً.");
            }
        };

        // زر تصدير البيانات JSON
        const btnJSON = document.createElement('button');
        btnJSON.textContent = "📄 Export JSON";
        Object.assign(btnJSON.style, {
            padding: '8px 12px', background: '#17a2b8', color: 'white', border: 'none', 
            borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'sans-serif'
        });
        btnJSON.onclick = () => {
            if(this.cachedDXF) {
                this.exportManager.exportConfigJSON(this.cachedDXF, this.cachedConfig, this.settings);
            } else {
                alert("لم يتم تحميل ملف لتصدير بياناته.");
            }
        };

        div.appendChild(btnGLB);
        div.appendChild(btnJSON);
        this.container.appendChild(div);
    }

// --- دالة البناء (مهمة جداً للتصدير) ---
    buildSceneFromConfig(dxf, layerConfig, globalSettings, forcedScale = 1.0) {
        // حفظ البيانات لاستخدامها في تصدير JSON
        this.cachedDXF = dxf;
        this.cachedConfig = layerConfig;
        this.settings = { ...globalSettings }; // تحديث الإعدادات

        // البناء الفعلي
        const result = this.sceneBuilder.build(dxf, layerConfig, globalSettings, forcedScale);
        
        // [هام] حفظ مجموعة الغرفة الحالية في متغير لنرسله للمصدر
        this.currentRoomGroup = result.roomGroup;

        // تحديث باقي النظام (التفاعل، الكاميرا، الارتفاع)
        this.settings.height = result.finalHeight;
        this.interactionManager.updateTargets(result.roomGroup, result.snapPoints);
        
        if (!this.renderer.xr.isPresenting) {
            this.sceneBuilder.fitCamera(this.camera, this.controls);
        }
        this.storageManager.loadFromLocalStorage();

        if (globalSettings.sunIntensity !== undefined) {
            this.updateSun(globalSettings.sunIntensity);
            const slider = this.container.querySelector('input[type="range"]');
            if(slider) slider.value = globalSettings.sunIntensity;
        }
    }

    setupPostProcessing() {
        const renderScene = new RenderPass(this.scene, this.camera);
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        bloomPass.threshold = 0.95; 
        bloomPass.strength = 1.2; 
        bloomPass.radius = 0.3;
        const outputPass = new OutputPass();
        
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(bloomPass);
        this.composer.addPass(outputPass);
    }

    onResize() {
        if(!this.container) return;
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        if(this.composer) this.composer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    render() {
        if(this.renderer.xr.isPresenting) {
            // تحديث منطق الـ VR داخل مدير التفاعل
            this.interactionManager.updateVR();
            this.renderer.render(this.scene, this.camera);
        } else {
            this.controls.update();
            // حفظ القياسات عند كل فريم ليس ضرورياً، يتم الحفظ عند انتهاء القياس فقط
            if (this.composer) {
                this.composer.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }
    }
}
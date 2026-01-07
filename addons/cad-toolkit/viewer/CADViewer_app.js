import { Viewer2d } from "@x-viewer/core";
import {
  LocalDxfUploader,
  AxisGizmoPlugin,
  BottomBarPlugin,
  MeasurementPlugin,
  Viewer2dToolbarPlugin,
  MarkupPlugin,
  Settings2dPlugin,
  StatsPlugin,
  LayerManagerPlugin,
  ToolbarMenuId,
} from "@x-viewer/plugins";

/**
 * CADViewerApp
 * - Keeps x-viewer UI (toolbar + bottom bar + stats)
 * - Uses built-in Layers panel for 2D (colors + show/hide)
 * - Our 3D Rules panel stays independent (opened from FloatingFabMenu)
 */
export class CADViewerApp {
  constructor(containerId = "myCanvas", options = {}) {
    this.containerId = containerId;
    this.options = options || {};
    this.viewer = null;
    this.uploader = null;
    this.layerManager = null;
  }

  async init() {
    const viewerCfg = {
      containerId: this.containerId,
      language: "en",
      enableSpinner: true,
      enableProgressBar: true,
      enableLayoutBar: true,
      enableLocalCache: false,
    };

    this.viewer = new Viewer2d(viewerCfg);

    // Fonts
    try {
      await this.viewer.setFont([
        "./libs/fonts/hztxt.shx",
        "./libs/fonts/simplex.shx",
        "./libs/fonts/arial.ttf",
        "./libs/fonts/helvetiker_regular.typeface.json",
        "./libs/fonts/Microsoft_YaHei.ttf",
        "./libs/fonts/Microsoft_YaHei_Regular.typeface.json",
      ]);
    } catch (e) {
      console.warn("Font loading warning:", e);
    }

    this._initPluginsFull();
    this._initUploader();

    console.log("System Ready.");
  }

  _initPluginsFull() {
    new AxisGizmoPlugin(this.viewer, { ignoreZAxis: true });
    new BottomBarPlugin(this.viewer);
    new MeasurementPlugin(this.viewer, { language: "en" });
    new MarkupPlugin(this.viewer);
    new Settings2dPlugin(this.viewer, { language: "en", visible: false });
    new StatsPlugin(this.viewer);

    const menuConfig = {
      [ToolbarMenuId.Layers]: {
        onActive: () => {
          if (!this.layerManager) this.layerManager = new LayerManagerPlugin(this.viewer);
          this.layerManager.setVisible(true);
        },
        onDeactive: () => {
          if (this.layerManager) this.layerManager.setVisible(false);
        },
      },
    };

    new Viewer2dToolbarPlugin(this.viewer, { menuConfig, language: "en" });
  }

  _initUploader() {
    this.uploader = new LocalDxfUploader(this.viewer);
    this.uploader.setPdfWorker("./libs/pdf/pdf.worker.min.js");
    this.uploader.onSuccess = () => {
      console.log("File Uploaded.");
      window.dispatchEvent(new CustomEvent("cad:file-loaded"));
    };
  }

  openFileUpload() {
    if (this.uploader) this.uploader.openFileBrowserToUpload();
  }
}

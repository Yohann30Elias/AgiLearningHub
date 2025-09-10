sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
  "use strict";
  return UIComponent.extend("agilh.Component", {
    metadata: { manifest: "json" },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      // Default-Model laden
      var oModel = new JSONModel();
      oModel.loadData("/api/courses.json");
      this.setModel(oModel);

      // Routing
      if (this.getRouter) this.getRouter().initialize();
    }
  });
});

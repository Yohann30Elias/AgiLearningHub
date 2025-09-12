sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
  "use strict";
  return UIComponent.extend("agilh.Component", {
    metadata: { manifest: "json" },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      // Globales Datenmodel laden
      var oDataModel = new JSONModel();
      oDataModel.attachRequestCompleted(function () {
        console.log("data.json geladen:", oDataModel.getData());
      });
      oDataModel.attachRequestFailed(function (e) {
        console.error("data.json laden fehlgeschlagen", e);
      });
      oDataModel.loadData("/api/data.json", null, true);
      this.setModel(oDataModel, "data");

      this.getRouter().initialize();
    }
  });
});

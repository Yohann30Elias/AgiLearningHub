sap.ui.define(["sap/ui/core/mvc/Controller"], function (Controller) {
  "use strict";
  return Controller.extend("agilh.controller.App", {
    onNav: function (oEvent) {
      var aCD = oEvent.getSource().getCustomData() || [];
      var cdRoute = aCD.find(function (cd) { return cd.getKey && cd.getKey() === "route"; });
      var sRoute = cdRoute && cdRoute.getValue();
      if (sRoute) {
        this.getOwnerComponent().getRouter().navTo(sRoute);
      }
    },
    onHome: function () {
      this.getOwnerComponent().getRouter().navTo("landing");
    }
  });
});

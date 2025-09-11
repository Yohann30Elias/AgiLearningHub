// webapp/controller/App.controller.js
sap.ui.define([
  "sap/ui/core/mvc/Controller"
], function (Controller) {
  "use strict";

  return Controller.extend("agilh.controller.App", {
    onTopNavLink: function (e) {
      const cd = (e.getSource().getCustomData() || []).find(function (c) {
        return c.getKey && c.getKey() === "route";
      });
      if (cd) {
        this.getOwnerComponent().getRouter().navTo(cd.getValue());
      }
    }
  });
});

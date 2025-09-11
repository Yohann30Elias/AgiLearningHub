sap.ui.define(["sap/ui/core/mvc/Controller"], function (Controller) {
  "use strict";
  return Controller.extend("agilh.controller.App", {
    onTopNavLink: function (e) {
      const cd = (e.getSource().getCustomData() || []).find(c => c.getKey && c.getKey() === "route");
      if (cd) this.getOwnerComponent().getRouter().navTo(cd.getValue());
    }
  });
});

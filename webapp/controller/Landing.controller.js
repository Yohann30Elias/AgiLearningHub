sap.ui.define(["sap/ui/core/mvc/Controller", "sap/m/URLHelper"], function (Controller, URLHelper) {
  "use strict";
  return Controller.extend("agilh.controller.Landing", {
    onOpenExternal: function (oEvent) {
      var aCD = oEvent.getSource().getCustomData() || [];
      var oCD = aCD.find(function (cd) { return cd.getKey && cd.getKey() === "url"; });
      var url = oCD && oCD.getValue();
      if (url) URLHelper.redirect(url, true);
    }
  });
});

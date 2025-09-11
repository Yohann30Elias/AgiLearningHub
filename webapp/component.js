sap.ui.define(["sap/ui/core/UIComponent"], function (UIComponent) {
  "use strict";
  return UIComponent.extend("agilh.Component", {
    metadata: { manifest: "json" },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
      this.getRouter().attachRouteMatched(function (e) {
        console.log("Route matched:", e.getParameter("name"));
      });
      this.getRouter().initialize();
    },
  });
});

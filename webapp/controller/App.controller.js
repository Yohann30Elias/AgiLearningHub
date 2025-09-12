sap.ui.define(["sap/ui/core/mvc/Controller"], function (Controller) {
  "use strict";

  return Controller.extend("agilh.controller.App", {

    onMenuSelect: function (e) {
      var item = e.getParameter("item");
      var cd = (item.getCustomData() || []).find(function (c) {
        return c.getKey && c.getKey() === "route";
      });
      if (cd) {
        this.getOwnerComponent().getRouter().navTo(cd.getValue());
      }
    },

    onSearchPressed: function () { /* später: Suche */ },
    onAvatarPressed: function () { /* später: Profil-Popover */ }
  });
});

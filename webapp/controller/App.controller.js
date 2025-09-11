sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/ResponsivePopover",
  "sap/m/List",
  "sap/m/StandardListItem",
  "sap/ui/core/CustomData"
], function (Controller, ResponsivePopover, List, StandardListItem, CustomData) {
  "use strict";

  return Controller.extend("agilh.controller.App", {
    // Link-Zeile
    onTopNavLink: function (e) {
      const cd = (e.getSource().getCustomData() || []).find(c => c.getKey && c.getKey() === "route");
      if (cd) this.getOwnerComponent().getRouter().navTo(cd.getValue());
    },

    // ShellBar-Icons
    onShellItem: function (e) {
      const cd = (e.getSource().getCustomData() || []).find(c => c.getKey && c.getKey() === "route");
      if (cd) this.getOwnerComponent().getRouter().navTo(cd.getValue());
    },

    // Avatar → kleines Profilmenü (ohne Fragment)
    onAvatarPressed: function (e) {
      if (!this._oProfilePopover) {
        const list = new List();
        const add = (title, icon, action, visible = true) => {
          const it = new StandardListItem({ title, icon, type: "Active", visible });
          it.addCustomData(new CustomData({ key: "action", value: action }));
          it.attachPress(this.onProfileAction, this);
          list.addItem(it);
        };

        const isIn = !!localStorage.getItem("agilh.demoEmail");
        add("Mein Profil",   "sap-icon://person-placeholder", "profile");
        add("Einstellungen", "sap-icon://action-settings",    "settings");
        add("Anmelden",      "sap-icon://log",                "login",  !isIn);
        add("Abmelden",      "sap-icon://log",                "logout",  isIn);

        this._oProfilePopover = new ResponsivePopover({
          placement: "BottomEnd",
          showHeader: false,
          contentWidth: "16rem",
          content: [list]
        });
        this.getView().addDependent(this._oProfilePopover);
      } else {
        // Sichtbarkeit Login/Logout bei jedem Öffnen aktualisieren
        const isIn = !!localStorage.getItem("agilh.demoEmail");
        const items = this._oProfilePopover.getContent()[0].getItems();
        if (items[2]) items[2].setVisible(!isIn); // Login
        if (items[3]) items[3].setVisible( isIn); // Logout
      }
      this._oProfilePopover.openBy(e.getSource());
    },

    onProfileAction: function (e) {
      const cd = (e.getSource().getCustomData() || []).find(c => c.getKey && c.getKey() === "action");
      const action = cd && cd.getValue();

      if (action === "profile" || action === "settings") {
        // navigiert zur Profil-Seite (Route muss im manifest vorhanden sein)
        try { this.getOwnerComponent().getRouter().navTo("profile"); } catch (err) { /* noop */ }
      } else if (action === "login") {
        localStorage.setItem("agilh.demoEmail", "ali.mueller@contoso.net"); // Demo-Login
        location.reload();
      } else if (action === "logout") {
        localStorage.removeItem("agilh.demoEmail");
        location.reload();
      }
    }
  });
});

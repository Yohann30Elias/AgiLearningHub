sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/ResponsivePopover",
  "sap/m/List",
  "sap/m/StandardListItem",
  "sap/ui/core/CustomData",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/MessageToast",
  "sap/ui/model/json/JSONModel",
  "sap/m/Avatar"
], function (
  Controller, ResponsivePopover, List, StandardListItem, CustomData,
  Dialog, Button, Label, Input, MessageToast, JSONModel, Avatar
) {
  "use strict";

  const LS_KEY = "agilh.user";

  return Controller.extend("agilh.controller.App", {

    onInit: function () {
      // Avatar-Initialen nach Login-Status setzen
      this._refreshAvatar();
    },

    // -------- ShellBar: Avatar gedrückt --------
    onAvatarPressed: function (e) {
      const src = e.getSource();

      if (!this._oProfilePopover) {
        // einmalig bauen
        const list = new List({ width: "16rem" });
        this._oProfileList = list;

        this._oProfilePopover = new ResponsivePopover({
          showHeader: false,
          placement: "BottomEnd",
          content: [list]
        });
        this.getView().addDependent(this._oProfilePopover);
      }

      // Liste je nach Login-State auffüllen
      this._rebuildProfileList();

      this._oProfilePopover.openBy(src);
    },

    // -------- Popover-Inhalte (abhängig vom Status) --------
    _rebuildProfileList: function () {
      const list = this._oProfileList;
      list.removeAllItems();

      const user = this._getCurrentUser();
      const add = (title, icon, action) => {
        const it = new StandardListItem({ title, icon, type: "Active" });
        it.addCustomData(new CustomData({ key: "action", value: action }));
        it.attachPress(this._onProfileAction, this);
        list.addItem(it);
      };

      if (user) {
        add("Mein Profil", "sap-icon://person-placeholder", "profile");
        add("Abmelden",    "sap-icon://log",                "logout");
      } else {
        add("Anmelden",                "sap-icon://log",          "login");
        add("Mit SAP ID registrieren", "sap-icon://add-employee", "sapid");
      }
    },

    _onProfileAction: function (e) {
      const action = e.getSource().getCustomData().find(c => c.getKey() === "action").getValue();
      if (action === "profile") {
        this.getOwnerComponent().getRouter().navTo("profile");
        this._oProfilePopover && this._oProfilePopover.close();
      } else if (action === "logout") {
        localStorage.removeItem(LS_KEY);
        MessageToast.show("Abgemeldet");
        this._refreshAvatar();
        this._oProfilePopover && this._oProfilePopover.close();
      } else if (action === "login") {
        this._openLoginDialog();
      } else if (action === "sapid") {
        MessageToast.show("SAP ID Registrierung (Stub) – später implementieren");
        // z.B. window.open("https://me.sap.com/c/identity", "_blank", "noopener");
      }
    },

    // -------- Login-Dialog --------
    _openLoginDialog: function () {
      if (this._oLoginDlg) {
        this._oLoginDlg.open();
        return;
      }
      const inp = new Input({ width: "100%", placeholder: "E-Mail oder Benutzername" });

      this._oLoginDlg = new Dialog({
        title: "Anmelden",
        contentWidth: "28rem",
        content: [
          new Label({ text: "E-Mail oder Benutzername", labelFor: inp }),
          inp
        ],
        beginButton: new Button({
          text: "Anmelden",
          type: "Emphasized",
          press: async () => {
            const id = (inp.getValue() || "").trim();
            if (!id) { MessageToast.show("Bitte E-Mail oder Benutzername eingeben"); return; }

            const user = await this._lookupUser(id);
            if (!user) {
              MessageToast.show("Nutzer nicht gefunden");
              return;
            }
            // Login speichern
            localStorage.setItem(LS_KEY, JSON.stringify(user));
            MessageToast.show("Willkommen, " + (user.displayName || user.username || user.email));
            this._refreshAvatar();
            this._oLoginDlg.close();
            this._oProfilePopover && this._oProfilePopover.close();
          }
        }),
        endButton: new Button({ text: "Abbrechen", press: () => this._oLoginDlg.close() })
      });
      this.getView().addDependent(this._oLoginDlg);
      this._oLoginDlg.open();
    },

    // -------- Nutzerprüfung (API / Fallback) --------
    _lookupUser: async function (identifier) {
      const users = await this._loadUsers();
      const id = identifier.toLowerCase();
      return users.find(u =>
        (u.email && u.email.toLowerCase() === id) ||
        (u.username && u.username.toLowerCase() === id)
      ) || null;
    },

    _loadUsers: function () {
      if (this._usersPromise) return this._usersPromise;

      this._usersPromise = new Promise((resolve) => {
        const model = new JSONModel();
        model.attachRequestCompleted(() => {
          const data = model.getData();
          // erwartet Array; sonst Fallback
          if (Array.isArray(data)) { resolve(data); }
          else if (data && Array.isArray(data.users)) { resolve(data.users); }
          else resolve(this._fallbackUsers());
        });
        model.attachRequestFailed(() => resolve(this._fallbackUsers()));
        // versucht lokale Fake-API (ui5-servestatic /api → mockdata)
        model.loadData("/api/users.json");
      });

      return this._usersPromise;
    },

    _fallbackUsers: function () {
      // einfache Demo-Liste
      return [
        { id: "u001", email: "ali.mueller@contoso.net", username: "ali",  displayName: "Ali Müller" },
        { id: "u002", email: "sara.khan@example.com",   username: "sara", displayName: "Sara Khan" }
      ];
    },

    // -------- Avatar/State Utilities --------
    _getCurrentUser: function () {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); }
      catch (e) { return null; }
    },

    _refreshAvatar: function () {
      const shell = this.byId("shell");
      let avatar = shell.getProfile && shell.getProfile();
      const user = this._getCurrentUser();

      const initials = user ? this._initials(user.displayName || user.username || user.email) : "AG";

      if (avatar) {
        avatar.setInitials(initials);
      } else {
        avatar = new Avatar({ initials, size: "S" });
        shell.setProfile(avatar);
      }
    },

    _initials: function (s) {
      if (!s) return "AG";
      const parts = s.replace(/@.*/, "").split(/[.\s_-]+/).filter(Boolean);
      const first = (parts[0] || "").charAt(0);
      const second = (parts[1] || "").charAt(0);
      return (first + second || first || "AG").toUpperCase();
    },

    // -------- bereits vorhandene Handler-Stubs --------
    onTopNavLink: function (e) {
      const cd = (e.getSource().getCustomData() || []).find(c => c.getKey && c.getKey() === "route");
      if (cd) this.getOwnerComponent().getRouter().navTo(cd.getValue());
    },
    onOpenExternal: function (e) {
      const cd = (e.getSource().getCustomData() || []).find(c => c.getKey && c.getKey() === "url");
      const url = cd && cd.getValue();
      if (url) window.open(url, "_blank", "noopener");
    },
    onSearchPressed: function () {},
    onHomePressed: function () {
      this.getOwnerComponent().getRouter().navTo("landing");
    }
  });
});

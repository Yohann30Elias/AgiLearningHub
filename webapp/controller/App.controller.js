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
  "sap/m/Avatar"
], function (
  Controller, ResponsivePopover, List, StandardListItem, CustomData,
  Dialog, Button, Label, Input, MessageToast, Avatar
) {
  "use strict";

  const LS_KEY = "agilh.user";

  return Controller.extend("agilh.controller.App", {

    onInit: function () {
      // Avatar/Profil initial setzen
      this._refreshAvatar();

      // Events sicherheitshalber direkt an die ShellBar hängen
      var shell = this.byId("shell");
      if (shell) {
        shell.attachAvatarPressed(this.onAvatarPressed, this);
        shell.attachHomeIconPressed(this.onHomePressed, this);
      }
    },

    // -------- ShellBar: Avatar gedrückt --------
    onAvatarPressed: function (e) {
      // immer den Avatar als Anker verwenden
      var shell  = this.byId("shell");
      var opener = (shell && shell.getProfile) ? shell.getProfile() : e.getSource();

      if (!this._oProfilePopover) {
        const list = new List({ width: "15rem" });
        this._oProfileList = list;

        this._oProfilePopover = new ResponsivePopover({
          showHeader: false,
          placement: "Bottom",
          contentWidth: "15.1rem",
          content: [list]
        });
        this.getView().addDependent(this._oProfilePopover);
      }

      this._rebuildProfileList();
      this._oProfilePopover.openBy(opener);
    },

    // -------- Popover-Inhalte --------
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
        add("Anmelden",                 "sap-icon://log",          "login");
        add("Mit SAP ID registrieren",  "sap-icon://add-employee", "sapid");
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
        this._afterAuthChange();

      } else if (action === "login") {
        this._openLoginDialog();

      } else if (action === "sapid") {
        MessageToast.show("SAP ID Registrierung (Stub) – später implementieren");
      }
    },

    // -------- Login-Dialog --------
    _openLoginDialog: function () {
      if (this._oLoginDlg) { this._oLoginDlg.open(); return; }

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
            if (!user) { MessageToast.show("Nutzer nicht gefunden"); return; }

            localStorage.setItem(LS_KEY, JSON.stringify(user));
            MessageToast.show("Willkommen, " + (user.name || user.email));
            this._refreshAvatar();
            this._oLoginDlg.close();
            this._oProfilePopover && this._oProfilePopover.close();
            this._afterAuthChange();
          }
        }),
        endButton: new Button({ text: "Abbrechen", press: () => this._oLoginDlg.close() })
      });

      this.getView().addDependent(this._oLoginDlg);
      this._oLoginDlg.open();
    },

    // -------- Nutzerprüfung gegen data.json --------
    _lookupUser: async function (identifier) {
      const users = await this._getUsersFromDataModel();
      const q = (identifier || "").toString().toLowerCase().trim();

      const norm = s => (s || "").toString().toLowerCase().trim();

      const match = users.find(u => {
        const email   = norm(u.email);
        const prefix  = (email.split("@")[0] || "").trim();
        const uname   = norm(u.username) || norm(u.user_name) || norm(u.login) || prefix;
        const name    = norm(u.name) || norm(u.displayName);

        return q === email || q === prefix || q === uname || q === name;
      });

      // Debug (einmalig hilfreich): console.log({q, found: !!match, total: users.length, sample: users.slice(0,3)});
      return match ? {
        email: match.email || "",
        name: match.name || match.displayName || match.username || match.user_name || match.login || match.email,
        role: match.role || "user",
        avatar_url: match.avatar_url || ""
      } : null;
    },

    _getUsersFromDataModel: function () {
      return new Promise((resolve) => {
        const m = this.getOwnerComponent().getModel("data");
        if (!m) return resolve([]);

        const pick = () => {
          const d = m.getData && m.getData();
          // Hauptpfad
          let arr = d && d.master_data && Array.isArray(d.master_data.users) ? d.master_data.users : null;

          // Fallback: irgendein Array mit E-Mail-Feldern finden (nur wenn nötig)
          if (!arr && d && typeof d === "object") {
            for (const k of Object.keys(d)) {
              const v = d[k];
              if (v && typeof v === "object") {
                const maybe = v.users || v.user || v.people || null;
                if (Array.isArray(maybe) && maybe.length && typeof maybe[0] === "object" && ("email" in maybe[0])) {
                  arr = maybe; break;
                }
              }
            }
          }
          resolve(Array.isArray(arr) ? arr : []);
        };

        // Schon da?
        const d = m.getData && m.getData();
        if (d && Object.keys(d).length) { pick(); return; }

        // Auf Laden warten
        const done = () => { m.detachRequestCompleted(done, this); pick(); };
        m.attachRequestCompleted(done, this);
        m.attachRequestFailed(() => resolve([]), this);
      });
    },


    // -------- Avatar/State Utilities --------
    _getCurrentUser: function () {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); }
      catch (e) { return null; }
    },

    _refreshAvatar: function () {
      var shell = this.byId("shell");
      if (!shell) return;

      var avatar = shell.getProfile && shell.getProfile();
      var user = this._getCurrentUser();

      if (!avatar) {
        avatar = new Avatar({ size: "S" });
        // Fallback: Avatar selbst klickbar machen
        avatar.attachPress(this.onAvatarPressed, this);
        shell.setProfile(avatar);
      }

      if (user) {
        const txt = user.name || user.email || "";
        avatar.setInitials(this._initials(txt));
        avatar.setSrc(user.avatar_url || "");
      } else {
        avatar.setSrc("");
        avatar.setInitials("AG");
      }
    },

    _initials: function (s) {
      if (!s) return "AG";
      const parts = s.replace(/@.*/, "").split(/[.\s_-]+/).filter(Boolean);
      const a = (parts[0] || "").charAt(0);
      const b = (parts[1] || "").charAt(0);
      return (a + b || a || "AG").toUpperCase();
    },

    // -------- vorhandene Handler --------
    onTopNavLink: function (e) {
      const cd = (e.getSource().getCustomData() || []).find(c => c.getKey && c.getKey() === "route");
      if (cd) this.getOwnerComponent().getRouter().navTo(cd.getValue());
    },

    onMenuSelect: function (oEvent) {
      const item = oEvent.getParameter("item");
      if (!item) return;

      // 1) via CustomData-API
      const cd = (item.getCustomData() || []).find(c => c.getKey && c.getKey() === "route");
      const route = cd && cd.getValue();

      // 2) Fallback: die bequeme Kurzform (UI5 Control#data)
      // const route = item.data && item.data("route");

      if (route) {
        this.getOwnerComponent().getRouter().navTo(route);
      }
    },

    onOpenExternal: function (e) {
      const cd = (e.getSource().getCustomData() || []).find(c => c.getKey && c.getKey() === "url");
      const url = cd && cd.getValue();
      if (url) window.open(url, "_blank", "noopener");
    },

    _afterAuthChange: function () {
      this.getOwnerComponent().getRouter().navTo("landing", {}, true);
      sap.ui.getCore().getEventBus().publish("agilh", "authChanged");
      try { window.scrollTo({ top: 0, behavior: "auto" }); } catch(e) {}
    },


    onSearchPressed: function () {},

    onHomePressed: function () {
      this.getOwnerComponent().getRouter().navTo("landing");
    }
  });
});

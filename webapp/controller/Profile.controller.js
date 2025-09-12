sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
  "use strict";

  const LS_KEY = "agilh.user";

  function norm(v) { return (v == null ? "" : String(v)).trim(); }
  function lower(v){ return norm(v).toLowerCase(); }
  function first(obj, keys, dflt) {
    for (var i=0;i<keys.length;i++){ var k=keys[i]; if (obj && obj[k]!=null) return obj[k]; }
    return dflt;
  }

  return Controller.extend("agilh.controller.Profile", {

    onInit: function () {
      // ViewModel für die Seite
      var vm = new JSONModel({
        loggedIn: false,
        user: { name:"", email:"", role:"", avatar_url:"", initials:"" },
        completed: [],
        completedCount: 0
      });
      this.getView().setModel(vm, "profile");

      // ROUTE-HOOK (Option B): bei jedem Aufruf der Profil-Route neu laden
      this._oRouter = this.getOwnerComponent().getRouter();
      if (this._oRouter && this._oRouter.getRoute) {
        this._oRouter.getRoute("profile").attachPatternMatched(this._onRouteMatched, this);
      }

      // Initialer Aufbau (falls direkt auf Profile landet und Daten schon da sind)
      var current = this._getCurrentUser();
      var m = this.getOwnerComponent().getModel("data");
      if (!current || !m) return;

      if (m.getData && Object.keys(m.getData() || {}).length) {
        this._buildProfile(current);
      } else {
        var done = () => { m.detachRequestCompleted(done, this); this._buildProfile(current); };
        m.attachRequestCompleted(done, this);
      }
    },

    // Route „profile“ wurde getroffen → Profil immer frisch bauen
    _onRouteMatched: function () {
      var vm = this.getView().getModel("profile");
      var current = this._getCurrentUser();
      var m = this.getOwnerComponent().getModel("data");

      if (!current || !m) {
        // sauber zurücksetzen, wenn nicht eingeloggt
        vm.setProperty("/loggedIn", false);
        vm.setProperty("/user", { name:"", email:"", role:"", avatar_url:"", initials:"" });
        vm.setProperty("/completed", []);
        vm.setProperty("/completedCount", 0);
        return;
      }

      if (m.getData && Object.keys(m.getData() || {}).length) {
        this._buildProfile(current);
      } else {
        var done = () => { m.detachRequestCompleted(done, this); this._buildProfile(current); };
        m.attachRequestCompleted(done, this);
      }
    },

    // ------------------- Profil bauen -------------------
    _buildProfile: function (current) {
      var vm = this.getView().getModel("profile");
      var m  = this.getOwnerComponent().getModel("data");
      var d  = m.getData() || {};

      var users   = first(d, ["master_data"], {});
      users       = first(users, ["users"], []);
      var courses = first(d, ["master_data"], {});
      courses     = first(courses, ["courses"], []);
      var tx      = first(d, ["transactional_data"], {});
      var ucp     = first(tx, ["user_course_progress"], []); // Array

      // User-Objekt aus Daten anreichern (falls nötig)
      var user = this._resolveUser(current, users);

      // Map für Kurs-Lookups
      var courseMap = {};
      courses.forEach(function (c) {
        var cid = first(c, ["id", "course_id", "courseId"], null);
        if (cid) courseMap[cid] = c;
      });

      // Progress-Einträge für diesen User
      var email = lower(user.email);
      var myProgress = ucp.filter(function (p) {
        // robustes Matching
        var e = lower(first(p, ["user_email", "email", "userMail"], ""));
        var uid = first(p, ["user_id", "userId"], null);
        return (e && e === email) || (!!uid && uid === user.id);
      });

      // Completed-Definition: status===completed ODER progress>=100 ODER completed_at gesetzt
      var completed = myProgress.filter(function (p) {
        var status = lower(first(p, ["status"], ""));
        var prog   = Number(first(p, ["progress", "percent"], 0)) || 0;
        var cAt    = first(p, ["completed_at", "completedAt"], "");
        return status === "completed" || prog >= 100 || !!cAt;
      });

      // View-Items bauen
      var items = completed.map(function (p) {
        var cid = first(p, ["course_id", "courseId", "course"], null);
        var c   = cid ? courseMap[cid] : null;

        var title = c ? first(c, ["title","name"], "Unbekannter Kurs") : "Unbekannter Kurs";
        var level = c ? first(c, ["level","level_name","levelName"], "") : "";
        var dur   = c ? first(c, ["durationH","duration_hours","duration","hours"], "") : "";
        var subtitle = [level, dur ? (dur + " h") : ""].filter(Boolean).join(" · ");

        return {
          courseId: cid || "",
          courseTitle: title,
          courseSubtitle: subtitle,
          progress: Number(first(p, ["progress","percent"], "")) || "",
          completedAt: first(p, ["completed_at","completedAt"], "")
        };
      });

      // Profil-VM setzen
      vm.setProperty("/loggedIn", true);
      vm.setProperty("/user", {
        id: user.id || "",
        name: user.name || user.displayName || user.username || user.email,
        email: user.email || "",
        role: user.role || "user",
        avatar_url: user.avatar_url || "",
        initials: this._initials(user.name || user.email)
      });
      vm.setProperty("/completed", items);
      vm.setProperty("/completedCount", items.length);
    },

    _resolveUser: function (current, users) {
      // versucht den User im master_data.users zu finden; fällt sonst auf localStorage-Objekt zurück
      var email = lower(current.email || "");
      var u = users.find(function (x) {
        return lower(x.email || "") === email;
      }) || current;
      return u;
    },

    _initials: function (s) {
      if (!s) return "AG";
      var base = s.replace(/@.*/, "");
      var parts = base.split(/[.\s_-]+/).filter(Boolean);
      var a = (parts[0]||"").charAt(0);
      var b = (parts[1]||"").charAt(0);
      return (a + b || a || "AG").toUpperCase();
    },

    // ------------------- UI Helpers -------------------
    fmtDate: function (iso) {
      if (!iso) return "";
      try {
        var d = new Date(iso);
        if (isNaN(d)) return iso;
        return d.toLocaleDateString();
      } catch (e) { return iso; }
    },

    // „Zum Login“-Button: einfach Avatar-Popover öffnen (wenn möglich),
    // sonst Hinweis.
    onLoginShortcut: function () {
      try {
        var shell = this.getOwnerComponent().getRootControl().byId("shell");
        if (shell && shell.fireAvatarPressed) {
          shell.fireAvatarPressed(); // öffnet dein bestehendes Login-Popover
          return;
        }
      } catch (e) { /* noop */ }
      MessageToast.show("Klicke oben rechts auf dein Avatar, um dich anzumelden.");
    },

    _getCurrentUser: function () {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); }
      catch (e) { return null; }
    }
  });
});

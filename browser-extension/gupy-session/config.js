"use strict";
var EmpreGatosPortals = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // shared/browser-connectors.ts
  var browser_connectors_exports = {};
  __export(browser_connectors_exports, {
    browserConnectionMode: () => browserConnectionMode,
    browserConnectors: () => browserConnectors,
    isBrowserSessionPortal: () => isBrowserSessionPortal,
    sessionDomain: () => sessionDomain
  });
  var browserConnectors = {
    gupy: {
      name: "Gupy",
      domains: ["gupy.io"],
      accountUrl: "https://portal.gupy.io/my/applications",
      signedSelector: '#header-message-icon, a[href*="logout"], a[href*="signout"], button[aria-label*="Abrir menu de usu\xE1rio"]'
    },
    infojobs: {
      name: "InfoJobs",
      domains: ["infojobs.com.br"],
      accountUrl: "https://www.infojobs.com.br/candidate/",
      signedSelector: 'a[href*="Logout"], a[href*="logout"], a[href*="Candidate/CV"], a[href*="candidate/cv"]'
    },
    glassdoor: {
      name: "Glassdoor",
      domains: ["glassdoor.com", "glassdoor.com.br"],
      accountUrl: "https://www.glassdoor.com/member/profile/",
      signedSelector: 'a[href*="logout"], a[href*="signout"], [data-test="user-profile-menu"]'
    },
    linkedin: {
      name: "LinkedIn",
      domains: ["linkedin.com"],
      accountUrl: "https://www.linkedin.com/feed/",
      // The current feed no longer exposes global-nav classes. Require both
      // private-navigation links and an expandable avatar menu, not any photo.
      signedSelector: '.global-nav__me, .global-nav__me-photo, .global-nav__primary-link-me-menu-trigger, body:has(a[href*="/messaging/"]):has(a[href*="/mynetwork/"]) button[aria-expanded]:has(img)'
    }
  };
  var browserConnectionMode = (portal) => portal === "linkedin" ? "local-browser" : "cloud-session";
  var isBrowserSessionPortal = (value) => Object.hasOwn(browserConnectors, value);
  function sessionDomain(portal, domain) {
    const host = domain.replace(/^\./, "").toLowerCase();
    return /^[a-z0-9.-]+$/.test(host) && browserConnectors[portal].domains.some((root) => host === root || host.endsWith("." + root));
  }
  return __toCommonJS(browser_connectors_exports);
})();

/*
  Runs before every test file: the browser features jsdom does not have, and the fake API in place of the backend.
*/
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import api from "@/api/api";
import { store } from "@/app/store";
import { baseApi } from "@/api/baseApi";
import { fakeAdapter, resetFakeApi } from "./fakeApi";

// what jsdom leaves out and the screens (or motion / charts) use
window.matchMedia ??= (query) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false });
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
Element.prototype.scrollIntoView ??= function () {};
window.scrollTo = () => {};

api.defaults.adapter = fakeAdapter;

beforeEach(() => {
  resetFakeApi();
  store.dispatch(baseApi.util.resetApiState());
  sessionStorage.clear();
});
afterEach(cleanup);
